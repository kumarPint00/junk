import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('service worker never caches authenticated API responses', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /return;/);
});

test('production headers block mixed content and risky browser capabilities', () => {
  const config = readFileSync('vercel.json', 'utf8');
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /upgrade-insecure-requests/);
  assert.match(config, /Permissions-Policy/);
  assert.match(config, /camera=\(\)/);
});

test('android wrapper forbids cleartext and device backup', () => {
  const manifest = readFileSync('../android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(manifest, /allowBackup="false"/);
});

test('android wrapper points at stable production alias', () => {
  const gradle = readFileSync('../android/app/build.gradle', 'utf8');
  assert.match(gradle, /https:\/\/plot-to-ghar\.vercel\.app/);
});
