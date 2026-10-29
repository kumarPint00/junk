import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list, put } from '@vercel/blob';

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{40,80}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const id = req.query.id;
  if (!validId(id)) return res.status(400).json({ error: 'invalid sync id' });

  const pathname = `sync/${id}/snapshot.json`;

  if (req.method === 'GET') {
    const result = await list({ prefix: pathname, limit: 1 });
    const blob = result.blobs.find(item => item.pathname === pathname);
    if (!blob) return res.status(404).json({ error: 'not found' });
    const remote = await fetch(blob.url, { cache: 'no-store' });
    if (!remote.ok) return res.status(502).json({ error: 'storage read failed' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(await remote.text());
  }

  if (req.method === 'PUT') {
    const payload = req.body?.payload;
    if (typeof payload !== 'string' || payload.length > 2_500_000) {
      return res.status(400).json({ error: 'invalid payload' });
    }
    const blob = await put(pathname, JSON.stringify({ payload }), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      contentType: 'application/json'
    });
    return res.status(200).json({ ok: true, url: blob.url });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'method not allowed' });
}
