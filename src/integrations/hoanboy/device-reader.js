import { createConnection, isIP } from 'node:net';
import { badRequest } from '../../errors.js';

const maximumResponseBytes = 64 * 1024 * 1024;
const maximumHeaderBytes = 16 * 1024;
const responseTimeoutMs = 15000;

function splitResponse(response) {
  const crlfBoundary = response.indexOf(Buffer.from('\r\n\r\n'));
  const lfBoundary = response.indexOf(Buffer.from('\n\n'));
  const useCrlf = crlfBoundary >= 0 && (lfBoundary < 0 || crlfBoundary <= lfBoundary);
  const boundary = useCrlf ? crlfBoundary : lfBoundary;
  const separatorLength = useCrlf ? 4 : 2;
  if (boundary < 0 || boundary > maximumHeaderBytes) {
    throw new Error('HOANBOY device returned an invalid HTTP response.');
  }

  const headerText = response.subarray(0, boundary).toString('latin1');
  if (headerText.replaceAll('\r\n', '').includes('\r')) {
    throw new Error('HOANBOY device returned an invalid HTTP response.');
  }
  const lines = headerText.replaceAll('\r\n', '\n').split('\n');
  const status = lines.shift()?.match(/^HTTP\/1\.[01]\s+(\d{3})(?:[ \t].*)?$/);
  if (!status || Number(status[1]) !== 200) {
    throw new Error('HOANBOY device request failed.');
  }

  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error('HOANBOY device returned invalid HTTP headers.');
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) || headers.has(name)) {
      throw new Error('HOANBOY device returned invalid HTTP headers.');
    }
    headers.set(name, value);
  }

  const body = response.subarray(boundary + separatorLength);
  if (body.length > maximumResponseBytes) {
    throw new Error('HOANBOY device response exceeded the size limit.');
  }
  const contentEncoding = headers.get('content-encoding');
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
    throw new Error('HOANBOY device returned an unsupported content encoding.');
  }

  const transferEncoding = headers.get('transfer-encoding');
  const contentLength = headers.get('content-length');
  if (transferEncoding && contentLength) {
    throw new Error('HOANBOY device returned ambiguous HTTP framing.');
  }
  if (transferEncoding) {
    if (transferEncoding.toLowerCase() !== 'chunked') {
      throw new Error('HOANBOY device returned unsupported HTTP framing.');
    }
    return decodeChunkedBody(body);
  }
  if (contentLength !== undefined) {
    if (!/^(0|[1-9]\d*)$/.test(contentLength) || Number(contentLength) !== body.length) {
      throw new Error('HOANBOY device returned an incomplete HTTP response.');
    }
  }
  return body;
}

function readLine(buffer, offset) {
  const newline = buffer.indexOf(0x0a, offset);
  if (newline < 0) return null;
  const isCrlf = newline > offset && buffer[newline - 1] === 0x0d;
  const end = isCrlf ? newline - 1 : newline;
  return { text: buffer.subarray(offset, end).toString('ascii'), next: newline + 1, isCrlf };
}

function decodeChunkedBody(body) {
  const chunks = [];
  let offset = 0;
  let total = 0;
  while (true) {
    const line = readLine(body, offset);
    if (!line) throw new Error('HOANBOY device returned an incomplete HTTP response.');
    const sizeText = line.text.split(';', 1)[0].trim();
    if (!/^[\da-f]+$/i.test(sizeText)) throw new Error('HOANBOY device returned invalid chunk framing.');
    const size = Number.parseInt(sizeText, 16);
    offset = line.next;
    if (size === 0) {
      while (true) {
        const trailer = readLine(body, offset);
        if (!trailer) throw new Error('HOANBOY device returned incomplete chunk framing.');
        offset = trailer.next;
        if (!trailer.text) {
          if (offset !== body.length) throw new Error('HOANBOY device returned invalid chunk framing.');
          return Buffer.concat(chunks, total);
        }
        if (!trailer.text.includes(':')) throw new Error('HOANBOY device returned invalid chunk framing.');
      }
    }
    if (!Number.isSafeInteger(size) || size < 0 || total + size > maximumResponseBytes || offset + size >= body.length) {
      throw new Error('HOANBOY device returned invalid chunk framing.');
    }
    chunks.push(body.subarray(offset, offset + size));
    total += size;
    offset += size;
    if (body[offset] === 0x0d && body[offset + 1] === 0x0a) offset += 2;
    else if (body[offset] === 0x0a) offset += 1;
    else throw new Error('HOANBOY device returned invalid chunk framing.');
  }
}

function readDeviceResponse(address, route) {
  const baseUrl = new URL('http://' + address + ':8080/');
  const requestUrl = new URL(route, baseUrl);
  if (requestUrl.origin !== baseUrl.origin) throw new Error('HOANBOY device route is invalid.');
  const requestTarget = requestUrl.pathname + requestUrl.search;

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: address, port: 8080 });
    const chunks = [];
    let total = 0;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('HOANBOY device request timed out.')), responseTimeoutMs);

    function finish(error, response) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error);
      else resolve(response);
    }

    socket.on('connect', () => {
      socket.write('GET ' + requestTarget + ' HTTP/1.1\r\n' +
        'Host: ' + address + ':8080\r\n' +
        'Accept: application/json\r\n' +
        'Connection: close\r\n\r\n');
    });
    socket.on('data', (chunk) => {
      total += chunk.length;
      if (total > maximumResponseBytes + maximumHeaderBytes) {
        finish(new Error('HOANBOY device response exceeded the size limit.'));
        return;
      }
      chunks.push(chunk);
    });
    socket.on('error', (error) => finish(error));
    socket.on('end', () => {
      try {
        finish(null, splitResponse(Buffer.concat(chunks, total)));
      } catch (error) {
        finish(error);
      }
    });
  });
}

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
  constructor(address, fetchImplementation) {
    this.address = validateDeviceAddress(address);
    this.fetch = fetchImplementation;
    this.baseUrl = 'http://' + this.address + ':8080/';
  }

  async get(route) {
    let buffer;
    if (this.fetch) {
      const response = await this.fetch(new URL(route, this.baseUrl), {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(responseTimeoutMs),
        headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error('HOANBOY device request failed.');
      buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maximumResponseBytes) throw new Error('HOANBOY device response exceeded the size limit.');
    } else {
      buffer = await readDeviceResponse(this.address, route);
    }
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
