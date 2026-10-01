import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSitemapXml } from '../functions/lib/seoMetadata.ts';

const rootDir = process.cwd();

const sitemapXml = await generateSitemapXml();
const targetPath = path.join(rootDir, 'public', 'sitemap.xml');

fs.writeFileSync(targetPath, sitemapXml, 'utf8');
console.log(`Generated public/sitemap.xml (${(sitemapXml.length / 1024).toFixed(1)} KB)`);
