import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
async function file(path) { return readFile(new URL(path, root), 'utf8'); }
test('PWA metadata, size and maskable asset contract', async () => {
 const m = JSON.parse(await file('public/manifest.webmanifest'));
 assert.equal(m.name, 'Plot to Ghar');
 assert.equal(m.start_url, '/');
 assert.ok(m.icons.some(i => i.sizes === '192x192' && i.type === 'image/png'));
 assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
 assert.ok((await file('app/layout.tsx')).includes('index: false'));
});
test('Android app metadata and adaptive launcher icon', async () => {
 const manifest = await file('../android/app/src/main/AndroidManifest.xml');
 assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
 assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
 assert.match(manifest, /android:label="@string\/app_name"/);
 assert.match(await file('../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), /adaptive-icon/);
});
test('app icon artwork and build generator are nonempty', async () => {
 assert.match(await file('public/icon.svg'), /viewBox="0 0 512 512"/);
 assert.match(await file('scripts/build-brand-assets.mjs'), /icon-maskable-512.png/);
});
