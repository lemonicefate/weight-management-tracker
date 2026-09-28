import { resolve } from 'node:path';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const dataDirectory = resolve(process.env.WMT_DATA_DIR || './private');

export const config = {
  environment: process.env.NODE_ENV || 'development',
  host: process.env.WMT_HOST || '127.0.0.1',
  port: Number(process.env.WMT_PORT || 3000),
  dataDirectory,
  databasePath: resolve(process.env.WMT_DATABASE_PATH || dataDirectory + '/clinic.sqlite'),
  cookieSecure: envBoolean('WMT_COOKIE_SECURE', process.env.NODE_ENV === 'production'),
  bootstrapAdminUsername: process.env.WMT_BOOTSTRAP_ADMIN_USERNAME || '',
  bootstrapAdminPassword: process.env.WMT_BOOTSTRAP_ADMIN_PASSWORD || '',
  backupPassphrase: process.env.WMT_BACKUP_PASSPHRASE || '',
  hoanboyDeviceIp: process.env.HOANBOY_DEVICE_IP || '',
  maxJsonBytes: 1024 * 1024,
  maxImportBytes: 1024 * 1024 * 1024,
  sessionIdleMinutes: 30,
  sessionLifetimeHours: 8
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('WMT_PORT must be a valid TCP port.');
}
if (config.environment === 'production' && !config.cookieSecure) {
  throw new Error('WMT_COOKIE_SECURE must be true in production.');
}
