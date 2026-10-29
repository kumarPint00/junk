import { NextResponse } from 'next/server';

export async function GET() {
  const database = Boolean(process.env.DATABASE_URL);
  const storage = Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_ENDPOINT_URL_S3
  );
  return NextResponse.json(
    {
      ok: database,
      database,
      storage,
      app: 'plot-to-ghar',
      version: '1.0.0',
    },
    { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
