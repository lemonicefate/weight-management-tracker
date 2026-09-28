import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from './errors.js';
import { hasPermission, roles, userView } from './domain/roles.js';
import { symptomCatalog } from './domain/symptoms.js';
import { medicationCatalog, treatmentChangeTypes } from './domain/medications.js';
import { createSession, cookieHeader, clearedCookieHeader, readSessionToken, resolveSession, revokeSession } from './identity/sessions.js';
import { verifyPassword } from './identity/passwords.js';
import { createUser, listUsers, updateUser } from './identity/users.js';
import {
  assignBaseline,
  closeEpisode,
  completeEncounter,
  continuePreviousRegimen,
  createEncounter,
  createPatient,
  deleteEmptyDraft,
  getEncounter,
  listPatients,
  patientHistory,
  reopenEncounter,
  startEpisode,
  updateEncounter,
  updateRegimen
} from './clinical.js';
import {
  createEncryptedDatabaseBackup,
  createEncryptedFileBackup,
  verifyApplicationDatabase
} from './backup/service.js';
import { decryptBackup } from './backup/archive.js';
import { linkMeasurement, measurementDetails, reportContent, unlinkMeasurement } from './body-composition/workflow.js';
import {
  createHoanboyAdapter,
  getHoanboyAdminConfiguration,
  updateHoanboyDeviceIp,
  updateHoanboyMapping
} from './integrations/hoanboy/adapter.js';
import { migrateHoanboyDatabase } from './integrations/hoanboy/migration.js';
import { parseJson } from './db.js';

const loginAttempts = new Map();
const loginWindowMs = 10 * 60 * 1000;
const loginMaxAttempts = 5;

function writeJson(response, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(body);
}

function writeBinary(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Length': value.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(value);
}

function parseCookies(request) {
  return request.headers.cookie || '';
}

function requestRoute(method, pathname) {
  if (method === 'GET' && pathname === '/api/health') return 'health';
  if (pathname.startsWith('/api/')) return pathname.replace(/\d+/g, ':id').replace(/[^/]+$/g, (part) => {
    if (part === 'patients' || part === 'episodes' || part === 'encounters' || part === 'users' ||
        part === 'audit' || part === 'config' || part === 'health' || part === 'session' || part === 'login' ||
        part === 'logout' || part === 'sync' || part === 'candidates' || part === 'backup' || part === 'restore' ||
        part === 'complete' || part === 'reopen' || part === 'regimen' || part === 'continue' ||
        part === 'body-composition' || part === 'links' || part === 'device' || part === 'mappings' ||
        part === 'reports' || part === 'meta') return part;
    return ':id';
  });
  return 'static';
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) throw forbidden('A same-origin browser request is required.');
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw forbidden('Request origin is invalid.');
  }
  if (parsed.host.toLowerCase() !== String(request.headers.host || '').toLowerCase() ||
      !['http:', 'https:'].includes(parsed.protocol)) {
    throw forbidden('Cross-origin requests are not allowed.');
  }
}

async function readBytes(request, maximum, requiredContentType = null) {
  if (requiredContentType && !String(request.headers['content-type'] || '').toLowerCase().startsWith(requiredContentType)) {
    throw new AppError(415, 'unsupported_media_type', 'The uploaded file type is not supported.');
  }
  const declared = Number(request.headers['content-length'] || 0);
  if (declared > maximum) throw new AppError(413, 'request_too_large', 'The request exceeds the supported size.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw new AppError(413, 'request_too_large', 'The request exceeds the supported size.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function readJson(request, maximum) {
  const bytes = await readBytes(request, maximum, 'application/json');
  if (!bytes.length) return {};
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
    return value;
  } catch {
    throw badRequest('Request body must be a valid JSON object.');
  }
}

function routeId(match, index = 1) {
  const value = Number(match[index]);
  if (!Number.isSafeInteger(value) || value < 1) throw notFound();
  return value;
}

function requirePermission(user, permission) {
  if (!hasPermission(user.role, permission)) throw forbidden();
}

function auditAdmin(database, entityType, entityId, action, actor, before, after) {
  database.prepare(
    'INSERT INTO audit_events(entity_type, entity_id, action, actor_user_id, at, before_snapshot, after_snapshot) VALUES(?, ?, ?, ?, ?, ?, ?)'
  ).run(entityType, String(entityId), action, actor.id, new Date().toISOString(),
    before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after));
}

function loginAllowed(address) {
  const now = Date.now();
  const current = loginAttempts.get(address);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(address, { count: 0, resetAt: now + loginWindowMs });
    return true;
  }
  return current.count < loginMaxAttempts;
}

