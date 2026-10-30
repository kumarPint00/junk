import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';

export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  let database = false;

  if (databaseConfigured) {
    try {
      await getState();
      database = true;
    } catch {
      database = false;
    }
  }

  const storageConfigured = Boolean(
    (process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_ENDPOINT_URL_S3 &&
      process.env.OBJECT_STORAGE_BUCKET) ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_STORE_ID
  );

  const cloudReady = database && storageConfigured;

  return NextResponse.json(
    {
      ok: true,
      mode: cloudReady ? 'cloud' : 'standalone',
      cloudReady,
      database,
      databaseConfigured,
      storageConfigured,
      app: 'plot-to-ghar',
      version: '2.1.0',
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
