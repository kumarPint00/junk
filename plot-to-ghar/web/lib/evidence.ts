'use client';

import type { AttachmentRef } from './types';
import { saveLocalAttachment, openLocalAttachment } from './local-db';

export async function saveEvidence(file: File, mode: 'cloud' | 'standalone'): Promise<AttachmentRef> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Evidence must be smaller than 8 MB.');
  if (mode === 'standalone') return saveLocalAttachment(file);
  const data = new FormData();
  data.append('file', file);
  const response = await fetch('/api/attachments', { method: 'POST', body: data });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Cloud evidence upload failed.');
  return body.attachment as AttachmentRef;
}

export async function openEvidence(ref: AttachmentRef) {
  if (ref.pathname.startsWith('local://')) return openLocalAttachment(ref.pathname);
  if (!ref.pathname) throw new Error('Evidence reference missing.');
  window.open('/api/attachments?path=' + encodeURIComponent(ref.pathname), '_blank', 'noopener,noreferrer');
}
