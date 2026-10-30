import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { issueSession, sessionCookieName, sessionMaxAgeSeconds, verifyPin } from '@/lib/auth';
import { clearLoginAttempts, getLoginAttemptCount, recordLoginAttempt } from '@/lib/store';

function clientKey(req: Request) {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown-client';
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function POST(req: Request) {
  const key = clientKey(req);
  try {
    const attempts = await getLoginAttemptCount(key);
    if (attempts >= 5) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in about 15 minutes.' },
        { status: 429, headers: { 'Retry-After': '900', 'Cache-Control': 'no-store' } }
      );
    }

    const { pin } = await req.json();
    if (!verifyPin(String(pin || ''))) {
      await recordLoginAttempt(key);
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    await clearLoginAttempts(key);
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
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
