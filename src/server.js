import { createServer as createHttpServer } from 'node:http';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { config as defaultConfig } from './config.js';
import { createApplication } from './application.js';
import { createDatabaseManager } from './db.js';
import { ensureBootstrapAdmin } from './identity/users.js';

const webDirectory = join(dirname(fileURLToPath(import.meta.url)), 'web');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

async function cleanTemporaryArtifacts(directories) {
  const appDirectories = new Map();
  function include(directory, prefixes) {
    if (!directory) return;
    const key = resolve(directory);
    appDirectories.set(key, [...new Set([...(appDirectories.get(key) || []), ...prefixes])]);
  }
  include(directories.dataDirectory, ['.wmt-backup-', '.wmt-source-backup-', '.wmt-migration-']);
  include(directories.databaseDirectory, ['.wmt-restore-']);
  for (const [directory, prefixes] of appDirectories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && prefixes.some((prefix) => entry.name.startsWith(prefix)))
      .map((entry) => rm(join(directory, entry.name), { recursive: true, force: true })));
  }
}

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader('Cache-Control', 'no-store');
}

async function serveStatic(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { 'Allow': 'GET, HEAD' });
    response.end();
    return;
  }
  const url = new URL(request.url, 'http://' + (request.headers.host || 'localhost'));
  const file = staticFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found.');
    return;
  }
  const bytes = await readFile(join(webDirectory, file[0]));
  response.writeHead(200, {
    'Content-Type': file[1],
    'Content-Length': bytes.length,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Cache-Control': 'no-store'
  });
  response.end(request.method === 'HEAD' ? undefined : bytes);
}

export async function createClinicServer(options = {}) {
  const runtimeConfig = options.config || defaultConfig;
  await mkdir(runtimeConfig.dataDirectory, { recursive: true, mode: 0o700 });
  const manager = options.manager || await createDatabaseManager(runtimeConfig.databasePath);
  await cleanTemporaryArtifacts({
    dataDirectory: runtimeConfig.dataDirectory,
    databaseDirectory: runtimeConfig.databasePath === ':memory:' ? null : dirname(resolve(runtimeConfig.databasePath))
  });
  await ensureBootstrapAdmin(
    manager.database,
    runtimeConfig.bootstrapAdminUsername,
    runtimeConfig.bootstrapAdminPassword
  );
  runtimeConfig.bootstrapAdminUsername = '';
  runtimeConfig.bootstrapAdminPassword = '';
  delete process.env.WMT_BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.WMT_BOOTSTRAP_ADMIN_PASSWORD;
  manager.database.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL')
    .run(new Date().toISOString());

  const api = createApplication({
    manager,
    config: runtimeConfig,
    adapter: options.adapter
  });
  const server = createHttpServer(async (request, response) => {
    securityHeaders(response);
    try {
      if (request.url.startsWith('/api/')) {
        await api(request, response);
      } else {
        await serveStatic(request, response);
      }
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end('The request could not be completed.');
      } else {
        response.destroy();
      }
    }
  });
  server.manager = manager;
  server.runtimeConfig = runtimeConfig;
  return server;
}

async function main() {
  let server;
  try {
    server = await createClinicServer();
    server.listen(server.runtimeConfig.port, server.runtimeConfig.host, () => {
      process.stdout.write(JSON.stringify({
        level: 'info',
        event: 'server_started',
        host: server.runtimeConfig.host,
        port: server.runtimeConfig.port
      }) + '\n');
    });
    const shutdown = () => {
      server.close(() => {
        server.manager.close();
        process.exit(0);
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    process.stderr.write(JSON.stringify({ level: 'error', event: 'startup_failed', errorType: error?.name || 'Error' }) + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
