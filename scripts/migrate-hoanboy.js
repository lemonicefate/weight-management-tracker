import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from '../src/config.js';
import { createDatabaseManager } from '../src/db.js';
import { createEncryptedFileBackup } from '../src/backup/service.js';
import { migrateHoanboyDatabase } from '../src/integrations/hoanboy/migration.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const sourceInput = argument('--source');
const actorId = Number(argument('--actor-id'));
if (!sourceInput || !Number.isSafeInteger(actorId) || actorId < 1) {
  process.stderr.write('Usage: npm run migrate:hoanboy -- --source <database-file> --actor-id <active-admin-id>\n');
  process.exitCode = 2;
} else if (!config.backupPassphrase || config.backupPassphrase.length < 20) {
  process.stderr.write('Set WMT_BACKUP_PASSPHRASE on the host before importing clinic data.\n');
  process.exitCode = 2;
} else {
  const manager = await createDatabaseManager(config.databasePath);
  try {
    const actor = manager.database.prepare(
      "SELECT id, role, active FROM users WHERE id = ? AND role = 'admin' AND active = 1"
    ).get(actorId);
    if (!actor) throw new Error('The selected actor must be an active administrator.');
    const sourcePath = resolve(sourceInput);
    const backupBytes = await createEncryptedFileBackup(sourcePath, config.backupPassphrase, config.dataDirectory);
    const backupDirectory = resolve(config.dataDirectory, 'backups');
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backupName = 'hoanboy-source-' + randomUUID() + '.wmsource';
    await writeFile(resolve(backupDirectory, backupName), backupBytes, { mode: 0o600, flag: 'wx' });
    const result = migrateHoanboyDatabase(sourcePath, manager.database, actor);
    process.stdout.write(JSON.stringify({ ...result, sourceBackupName: backupName }) + '\n');
  } catch {
    process.stderr.write('HOANBOY migration failed. The source was not modified; check its supported schema and retry.\n');
    process.exitCode = 1;
  } finally {
    manager.close();
  }
}
