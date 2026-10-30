import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const icon = await readFile(join(publicDir, 'icon.svg'));

async function pngIcon(size, name) {
  await sharp(icon).resize(size, size).png({ compressionLevel: 9, palette: true }).toFile(join(publicDir, name));
}

await Promise.all([
  pngIcon(192, 'icon-192.png'),
  pngIcon(512, 'icon-512.png'),
  pngIcon(180, 'apple-touch-icon.png'),
]);

// The content is inset for the Android/Chrome maskable safe-zone.
const maskableCenter = await sharp(icon).resize(382, 382).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#07101e' } })
  .composite([{ input: maskableCenter, left: 65, top: 65 }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(join(publicDir, 'icon-maskable-512.png'));

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#07101e"/>
<rect x="44" y="44" width="1112" height="542" rx="48" fill="#10263b" stroke="#28475d" stroke-width="3"/>
<text x="464" y="248" font-family="DejaVu Sans, Arial, sans-serif" font-size="72" font-weight="700" fill="#f1f8fb">Plot to Ghar</text>
<text x="470" y="335" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#74dfbe">Property &amp; Construction Manager</text>
<text x="470" y="405" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#aec4d3">Plan  •  Budget  •  Build  •  Track</text>
</svg>`;
const previewIcon = await sharp(icon).resize(340, 340).png().toBuffer();
await sharp(Buffer.from(card)).composite([{ input: previewIcon, left: 90, top: 145 }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(join(publicDir, 'og-preview.png'));

const names = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og-preview.png'];
console.log('Generated Plot to Ghar brand assets:', names.join(', '));
