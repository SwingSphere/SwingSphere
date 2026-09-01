import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';

const [mode, entry, ...forwardedArgs] = process.argv.slice(2);
if (!entry || !['run', 'test'].includes(mode)) {
  process.stderr.write('Usage: node scripts/run-typescript-entry.mjs <run|test> <entry.ts> [...args]\n');
  process.exit(2);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'swingsphere-ts-'));
const outputPath = path.join(tempRoot, 'entry.mjs');
try {
  buildSync({ entryPoints: [path.resolve(entry)], outfile: outputPath, bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: 'inline', logLevel: 'warning' });
  const args = mode === 'test' ? ['--test', outputPath, ...forwardedArgs] : [outputPath, ...forwardedArgs];
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
