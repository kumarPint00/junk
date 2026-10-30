import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getObject, putObject } from '@/lib/object-storage';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 8 * 1024 * 1024;

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'evidence';
}

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) throw new Error('File required');
    if (!ALLOWED.has(file.type)) throw new Error('Only JPG, PNG, WebP and PDF files are allowed.');
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('File too large (max 8 MB).');

    const safe = safeName(file.name);
    const pathname = `attachments/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
    await putObject(pathname, await file.arrayBuffer(), file.type);

    return NextResponse.json(
      {
        attachment: {
          pathname,
          name: safe,
          contentType: file.type,
          size: file.size,
        },
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return err(error);
  }
}

export async function GET(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const pathname = new URL(req.url).searchParams.get('path');
    if (!pathname?.startsWith('attachments/') || pathname.includes('..')) throw new Error('Invalid path');
    const object = await getObject(pathname);
    if (!object) return err(new Error('Not found'), 404);

    const filename = safeName(pathname.split('/').pop() || 'evidence');
    return new Response(object.body, {
      headers: {
        'Content-Type': object.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return err(error, 404);
  }
}
