import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenPublicPhrases } from './public-copy-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicUiFiles = ['src/App.tsx', ...builtAssetFiles()];

const findings = [];

for (const relativePath of publicUiFiles) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    for (const phrase of forbiddenPublicPhrases) {
      if (line.includes(phrase)) {
        findings.push({
          line: index + 1,
          path: relativePath,
          phrase,
        });
      }
    }
  });
}

if (findings.length) {
  console.error('Public copy audit failed. Remove payment or paid-comment wording from public UI copy:');
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line} contains "${finding.phrase}"`);
  }
  process.exit(1);
}

console.log('Public copy audit passed.');

function builtAssetFiles() {
  const assetsDir = path.join(root, 'dist/assets');
  if (!fs.existsSync(assetsDir)) return [];

  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .map((name) => path.join('dist/assets', name));
}
