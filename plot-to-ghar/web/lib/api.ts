import { NextResponse } from 'next/server';
import { isAuthed } from './auth';

export async function requireAuth() {
  if (!(await isAuthed())) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return null;
}

export function err(e: unknown, status = 400) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : 'Request failed' },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}
