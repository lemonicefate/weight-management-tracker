import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { badRequest } from '../errors.js';

const scrypt = promisify(scryptCallback);
const parameters = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
const keyLength = 64;
const dummySalt = Buffer.from('2aa8de73f3c31d6497114f468720e26d', 'hex');
const dummyHash = scryptSync('credential timing equalization', dummySalt, keyLength, parameters);

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw badRequest('Password must contain between 12 and 1024 characters.');
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, keyLength, parameters);
  return ['scrypt', parameters.N, parameters.r, parameters.p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

function parseHash(encoded) {
  const [algorithm, n, r, p, saltText, keyText] = String(encoded || '').split('$');
  const cost = Number(n);
  const blockSize = Number(r);
  const parallelization = Number(p);
  if (algorithm !== 'scrypt' || cost !== 32768 || blockSize !== 8 || parallelization !== 1) {
    return null;
  }
  const salt = Buffer.from(saltText || '', 'base64url');
  const key = Buffer.from(keyText || '', 'base64url');
  if (salt.length !== 16 || key.length !== keyLength) return null;
  return { salt, key };
}

export async function verifyPassword(password, encodedHash) {
  const parsed = parseHash(encodedHash);
  const salt = parsed?.salt || dummySalt;
  const expected = parsed?.key || dummyHash;
  let actual;
  try {
    actual = await scrypt(String(password), salt, expected.length, parameters);
  } catch {
    return false;
  }
  const matched = timingSafeEqual(actual, expected);
  return Boolean(parsed && matched);
}
