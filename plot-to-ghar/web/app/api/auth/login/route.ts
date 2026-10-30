import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { issueSession, sessionCookieName, sessionMaxAgeSeconds, verifyPin } from '@/lib/auth';
import { clearLoginAttempts, getLoginAttemptCount, recordLoginAttempt } from '@/lib/store';

const fallbackAttempts = new Map<string, number[]>();

function clientKey(req: Request) {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown-client';
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function fallbackCount(key: string) {
  const cutoff = Date.now() - 15 * 60 * 1000;
  const values = (fallbackAttempts.get(key) || []).filter((t) => t > cutoff);
  fallbackAttempts.set(key, values);
  return values.length;
}

async function attemptsFor(key: string) {
  if (!process.env.DATABASE_URL) return fallbackCount(key);
  try {
    return await getLoginAttemptCount(key);
  } catch {
    return fallbackCount(key);
  }
}

async function recordFailure(key: string) {
  if (process.env.DATABASE_URL) {
    try {
      await recordLoginAttempt(key);
      return;
    } catch {
      // Fall through to ephemeral per-instance throttling.
    }
  }
  const values = fallbackAttempts.get(key) || [];
  values.push(Date.now());
  fallbackAttempts.set(key, values.slice(-20));
}

async function clearFailures(key: string) {
  fallbackAttempts.delete(key);
  if (process.env.DATABASE_URL) {
    try {
      await clearLoginAttempts(key);
    } catch {
      // Authentication can continue even if the optional cloud DB is unavailable.
    }
  }
}

export async function POST(req: Request) {
  const key = clientKey(req);
  try {
    if ((await attemptsFor(key)) >= 5) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in about 15 minutes.' },
        { status: 429, headers: { 'Retry-After': '900', 'Cache-Control': 'no-store' } }
      );
    }

    const { pin } = await req.json();
    if (!verifyPin(String(pin || ''))) {
      await recordFailure(key);
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    await clearFailures(key);
    const response = NextResponse.json(
      { ok: true, mode: process.env.DATABASE_URL ? 'cloud-capable' : 'standalone' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    response.cookies.set(sessionCookieName, issueSession(), {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: sessionMaxAgeSeconds,
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Login failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
