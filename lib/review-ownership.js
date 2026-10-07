import { createHash, randomBytes } from 'node:crypto';

export function createDeleteToken() {
  return randomBytes(32).toString('base64url');
}

export function validDeleteToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashDeleteToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
