import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const CLIENT_ROOTS = ['components', 'lib'];
const CLIENT_ENTRY_FILES = ['index.tsx', 'App.tsx'];
const RAW_PRIVATE_DATA_IMPORTS = [
  'listings.local.json',
  'building-assets.local.json',
];

const sourceFiles = [];

const collectSourceFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath);
      continue;
    }
    if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) sourceFiles.push(fullPath);
  }
};

for (const relativeRoot of CLIENT_ROOTS) {
  collectSourceFiles(path.join(ROOT, relativeRoot));
}
for (const relativeFile of CLIENT_ENTRY_FILES) {
  sourceFiles.push(path.join(ROOT, relativeFile));
}

test('browser code never imports raw local listing or building-asset stores', () => {
  const offenders = [];
  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const rawStore of RAW_PRIVATE_DATA_IMPORTS) {
      if (source.includes(rawStore)) {
        offenders.push(`${path.relative(ROOT, filePath)} -> ${rawStore}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('Street View browser modules use the sanitized public virtual building-asset source', () => {
  const streetViewSource = fs.readFileSync(path.join(ROOT, 'components', 'dev', 'StreetViewToolPage.tsx'), 'utf8');
  const availabilitySource = fs.readFileSync(path.join(ROOT, 'lib', 'streetViewAvailability.ts'), 'utf8');
  const virtualModule = 'virtual:swingsphere-public-street-view-building-assets';

  assert.match(streetViewSource, new RegExp(virtualModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(availabilitySource, new RegExp(virtualModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
