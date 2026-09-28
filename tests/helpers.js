import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClinicServer } from '../src/server.js';
import { createUser } from '../src/identity/users.js';

export async function startTestServer(t) {
  const directory = await mkdtemp(join(tmpdir(), 'wmt-fictional-test-'));
  const testConfig = {
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    dataDirectory: directory,
    databasePath: join(directory, 'clinic.sqlite'),
    cookieSecure: false,
    bootstrapAdminUsername: 'fictional-admin',
    bootstrapAdminPassword: 'Fictional-Admin-Password-123',
    backupPassphrase: 'Fictional-Backup-Passphrase-0123456789',
    hoanboyDeviceIp: '',
    maxJsonBytes: 1024 * 1024,
    maxImportBytes: 1024 * 1024 * 64,
    sessionIdleMinutes: 30,
    sessionLifetimeHours: 8
  };
  const server = await createClinicServer({ config: testConfig });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    server.manager.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    server,
    get database() { return server.manager.database; },
    config: testConfig,
    baseUrl,
    client: () => createClient(baseUrl),
    createUser: (input) => createUser(server.manager.database, input)
  };
}

export function createClient(baseUrl) {
  let cookie = '';
  return {
    get cookie() {
      return cookie;
    },
    async request(path, options = {}) {
      const headers = {
        Origin: baseUrl,
        Accept: 'application/json',
        ...(options.headers || {})
      };
      if (cookie) headers.Cookie = cookie;
      let body = options.body;
      if (options.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.json);
      }
      const response = await fetch(baseUrl + path, {
        method: options.method || 'GET',
        headers,
        body,
        redirect: 'manual'
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : Buffer.from(await response.arrayBuffer());
      return { response, data, status: response.status };
    },
    async login(username = 'fictional-admin', password = 'Fictional-Admin-Password-123') {
      return this.request('/api/auth/login', { method: 'POST', json: { username, password } });
    }
  };
}

export const fictionalPatient = Object.freeze({
  mrn: '000TEST-001',
  name: 'Fictional Patient One',
  phone: 'TEST-PHONE-001'
});

export const fictionalEncounterWeight = 123.4;
export const fictionalWaist = 198.7;
