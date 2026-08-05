/**
 * Regenerate PWA icons and favicon from public/kestrel.png (master asset).
 * Does not overwrite kestrel-black.png / kestrel-white.png — update those manually.
 *
 * Usage: replace public/kestrel.png with your upscaled logo, then npm run generate:icons
 */
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const publicDir = resolve(root, 'public');
const iconsDir = resolve(publicDir, 'icons');
const sourcePath = resolve(publicDir, 'kestrel.png');

if (!existsSync(sourcePath)) {
  console.error('Missing public/kestrel.png — add your master logo there first.');
  process.exit(1);
}

mkdirSync(iconsDir, { recursive: true });

const iconSizes = [16, 48, 128, 192, 512];
const iconBg = { r: 30, g: 25, b: 22, alpha: 1 };

console.log('Generating icons from public/kestrel.png…');

for (const size of iconSizes) {
  const out = resolve(iconsDir, `icon${size}.png`);
  await sharp(sourcePath)
    .resize(size, size, { fit: 'contain', background: iconBg })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  icons/icon${size}.png`);
}

await sharp(sourcePath)
  .resize(48, 48, { fit: 'contain', background: iconBg })
  .png({ compressionLevel: 9 })
  .toFile(resolve(publicDir, 'favicon.png'));
console.log('  favicon.png');
console.log('Done. (kestrel-black.png / kestrel-white.png were not modified.)');