function recordLoginFailure(address) {
  const now = Date.now();
  const current = loginAttempts.get(address);
  if (!current || current.resetAt <= now) loginAttempts.set(address, { count: 1, resetAt: now + loginWindowMs });
  else current.count += 1;
}

function resetLoginFailures(address) {
  loginAttempts.delete(address);
}

function requireConfiguredBackup(config) {
  if (!config.backupPassphrase || config.backupPassphrase.length < 20) {
    throw new AppError(503, 'backup_not_configured', 'Protected backup is unavailable until an administrator configures its passphrase on the host.');
  }
}

function numberParameter(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw badRequest(label + ' is invalid.');
  return id;
}

function mapAuditRows(database, limit) {
  return database.prepare(
    'SELECT a.*, u.display_name AS actor_name FROM audit_events a JOIN users u ON u.id = a.actor_user_id ORDER BY a.at DESC, a.id DESC LIMIT ?'
  ).all(limit).map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor_name,
    at: row.at,
    before: parseJson(row.before_snapshot, null),
    after: parseJson(row.after_snapshot, null),
    reason: row.reason
  }));
}

export function createApplication(options) {
  const { manager, config } = options;
  let adapter = options.adapter || createHoanboyAdapter(manager.database, config.hoanboyDeviceIp);
  let maintenance = false;
  let activeRequests = 0;
  let maintenanceWaiters = [];
  const adapterWasInjected = Boolean(options.adapter);

  async function enterMaintenance() {
    if (maintenance) throw new AppError(503, 'maintenance', 'The application is restoring clinic data. Try again shortly.');
    maintenance = true;
    if (activeRequests <= 1) return;
    await new Promise((resolve) => maintenanceWaiters.push(resolve));
  }

  return async function handleApi(request, response) {
    const startedAt = Date.now();
    const requestId = randomUUID();
    let route = 'unmatched';
    let status = 500;
    let countedRequest = false;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(request.url, 'http://' + (request.headers.host || 'localhost'));
      route = requestRoute(request.method, url.pathname);
      const database = manager.database;

      if (request.method === 'GET' && url.pathname === '/api/health') {
        status = 200;
        return writeJson(response, status, { ok: true });
      }
      if (maintenance) throw new AppError(503, 'maintenance', 'The application is restoring clinic data. Try again shortly.');
      activeRequests += 1;
      countedRequest = true;

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        assertSameOrigin(request);
        const body = await readJson(request, config.maxJsonBytes);
        const address = request.socket.remoteAddress || 'unknown';
        if (!loginAllowed(address)) throw new AppError(429, 'login_throttled', 'Too many sign-in attempts. Wait before trying again.');
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const user = database.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
        const valid = await verifyPassword(typeof body.password === 'string' ? body.password : '', user?.password_hash);
        if (!user || !user.active || !valid) {
          recordLoginFailure(address);
          throw unauthorized('Username or password is incorrect.');
        }
        resetLoginFailures(address);
        const token = createSession(database, user.id, config);
        status = 200;
        return writeJson(response, status, { user: userView(user) }, { 'Set-Cookie': cookieHeader(token, config) });
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        assertSameOrigin(request);
        revokeSession(database, readSessionToken(request));
        status = 200;
        return writeJson(response, status, { signedOut: true }, { 'Set-Cookie': clearedCookieHeader(config) });
      }

      const token = readSessionToken(request);
      const user = resolveSession(database, token, config);
      if (!user) throw unauthorized();

      if (request.method === 'GET' && url.pathname === '/api/auth/session') {
        status = 200;
        return writeJson(response, status, { user: userView(user) });
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);

      if (request.method === 'GET' && url.pathname === '/api/meta') {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, {
          symptoms: symptomCatalog,
          medications: medicationCatalog,
          treatmentChangeTypes,
          roles: [
            { value: roles.doctor, label: 'Doctor' },
            { value: roles.nurse, label: 'Nurse / clinic staff' },
            { value: roles.admin, label: 'Administrator' }
          ],
          closureReasons: [
            { value: 'goal_achieved', label: 'Goal achieved' },
            { value: 'stops_treatment', label: 'Patient stops treatment' },
            { value: 'adverse_effects', label: 'Adverse effects' },
            { value: 'other', label: 'Other' }
          ],
          permissions: {
            canManageEpisodes: hasPermission(user.role, 'episode:manage'),
            canCompleteEncounters: hasPermission(user.role, 'encounter:complete'),
            canCorrectEncounters: hasPermission(user.role, 'encounter:correct'),
            canManageMedication: hasPermission(user.role, 'medication:manage'),
            canLinkBodyComposition: hasPermission(user.role, 'body-composition:link'),
            canAdminister: hasPermission(user.role, 'user:read')
          }
        });
      }

      if (request.method === 'GET' && url.pathname === '/api/doctors') {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, {
          doctors: database.prepare("SELECT id, display_name AS displayName FROM users WHERE role = 'doctor' AND active = 1 ORDER BY display_name COLLATE NOCASE").all()
        });
      }

      if (request.method === 'GET' && url.pathname === '/api/patients') {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, { patients: listPatients(database, url.searchParams.get('q') || '') });
      }
      if (request.method === 'POST' && url.pathname === '/api/patients') {
        requirePermission(user, 'patient:create');
        const patient = createPatient(database, await readJson(request, config.maxJsonBytes), user);
        status = 201;
        return writeJson(response, status, { patient });
      }
      let match = url.pathname.match(/^\/api\/patients\/(\d+)$/);
      if (request.method === 'GET' && match) {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, patientHistory(database, routeId(match)));
      }
      match = url.pathname.match(/^\/api\/patients\/(\d+)\/episodes$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'episode:manage');
        status = 201;
        return writeJson(response, status, { episode: startEpisode(database, routeId(match), user) });
      }
      match = url.pathname.match(/^\/api\/episodes\/(\d+)\/close$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'episode:manage');
        status = 200;
        return writeJson(response, status, { episode: closeEpisode(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      match = url.pathname.match(/^\/api\/episodes\/(\d+)\/baseline$/);
      if (request.method === 'PUT' && match) {
        requirePermission(user, 'episode:manage');
        status = 200;
        return writeJson(response, status, { episode: assignBaseline(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      match = url.pathname.match(/^\/api\/patients\/(\d+)\/encounters$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'encounter:create');
        status = 201;
        return writeJson(response, status, { encounter: createEncounter(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)$/);
      if (request.method === 'GET' && match) {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, { encounter: getEncounter(database, routeId(match)) });
      }
      if (request.method === 'PATCH' && match) {
        requirePermission(user, 'encounter:edit');
        status = 200;
        return writeJson(response, status, { encounter: updateEncounter(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      if (request.method === 'DELETE' && match) {
        requirePermission(user, 'encounter:edit');
        status = 200;
        return writeJson(response, status, deleteEmptyDraft(database, routeId(match), await readJson(request, config.maxJsonBytes), user));
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)\/complete$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'encounter:complete');
        status = 200;
        return writeJson(response, status, { encounter: completeEncounter(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)\/reopen$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'encounter:correct');
        status = 200;
        return writeJson(response, status, { encounter: reopenEncounter(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)\/regimen$/);
      if (request.method === 'PUT' && match) {
        requirePermission(user, 'medication:manage');
        status = 200;
        return writeJson(response, status, { encounter: updateRegimen(database, routeId(match), await readJson(request, config.maxJsonBytes), user) });
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)\/regimen\/continue$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'medication:manage');
        status = 200;
        return writeJson(response, status, continuePreviousRegimen(database, routeId(match), await readJson(request, config.maxJsonBytes), user));
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)\/body-composition-links$/);
      if (request.method === 'POST' && match) {
        requirePermission(user, 'body-composition:link');
        status = 200;
        return writeJson(response, status, linkMeasurement(database, routeId(match), await readJson(request, config.maxJsonBytes), user));
      }
      match = url.pathname.match(/^\/api\/encounters\/(\d+)\/body-composition-links\/(\d+)$/);
      if (request.method === 'DELETE' && match) {
        requirePermission(user, 'body-composition:link');
        status = 200;
        return writeJson(response, status, unlinkMeasurement(database, routeId(match, 1), routeId(match, 2), await readJson(request, config.maxJsonBytes), user));
      }

      if (request.method === 'GET' && url.pathname === '/api/body-composition/health') {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, await adapter.health());
      }
      if (request.method === 'POST' && url.pathname === '/api/body-composition/sync') {
        requirePermission(user, 'body-composition:link');
        status = 200;
        return writeJson(response, status, await adapter.synchronize());
      }
      if (request.method === 'GET' && url.pathname === '/api/body-composition/candidates') {
        requirePermission(user, 'patient:read');
        const patientId = numberParameter(url.searchParams.get('patientId'), 'Patient');
        patientHistory(database, patientId);
        status = 200;
        return writeJson(response, status, { candidates: await adapter.listCandidates(patientId) });
      }
      match = url.pathname.match(/^\/api\/body-composition\/measurements\/(\d+)$/);
      if (request.method === 'GET' && match) {
        requirePermission(user, 'patient:read');
        status = 200;
        return writeJson(response, status, { measurement: measurementDetails(database, routeId(match)) });
      }
      match = url.pathname.match(/^\/api\/reports\/(\d+)$/);
      if (request.method === 'GET' && match) {
        requirePermission(user, 'patient:read');
        const report = reportContent(database, routeId(match));
        const content = Buffer.from(report.content);
        status = 200;
        response.writeHead(status, {
          'Content-Type': report.media_type || 'text/html; charset=utf-8',
          'Content-Length': content.length,
          'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        });
        return response.end(content);
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/users') {
        requirePermission(user, 'user:read');
        status = 200;
        return writeJson(response, status, { users: listUsers(database) });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/users') {
        requirePermission(user, 'config:manage');
        const input = await readJson(request, config.maxJsonBytes);
        const created = await createUser(database, input);
        auditAdmin(database, 'user', created.id, 'created', user, null, {
          username: created.username, role: created.role, active: Boolean(created.active)
        });
        status = 201;
        return writeJson(response, status, { user: userView(created) });
      }
      match = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
      if (request.method === 'PATCH' && match) {
        requirePermission(user, 'config:manage');
        const id = routeId(match);
        const before = database.prepare('SELECT id, username, display_name, role, active FROM users WHERE id = ?').get(id);
        const updated = await updateUser(database, id, await readJson(request, config.maxJsonBytes), user.id);
        auditAdmin(database, 'user', id, 'updated', user, before, updated);
        status = 200;
        return writeJson(response, status, { user: updated });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
        requirePermission(user, 'audit:read');
        const requested = Number(url.searchParams.get('limit') || 200);
        const limit = Math.max(1, Math.min(500, Number.isInteger(requested) ? requested : 200));
        status = 200;
        return writeJson(response, status, { events: mapAuditRows(database, limit) });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/config') {
        requirePermission(user, 'config:manage');
        status = 200;
        return writeJson(response, status, {
          hoanboy: getHoanboyAdminConfiguration(database, config.hoanboyDeviceIp),
          medicationCatalog
        });
      }
      if (request.method === 'PUT' && url.pathname === '/api/admin/config/hoanboy/device') {
        requirePermission(user, 'config:manage');
        const body = await readJson(request, config.maxJsonBytes);
        if (typeof body.deviceIp !== 'string') throw badRequest('Device IP must be text.');
        const before = getHoanboyAdminConfiguration(database, config.hoanboyDeviceIp);
        updateHoanboyDeviceIp(database, body.deviceIp, user.id);
        auditAdmin(database, 'configuration', 'hoanboy_device', 'updated', user, { configured: before.deviceConfigured },
          { configured: Boolean(body.deviceIp.trim()) });
        status = 200;
        return writeJson(response, status, { hoanboy: getHoanboyAdminConfiguration(database, config.hoanboyDeviceIp) });
      }
      if (request.method === 'PUT' && url.pathname === '/api/admin/config/hoanboy/mappings') {
        requirePermission(user, 'config:manage');
        const body = await readJson(request, config.maxJsonBytes);
        const before = getHoanboyAdminConfiguration(database, config.hoanboyDeviceIp);
        const current = updateHoanboyMapping(database, body.mappings, user.id);
        auditAdmin(database, 'configuration', 'hoanboy_mappings', 'updated', user,
          { verifiedCount: before.hoanboy?.mappings?.filter((mapping) => mapping.verified).length || 0 },
          { verifiedCount: current.mappings.filter((mapping) => mapping.verified).length });
        status = 200;
        return writeJson(response, status, { hoanboy: current });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/backups') {
        requirePermission(user, 'backup:manage');
        requireConfiguredBackup(config);
        let backupBytes;
        try {
          backupBytes = await createEncryptedDatabaseBackup(database, config.backupPassphrase, config.dataDirectory);
        } catch {
          throw new AppError(500, 'backup_failed', 'Protected backup creation failed. No downloadable backup was created.');
        }
        status = 200;
        return writeBinary(response, status, backupBytes, {
          'Content-Type': 'application/vnd.weight-management-tracker.backup',
          'Content-Disposition': 'attachment; filename="weight-management-backup.wmtbackup"'
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/restore') {
        requirePermission(user, 'backup:manage');
        requireConfiguredBackup(config);
        const archive = await readBytes(request, config.maxImportBytes, 'application/vnd.weight-management-tracker.backup');
        let plaintext;
        try {
          plaintext = decryptBackup(archive, config.backupPassphrase);
        } catch {
          throw badRequest('Backup could not be decrypted or authenticated. The current database was not changed.', 'invalid_backup');
        }
        const directory = await mkdtemp(join(dirname(resolve(manager.databasePath)), '.wmt-restore-'));
        const snapshotPath = join(directory, 'restore.sqlite');
        try {
          await writeFile(snapshotPath, plaintext, { mode: 0o600, flag: 'wx' });
          try {
            verifyApplicationDatabase(snapshotPath);
            const staged = new DatabaseSync(snapshotPath, { readOnly: true, timeout: 5000 });
            let activeAdministrator;
            try {
              activeAdministrator = staged.prepare(
                "SELECT id FROM users WHERE id = ? AND role = 'admin' AND active = 1"
              ).get(user.id);
            } finally {
              staged.close();
            }
            if (!activeAdministrator) throw badRequest('The backup does not contain this active administrator; the current database was not changed.', 'restore_actor_missing');
            await enterMaintenance();
            try {
              try {
                await manager.replaceFromSnapshot(snapshotPath, user.id);
              } finally {
                if (!adapterWasInjected) adapter = createHoanboyAdapter(manager.database, config.hoanboyDeviceIp);
              }
            } finally {
              maintenance = false;
            }
          } catch (error) {
            if (error instanceof AppError) throw error;
            throw badRequest('Backup validation or restore failed. The current database remains active.', 'restore_failed');
          }
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
        status = 200;
        return writeJson(response, status, { restored: true, signedInAgainRequired: true }, {
          'Set-Cookie': clearedCookieHeader(config)
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/migrate/hoanboy') {
        requirePermission(user, 'migration:manage');
        requireConfiguredBackup(config);
        const file = await readBytes(request, config.maxImportBytes, 'application/vnd.sqlite3');
        if (!file.length) throw badRequest('Choose a HOANBOY SQLite database file.');
        const directory = await mkdtemp(join(config.dataDirectory, '.wmt-migration-'));
        const sourcePath = join(directory, 'source.sqlite');
        let sourceBackupPath = null;
        try {
          await writeFile(sourcePath, file, { mode: 0o600, flag: 'wx' });
          let encryptedSourceBackup;
          try {
            encryptedSourceBackup = await createEncryptedFileBackup(sourcePath, config.backupPassphrase, config.dataDirectory);
          } catch {
            throw badRequest('The uploaded source could not be safely backed up. No history was imported.', 'source_backup_failed');
          }
          const backupDirectory = join(config.dataDirectory, 'backups');
          await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
          sourceBackupPath = join(backupDirectory, 'hoanboy-source-' + randomUUID() + '.wmsource');
          await writeFile(sourceBackupPath, encryptedSourceBackup, { mode: 0o600, flag: 'wx' });
          let result;
          try {
            result = migrateHoanboyDatabase(sourcePath, manager.database, user);
          } catch (error) {
            if (error instanceof AppError) throw error;
            throw badRequest('HOANBOY import validation failed. No Patient, measurement or report rows were committed.', 'migration_failed');
          }
          status = 200;
          return writeJson(response, status, {
            ...result,
            sourceBackupStored: true,
            sourceBackupName: sourceBackupPath.split(/[\\/]/).pop()
          });
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }

      throw notFound('API route not found.');
    } catch (error) {
      const appError = error instanceof AppError ? error : null;
      status = appError?.status || 500;
      const safeMessage = appError?.message || 'The request could not be completed.';
      if (!appError) {
        process.stderr.write(JSON.stringify({ level: 'error', requestId, route, errorType: error?.name || 'Error' }) + '\n');
      }
      if (!response.headersSent) {
        writeJson(response, status, {
          error: {
            code: appError?.code || 'internal_error',
            message: safeMessage,
            ...(appError?.details ? { details: appError.details } : {})
          }
        });
      } else {
        response.destroy();
      }
    } finally {
      if (countedRequest) {
        activeRequests -= 1;
        if (maintenance && activeRequests <= 1) {
          const waiters = maintenanceWaiters;
          maintenanceWaiters = [];
          for (const resolve of waiters) resolve();
        }
      }
      process.stdout.write(JSON.stringify({
        level: 'info',
        requestId,
        method: request.method,
        route,
        status,
        durationMs: Date.now() - startedAt
      }) + '\n');
    }
  };
}
