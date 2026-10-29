import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getObject, putObject } from '@/lib/object-storage';

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) throw new Error('File required');
    if (file.size > 4 * 1024 * 1024) throw new Error('File too large (max 4 MB)');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathname = `attachments/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
    await putObject(pathname, await file.arrayBuffer(), file.type || 'application/octet-stream');
    return NextResponse.json({
      attachment: {
        pathname,
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      },
    });
  } catch (error) {
    return err(error);
  }
}

export async function GET(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const pathname = new URL(req.url).searchParams.get('path');
    if (!pathname?.startsWith('attachments/')) throw new Error('Invalid path');
    const object = await getObject(pathname);
    if (!object) return err(new Error('Not found'), 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': object.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${pathname.split('/').pop()}"`,
        'Cache-Control': 'private, max-age=60',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return err(error, 404);
  }
}
