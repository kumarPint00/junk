'use client';

import type { AttachmentRef, ProjectState, Transaction } from './types';
import { validateBackupData } from './backup-validation';

const DB_NAME = 'plot-to-ghar-local-v2';
const DB_VERSION = 1;
const KV = 'kv';
const TX = 'transactions';
const ATT = 'attachments';
const STATE_KEY = 'project-state';

type AttachmentRow = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  blob: Blob;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(TX)) db.createObjectStore(TX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ATT)) db.createObjectStore(ATT, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open local database'));
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local database request failed'));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Local database transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Local database transaction aborted'));
  });
}

export async function getLocalState(): Promise<ProjectState | null> {
  const db = await openDb();
  const tx = db.transaction(KV, 'readonly');
  const value = await req(tx.objectStore(KV).get(STATE_KEY));
  await done(tx);
  db.close();
  return (value as ProjectState | undefined) || null;
}

export async function putLocalState(state: ProjectState) {
  const db = await openDb();
  const tx = db.transaction(KV, 'readwrite');
  tx.objectStore(KV).put(state, STATE_KEY);
  await done(tx);
  db.close();
}

export async function listLocalTransactions(): Promise<Transaction[]> {
  const db = await openDb();
  const tx = db.transaction(TX, 'readonly');
  const values = await req(tx.objectStore(TX).getAll());
  await done(tx);
  db.close();
  return (values as Transaction[]).sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.localeCompare(b.createdAt)
  );
}

export async function putLocalTransaction(transaction: Transaction) {
  const db = await openDb();
  const tx = db.transaction(TX, 'readwrite');
  // append-only: never silently replace an existing financial transaction ID.
  tx.objectStore(TX).add(transaction);
  await done(tx);
  db.close();
}

export async function replaceLocalData(state: ProjectState, transactions: Transaction[]) {
  const db = await openDb();
  const tx = db.transaction([KV, TX], 'readwrite');
  tx.objectStore(KV).put(state, STATE_KEY);
  const store = tx.objectStore(TX);
  store.clear();
  for (const transaction of transactions) store.put(transaction);
  await done(tx);
  db.close();
}

export async function saveLocalAttachment(file: File): Promise<AttachmentRef> {
  const id = crypto.randomUUID();
  const row: AttachmentRow = {
    id,
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: new Date().toISOString(),
  };
  const db = await openDb();
  const tx = db.transaction(ATT, 'readwrite');
  tx.objectStore(ATT).put(row);
  await done(tx);
  db.close();
  return {
    pathname: `local://${id}`,
    name: row.name,
    contentType: row.contentType,
    size: row.size,
  };
}

export async function getLocalAttachment(pathname: string): Promise<AttachmentRow | null> {
  const id = pathname.startsWith('local://') ? pathname.slice('local://'.length) : pathname;
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction(ATT, 'readonly');
  const value = await req(tx.objectStore(ATT).get(id));
  await done(tx);
  db.close();
  return (value as AttachmentRow | undefined) || null;
}

export async function openLocalAttachment(pathname: string) {
  const row = await getLocalAttachment(pathname);
  if (!row) throw new Error('Local evidence file was not found on this device.');
  const url = URL.createObjectURL(row.blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read evidence file'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',', 2);
  const match = /^data:([^;]+);base64$/.exec(header || '');
  if (!match || !encoded) throw new Error('Invalid evidence data in backup');
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

export async function buildStandaloneBackup(state: ProjectState, transactions: Transaction[]) {
  const localPaths = new Set(
    [
      ...transactions.flatMap((t) => (t.attachments || []).map((a) => a.pathname)),
      ...(state.construction?.agreements || []).flatMap((a) => (a.attachments || []).map((ref) => ref.pathname)),
      ...(state.construction?.progress || []).flatMap((p) => (p.attachments || []).map((ref) => ref.pathname)),
    ].filter((p) => p.startsWith('local://'))
  );

  const attachments: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
    createdAt: string;
    dataUrl: string;
  }> = [];

  for (const pathname of localPaths) {
    const row = await getLocalAttachment(pathname);
    if (!row) continue;
    attachments.push({
      id: row.id,
      name: row.name,
      contentType: row.contentType,
      size: row.size,
      createdAt: row.createdAt,
      dataUrl: await blobToDataUrl(row.blob),
    });
  }

  return {
    format: 'plot-to-ghar-standalone-backup-v1',
    exportedAt: new Date().toISOString(),
    state,
    transactions,
    attachments,
  };
}

export async function restoreStandaloneBackup(backup: any) {
  if (backup?.format !== 'plot-to-ghar-standalone-backup-v1') throw new Error('Unsupported standalone backup format.');
  if (!Array.isArray(backup.attachments) || backup.attachments.length > 2000) throw new Error('Invalid evidence attachments in backup.');
  const { state, transactions } = validateBackupData(backup);

  // Parse and validate all attachment content BEFORE opening the write transaction.
  // An exception during a transaction otherwise risks a partially restored device.
  const prepared: AttachmentRow[] = [];
  const seen = new Set<string>();
  for (const item of backup.attachments) {
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) {
      throw new Error('Duplicate or invalid evidence ID in backup.');
    }
    seen.add(item.id);
    const blob = dataUrlToBlob(String(item.dataUrl || ''));
    if (blob.size > 8 * 1024 * 1024) throw new Error('Evidence file exceeds the 8 MB limit.');
    prepared.push({
      id: item.id,
      name: String(item.name || 'evidence').slice(0, 160),
      contentType: String(item.contentType || blob.type || 'application/octet-stream'),
      size: blob.size,
      blob,
      createdAt: String(item.createdAt || new Date().toISOString()),
    });
  }

  const db = await openDb();
  try {
    const tx = db.transaction([KV, TX, ATT], 'readwrite');
    tx.objectStore(KV).put(state, STATE_KEY);
    const txStore = tx.objectStore(TX);
    const attStore = tx.objectStore(ATT);
    txStore.clear();
    attStore.clear();
    for (const financial of transactions) txStore.add(financial);
    for (const evidence of prepared) attStore.add(evidence);
    await done(tx);
    return { state, transactions };
  } finally {
    db.close();
  }
}

export async function migrateLegacySnapshot() {
  try {
    const existing = await getLocalState();
    if (existing) return;
    const raw = localStorage.getItem('ptg_snapshot_v2');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.state || !Array.isArray(parsed?.txs)) return;
    await replaceLocalData(parsed.state, parsed.txs);
  } catch {
    // Legacy cache migration is best-effort only.
  }
}
