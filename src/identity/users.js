import { transaction } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { roles, userView } from '../domain/roles.js';
import { hashPassword, validatePassword } from './passwords.js';

const allowedRoles = new Set(Object.values(roles));

function validateUsername(username) {
  if (typeof username !== 'string') throw badRequest('Username is required.');
  const value = username.trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(value)) {
    throw badRequest('Username must be 3–64 letters, numbers, dots, underscores or hyphens.');
  }
  return value;
}

function validateDisplayName(displayName) {
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 120) {
    throw badRequest('Display name is required and must be 120 characters or fewer.');
  }
  return displayName.trim();
}

export async function createUser(database, input) {
  const username = validateUsername(input.username);
  const displayName = validateDisplayName(input.displayName);
  if (!allowedRoles.has(input.role)) throw badRequest('Choose doctor, nurse/clinic staff or admin.');
  validatePassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  try {
    const result = database.prepare(
      'INSERT INTO users(username, display_name, role, password_hash, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)'
    ).run(username, displayName, input.role, passwordHash, now, now);
    return database.prepare('SELECT id, username, display_name, role, active FROM users WHERE id = ?').get(result.lastInsertRowid);
  } catch (error) {
    if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/i.test(error.message)) {
      throw conflict('A user with that username already exists.');
    }
    throw error;
  }
}

export async function ensureBootstrapAdmin(database, username, password) {
  const count = database.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 0) return false;
  if (!username || !password) {
    throw new Error('No administrator exists. Set WMT_BOOTSTRAP_ADMIN_USERNAME and WMT_BOOTSTRAP_ADMIN_PASSWORD for first startup.');
  }
  await createUser(database, {
    username,
    displayName: 'Clinic administrator',
    role: 'admin',
    password
  });
  return true;
}

export async function updateUser(database, userId, input, actorId) {
  const existing = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existing) throw notFound('User not found.');
  const displayName = input.displayName === undefined ? existing.display_name : validateDisplayName(input.displayName);
  const role = input.role === undefined ? existing.role : input.role;
  if (!allowedRoles.has(role)) throw badRequest('Choose doctor, nurse/clinic staff or admin.');
  const active = input.active === undefined ? Boolean(existing.active) : input.active === true;
  if (existing.role === 'admin' && (role !== 'admin' || !active)) {
    const administrators = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
    if (administrators < 2) throw conflict('Create or activate another administrator before changing this account.');
  }
  if (input.password !== undefined) validatePassword(input.password);
  const nextPasswordHash = input.password === undefined ? existing.password_hash : await hashPassword(input.password);
  const now = new Date().toISOString();
  transaction(database, () => {
    database.prepare(
      'UPDATE users SET display_name = ?, role = ?, active = ?, password_hash = ?, updated_at = ? WHERE id = ?'
    ).run(displayName, role, Number(active), nextPasswordHash, now, userId);
    if (role !== existing.role || !active || input.password !== undefined) {
      database.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId);
    }
  });
  const updated = database.prepare('SELECT id, username, display_name, role, active FROM users WHERE id = ?').get(userId);
  return userView(updated);
}

export function listUsers(database) {
  return database.prepare(
    'SELECT id, username, display_name, role, active, created_at, updated_at FROM users ORDER BY username COLLATE NOCASE'
  ).all().map(userView);
}
