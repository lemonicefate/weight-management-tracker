import { createHash, randomBytes } from 'node:crypto';
import { unauthorized } from '../errors.js';
import { userView } from '../domain/roles.js';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function createSession(database, userId, config) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  database.prepare(
    'INSERT INTO sessions(token_hash, user_id, created_at, last_seen_at, expires_at) VALUES(?, ?, ?, ?, ?)'
  ).run(hashToken(token), userId, now.toISOString(), now.toISOString(), addHours(now, config.sessionLifetimeHours));
  return token;
}

export function resolveSession(database, token, config) {
  if (!token || token.length > 128) return null;
  const digest = hashToken(token);
  const session = database.prepare(
    'SELECT s.token_hash, s.user_id, s.last_seen_at, s.expires_at, u.id, u.username, u.display_name, u.role, u.active ' +
    'FROM sessions s JOIN users u ON u.id = s.user_id ' +
    'WHERE s.token_hash = ? AND s.revoked_at IS NULL'
  ).get(digest);
  if (!session || !session.active) return null;
  const now = new Date();
  const idleExpiry = new Date(new Date(session.last_seen_at).getTime() + config.sessionIdleMinutes * 60 * 1000);
  if (new Date(session.expires_at) <= now || idleExpiry <= now) {
    database.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(now.toISOString(), digest);
    return null;
  }
  if (now.getTime() - new Date(session.last_seen_at).getTime() >= 60_000) {
    database.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now.toISOString(), digest);
  }
  return { id: session.id, username: session.username, display_name: session.display_name, role: session.role };
}

export function revokeSession(database, token) {
  if (!token || token.length > 128) return;
  database.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), hashToken(token));
}

export function cookieHeader(token, config) {
  const parts = [
    'wmt_session=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + Math.floor(config.sessionLifetimeHours * 60 * 60)
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function clearedCookieHeader(config) {
  const parts = ['wmt_session=', 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function readSessionToken(request) {
  const cookieHeaderValue = request.headers.cookie || '';
  for (const part of cookieHeaderValue.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key !== 'wmt_session') continue;
    try {
      return decodeURIComponent(valueParts.join('='));
    } catch {
      return '';
    }
  }
  return '';
}

export function requireSession(database, request, config) {
  const user = resolveSession(database, readSessionToken(request), config);
  if (!user) throw unauthorized();
  return userView(user);
}
