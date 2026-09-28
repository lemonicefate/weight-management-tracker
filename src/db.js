import { access, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { verifyApplicationDatabase } from './backup/service.js';

const initialMigrationPath = fileURLToPath(new URL('../migrations/001_initial.sql', import.meta.url));

export async function openDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    await mkdir(dirname(resolve(databasePath)), { recursive: true, mode: 0o700 });
  }

  const database = new DatabaseSync(databasePath, { timeout: 5000 });
  database.exec('PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = 5000;');
  if (databasePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL;');
  await migrateDatabase(database);
  return database;
}

export async function migrateDatabase(database) {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;');
  const existing = database.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (existing) return;

  const migration = await readFile(initialMigrationPath, 'utf8');
  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec(migration);
    database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)').run(new Date().toISOString());
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

export function transaction(database, work) {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = work();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

export class DatabaseManager {
  constructor(database, databasePath) {
    this.database = database;
    this.databasePath = databasePath;
  }

  async replaceFromSnapshot(snapshotPath, actorId) {
    if (this.databasePath === ':memory:') throw new Error('An in-memory database cannot be restored.');
    verifyApplicationDatabase(snapshotPath);
    const staged = new DatabaseSync(snapshotPath, { timeout: 5000 });
    try {
      staged.exec('PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = 5000;');
      const administrator = staged.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'admin' AND active = 1"
      ).get(actorId);
      if (!administrator) throw new Error('The restoring administrator is not active in this backup.');
      transaction(staged, () => {
        staged.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL')
          .run(new Date().toISOString());
        staged.prepare(
          "INSERT INTO audit_events(entity_type, entity_id, action, actor_user_id, at, after_snapshot) VALUES('system', 'backup_restore', 'restore_completed', ?, ?, ?)"
        ).run(actorId, new Date().toISOString(), JSON.stringify({ integrityChecked: true }));
      });
    } finally {
      staged.close();
    }
    verifyApplicationDatabase(snapshotPath);
    const directory = dirname(resolve(this.databasePath));
    const previousPath = resolve(directory, '.restore-previous-' + randomUUID() + '.sqlite');
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    this.database.close();
    let movedPrevious = false;
    try {
      await access(this.databasePath);
      await rename(this.databasePath, previousPath);
      movedPrevious = true;
      await rename(snapshotPath, this.databasePath);
      this.database = await openDatabase(this.databasePath);
    } catch (error) {
      try {
        this.database?.close();
      } catch {
        // The connection may already be closed.
      }
      await rm(this.databasePath, { force: true });
      if (movedPrevious) await rename(previousPath, this.databasePath);
      this.database = await openDatabase(this.databasePath);
      throw error;
    }
    if (movedPrevious) await rm(previousPath, { force: true }).catch(() => {});
    return true;
  }

  close() {
    this.database.close();
  }
}

export async function createDatabaseManager(databasePath) {
  if (databasePath !== ':memory:') await recoverInterruptedRestore(databasePath);
  const database = await openDatabase(databasePath);
  if (databasePath !== ':memory:') await removeObsoleteRestoreSnapshots(databasePath);
  return new DatabaseManager(database, databasePath);
}

async function restoreSnapshotPaths(databasePath) {
  const directory = dirname(resolve(databasePath));
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('.restore-previous-') && entry.name.endsWith('.sqlite'))
    .map((entry) => resolve(directory, entry.name));
  const withTimes = await Promise.all(candidates.map(async (path) => ({ path, modified: (await stat(path)).mtimeMs })));
  return withTimes.sort((left, right) => right.modified - left.modified).map((entry) => entry.path);
}

async function recoverInterruptedRestore(databasePath) {
  const target = resolve(databasePath);
  try {
    await access(target);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  for (const snapshotPath of await restoreSnapshotPaths(databasePath)) {
    try {
      verifyApplicationDatabase(snapshotPath);
    } catch {
      continue;
    }
    await rename(snapshotPath, target);
    return;
  }
}

async function removeObsoleteRestoreSnapshots(databasePath) {
  const target = resolve(databasePath);
  try {
    verifyApplicationDatabase(target);
  } catch {
    return;
  }
  await Promise.all((await restoreSnapshotPaths(databasePath)).map((path) => rm(path, { force: true })));
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
