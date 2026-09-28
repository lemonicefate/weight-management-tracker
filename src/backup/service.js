import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { encryptBackup, decryptBackup } from './archive.js';

export async function createEncryptedDatabaseBackup(database, passphrase, temporaryRoot) {
  const root = temporaryRoot || tmpdir();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, '.wmt-backup-'));
  const snapshotPath = join(directory, 'snapshot.sqlite');
  try {
    await backup(database, snapshotPath, { rate: 128 });
    const snapshot = await readFile(snapshotPath);
    return encryptBackup(snapshot, passphrase);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function createEncryptedFileBackup(sourcePath, passphrase, temporaryRoot) {
  const root = temporaryRoot || tmpdir();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, '.wmt-source-backup-'));
  const snapshotPath = join(directory, 'source-snapshot.sqlite');
  let source;
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 });
    await backup(source, snapshotPath, { rate: 128 });
    const snapshot = await readFile(snapshotPath);
    return encryptBackup(snapshot, passphrase);
  } finally {
    source?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export async function writePlaintextSnapshot(archive, passphrase, path) {
  const plaintext = decryptBackup(archive, passphrase);
  await writeFile(path, plaintext, { mode: 0o600, flag: 'wx' });
  return plaintext.length;
}

export function verifyApplicationDatabase(path) {
  const database = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get();
    if (integrity.integrity_check !== 'ok') throw new Error('Backup database failed the SQLite integrity check.');
    const foreignKeyIssue = database.prepare('PRAGMA foreign_key_check').get();
    if (foreignKeyIssue) throw new Error('Backup database contains an invalid relationship.');
    const version = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version;
    const users = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    const patients = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'patients'").get();
    if (version !== 1 || !users || !patients) throw new Error('Backup database schema is not supported.');
    return true;
  } finally {
    database.close();
  }
}
