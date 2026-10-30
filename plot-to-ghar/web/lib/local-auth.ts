'use client';

const KEY = 'ptg_local_auth_v1';
const ITERATIONS = 180_000;

type LocalAuth = {
  salt: string;
  hash: string;
  iterations: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function derive(pin: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations },
    material,
    256
  );
  return new Uint8Array(bits);
}

export function hasLocalPin() {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export async function saveLocalPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  const record: LocalAuth = {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: ITERATIONS,
  };
  localStorage.setItem(KEY, JSON.stringify(record));
}

export async function verifyLocalPin(pin: string) {
  try {
    const record = JSON.parse(localStorage.getItem(KEY) || 'null') as LocalAuth | null;
    if (!record?.salt || !record?.hash) return false;
    const expected = base64ToBytes(record.hash);
    const actual = await derive(pin, base64ToBytes(record.salt), Number(record.iterations || ITERATIONS));
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
    return diff === 0;
  } catch {
    return false;
  }
}
