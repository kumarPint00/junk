import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{40,80}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const id = req.query.id;
  if (!validId(id)) return res.status(400).json({ error: 'invalid sync id' });

  const { attachmentId, filename, payload } = req.body || {};
  if (
    typeof attachmentId !== 'string' ||
    typeof filename !== 'string' ||
    !payload ||
    typeof payload.data !== 'string'
  ) {
    return res.status(400).json({ error: 'invalid attachment payload' });
  }

  if (payload.data.length > 4_000_000) {
    return res.status(413).json({ error: 'attachment too large' });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const pathname = `attachments/${id}/${attachmentId}-${safeName}.json`;
  const blob = await put(pathname, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });

  return res.status(200).json({ url: blob.url });
}
