/**
 * Regenerate PWA icons and favicon from logo assets in public/.
 * Does not overwrite kestrel-black.png / kestrel-white.png.
 *
 * Usage: npm run generate:icons
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const publicDir = resolve(root, 'public');
const iconsDir = resolve(publicDir, 'icons');

const candidates = [
  resolve(publicDir, 'kestrel-black.png'),
  resolve(publicDir, 'icons/icon512.png'),
  resolve(publicDir, 'kestrel.png'),
];

async function pickSourcePath() {
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      await sharp(path).metadata();
      return path;
    } catch {
      // not a raster image sharp can read
    }
  }
  return null;
}

const kestrelAsset = resolve(publicDir, 'kestrel.png');
const sourcePath = await pickSourcePath();

if (!sourcePath) {
  console.error('No usable logo source found in public/. Add kestrel-black.png or a valid kestrel.png.');
  process.exit(1);
}

mkdirSync(iconsDir, { recursive: true });

const iconSizes = [16, 48, 128, 192, 512];
const iconBg = { r: 30, g: 25, b: 22, alpha: 1 };

console.log(`Generating icons from ${sourcePath.replace(publicDir, 'public')}…`);

for (const size of iconSizes) {
  const out = resolve(iconsDir, `icon${size}.png`);
  await sharp(sourcePath)
    .resize(size, size, { fit: 'contain', background: iconBg })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  icons/icon${size}.png`);
}

await sharp(sourcePath)
  .resize(32, 32, { fit: 'contain', background: iconBg })
  .png({ compressionLevel: 9 })
  .toFile(resolve(publicDir, 'favicon.png'));
console.log('  favicon.png');

if (existsSync(kestrelAsset)) {
  try {
    const meta = await sharp(kestrelAsset).metadata();
    if (!meta.format) throw new Error('not raster');
  } catch {
    copyFileSync(kestrelAsset, resolve(publicDir, 'favicon.ico'));
    console.log('  favicon.ico (from ICO kestrel.png)');
  }
}

console.log('Done.');
