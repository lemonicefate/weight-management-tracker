import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const magic = Buffer.from('WMTBAK01', 'ascii');
const saltBytes = 16;
const ivBytes = 12;
const tagBytes = 16;
const keyBytes = 32;
const scryptOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const maximumPlaintextBytes = 1024 * 1024 * 1024;

function deriveKey(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 20 || passphrase.length > 1024) {
    throw new Error('Set a backup passphrase with at least 20 characters.');
  }
  return scryptSync(passphrase, salt, keyBytes, scryptOptions);
}

export function encryptBackup(plaintext, passphrase) {
  if (!Buffer.isBuffer(plaintext) || plaintext.length === 0 || plaintext.length > maximumPlaintextBytes) {
    throw new Error('Backup data is empty or exceeds the supported size.');
  }
  const compressed = gzipSync(plaintext, { level: 6 });
  const salt = randomBytes(saltBytes);
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([magic, salt, iv, tag, ciphertext]);
}

export function decryptBackup(archive, passphrase) {
  if (!Buffer.isBuffer(archive) || archive.length < magic.length + saltBytes + ivBytes + tagBytes + 1) {
    throw new Error('Backup archive is incomplete.');
  }
  if (!archive.subarray(0, magic.length).equals(magic)) throw new Error('Backup archive format is not supported.');
  const offset = magic.length;
  const salt = archive.subarray(offset, offset + saltBytes);
  const ivStart = offset + saltBytes;
  const iv = archive.subarray(ivStart, ivStart + ivBytes);
  const tagStart = ivStart + ivBytes;
  const tag = archive.subarray(tagStart, tagStart + tagBytes);
  const ciphertext = archive.subarray(tagStart + tagBytes);
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAAD(magic);
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const plaintext = gunzipSync(compressed, { maxOutputLength: maximumPlaintextBytes });
    if (!plaintext.length) throw new Error('Backup archive is empty.');
    return plaintext;
  } catch {
    throw new Error('Backup could not be verified. Check the archive and configured backup passphrase.');
  }
}
