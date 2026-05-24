import { readFileSync, writeFileSync } from 'node:fs';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/sync-version.mjs <tag-or-version>');
  process.exit(1);
}

const version = raw.startsWith('v') ? raw.slice(1) : raw;
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

function updateJson(path, mutator) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  mutator(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

updateJson('package.json', (data) => {
  data.version = version;
});

updateJson('extension/manifest.json', (data) => {
  data.version = version;
});

updateJson('src-tauri/tauri.conf.json', (data) => {
  data.version = version;
});

console.log(`Synced version to ${version}`);
