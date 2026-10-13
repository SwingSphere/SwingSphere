import fs from 'fs';
import path from 'path';
import { generateSitemapXml } from '../functions/lib/seoMetadata.ts';

const rootDir = process.cwd();

function loadDotEnvFiles(dir) {
  const env = { ...process.env };
  const candidates = ['.env.production.local', '.env.local', '.env.development.local', '.env'];
  for (const filename of candidates) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!env[key]) {
        env[key] = val;
      }
    }
  }
  return env;
}

const env = loadDotEnvFiles(rootDir);
const sitemapXml = await generateSitemapXml(env);
const targetPath = path.join(rootDir, 'public', 'sitemap.xml');

fs.writeFileSync(targetPath, sitemapXml, 'utf8');
const urlCount = (sitemapXml.match(/<url>/g) || []).length;
console.log(`Generated public/sitemap.xml (${(sitemapXml.length / 1024).toFixed(1)} KB, ${urlCount} URLs)`);

