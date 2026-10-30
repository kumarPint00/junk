import { NextResponse } from 'next/server';
import { sessionCookieName } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(sessionCookieName, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
