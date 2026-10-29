import { Capacitor } from '@capacitor/core';
import { db, exportSnapshot, importSnapshot, mergeSnapshots, bumpRevision } from './db';
import type { AppSnapshot, Attachment } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || (Capacitor.isNativePlatform() ? 'https://plot-to-ghar-kumarpint00-kumarpint00s-projects.vercel.app' : '')).replace(/\/$/, '');
const api = (path: string) => API_BASE + path;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const base64Url = (bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function deriveKey(syncKey: string) {
  const hash = await sha256(syncKey);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function generateSyncKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

export async function getSyncId(syncKey: string) {
  return base64Url(await sha256(syncKey));
}

export async function encryptJson(value: unknown, syncKey: string) {
  const key = await deriveKey(syncKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  );
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(encrypted) });
}

export async function decryptJson<T>(payload: string, syncKey: string): Promise<T> {
  const parsed = JSON.parse(payload);
  if (parsed.v !== 1) throw new Error('Unsupported encrypted payload');
  const key = await deriveKey(syncKey);
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(parsed.iv) },
    key,
    base64ToBytes(parsed.data)
  );
  return JSON.parse(decoder.decode(clear)) as T;
}

export async function encryptBlob(blob: Blob, syncKey: string) {
  const key = await deriveKey(syncKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = new Uint8Array(await blob.arrayBuffer());
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear));
  return {
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
    mimeType: blob.type || 'application/octet-stream'
  };
}

export async function decryptBlob(payload: { v:number; iv:string; data:string; mimeType:string }, syncKey: string) {
  const key = await deriveKey(syncKey);
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data)
  );
  return new Blob([clear], { type: payload.mimeType });
}

export async function getSavedSyncKey() {
  return (await db.syncMeta.get('syncKey'))?.value || '';
}

export async function saveSyncKey(syncKey: string) {
  await db.syncMeta.put({ key: 'syncKey', value: syncKey });
}

export async function clearSyncKey() {
  await db.syncMeta.delete('syncKey');
}

async function downloadRemote(syncKey: string): Promise<AppSnapshot | null> {
  const id = await getSyncId(syncKey);
  const response = await fetch(api('/api/sync?id=') + encodeURIComponent(id), { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Cloud download failed');
  const { payload } = await response.json();
  return decryptJson<AppSnapshot>(payload, syncKey);
}

async function uploadRemote(snapshot: AppSnapshot, syncKey: string) {
  const id = await getSyncId(syncKey);
  const payload = await encryptJson(snapshot, syncKey);
  const response = await fetch(api('/api/sync?id=') + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload })
  });
  if (!response.ok) throw new Error('Cloud upload failed');
}

export async function syncNow(syncKey: string) {
  const local = await exportSnapshot();
  const remote = await downloadRemote(syncKey);
  const merged = remote ? mergeSnapshots(local, remote) : { ...local, revision: local.revision + 1 };
  await importSnapshot(merged);
  await uploadRemote(merged, syncKey);
  await db.syncMeta.put({ key: 'lastSyncAt', value: new Date().toISOString() });
  return merged;
}

export async function uploadAttachment(attachment: Attachment, syncKey: string) {
  if (!attachment.localBlob) return attachment;
  if (attachment.localBlob.size > 3_000_000) {
    throw new Error('Attachment must be smaller than 3 MB for cloud sync');
  }
  const id = await getSyncId(syncKey);
  const encrypted = await encryptBlob(attachment.localBlob, syncKey);
  const response = await fetch(api('/api/attachment?id=') + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      attachmentId: attachment.id,
      filename: attachment.name,
      payload: encrypted
    })
  });
  if (!response.ok) throw new Error('Attachment upload failed');
  const { url } = await response.json();
  const updated = { ...attachment, remoteUrl: url, updatedAt: new Date().toISOString() };
  await db.attachments.put(updated);
  await bumpRevision();
  return updated;
}

export async function getRemoteAttachment(url: string, syncKey: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not download attachment');
  return decryptBlob(await response.json(), syncKey);
}

export function downloadJsonFile(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
