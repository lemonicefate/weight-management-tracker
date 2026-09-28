import { isIP } from 'node:net';
import { badRequest } from '../../errors.js';

function privateIpv4(address) {
  if (isIP(address) !== 4) return false;
  const octets = address.split('.').map(Number);
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254);
}

export function validateDeviceAddress(address) {
  if (typeof address !== 'string' || !privateIpv4(address.trim())) {
    throw badRequest('HOANBOY device must use a private IPv4 address on the clinic network.');
  }
  return address.trim();
}

export class HoanboyDeviceReader {
  constructor(address, fetchImplementation = fetch) {
    this.address = validateDeviceAddress(address);
    this.fetch = fetchImplementation;
    this.baseUrl = 'http://' + this.address + ':8080/';
  }

  async get(route) {
    const response = await this.fetch(new URL(route, this.baseUrl), {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('HOANBOY device request failed.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 64 * 1024 * 1024) throw new Error('HOANBOY device response exceeded the size limit.');
    let payload;
    try {
      payload = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new Error('HOANBOY device returned invalid JSON.');
    }
    if (!payload || typeof payload !== 'object' || payload.isSuccessful !== true) {
      throw new Error('HOANBOY device response was not successful.');
    }
    return payload;
  }

  async synchronize() {
    const tables = await this.get('getTableList?database=heer_scale.db');
    if (!Array.isArray(tables.rows) || !tables.rows.includes('bodyparm')) {
      throw new Error('HOANBOY source table is unavailable.');
    }
    const first = await this.get('getAllDataFromTheTable?tableName=bodyparm');
    const second = await this.get('getAllDataFromTheTable?tableName=bodyparm');
    if (JSON.stringify(first.tableInfos) !== JSON.stringify(second.tableInfos)) {
      throw new Error('HOANBOY source schema changed during read.');
    }
    return second;
  }

  async health() {
    const result = await this.get('getTableList?database=heer_scale.db');
    return { available: Array.isArray(result.rows) && result.rows.includes('bodyparm') };
  }
}
