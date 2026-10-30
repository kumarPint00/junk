import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'ptg_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be configured with at least 32 characters');
  return s;
}

function sig(payload: string) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueSession() {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ v: 1, iat: now, exp: now + MAX_AGE_MS, nonce: crypto.randomBytes(16).toString('hex') })
  ).toString('base64url');
  return `${payload}.${sig(payload)}`;
}

export function verifySessionToken(value?: string) {
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  const expected = sig(payload);
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return parsed?.v === 1 && Number(parsed.iat) <= Date.now() && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

export async function isAuthed() {
  const c = await cookies();
  return verifySessionToken(c.get(COOKIE)?.value);
}

export function verifyPin(pin: string) {
  const expected = process.env.APP_PIN || '';
  if (expected.length < 4) throw new Error('APP_PIN must contain at least 4 characters');
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const sessionCookieName = COOKIE;
export const sessionMaxAgeSeconds = MAX_AGE_MS / 1000;
