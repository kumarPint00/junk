import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';

export async function GET() {
  let database = false;
  try {
    await getState();
    database = true;
  } catch {
    database = false;
  }
  const storageConfigured = Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_ENDPOINT_URL_S3
  );
  return NextResponse.json(
    {
      ok: database,
      database,
      storageConfigured,
      app: 'plot-to-ghar',
      version: '2.0.0',
    },
    { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
