/**
 * Read-only Cloudflare Images size inventory.
 * Downloads source bytes only as needed to measure their actual size.
 * No Cloudflare writes or asset mutations. Do not commit generated report.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare account ID and API token are required.');
const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/images`;
const headers = { Authorization: `Bearer ${token}` };
const output = path.join(root, 'reports', 'cloudflare-image-sizes.json');
const concurrency = 4;
const limit = Number(process.env.IMAGE_AUDIT_LIMIT || 0);
async function cfList(continuation) {
  const url = new URL(base + '/v2');
  if (continuation) url.searchParams.set('continuation_token', continuation);
  const response = await fetch(url, { headers });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error('Cloudflare Images inventory request failed: ' + response.status);
  return json.result;
}
const all = [];
let continuation;
do {
  const result = await cfList(continuation);
  all.push(...(result.images || []));
  continuation = result.continuation_token;
} while (continuation);
const images = limit > 0 ? all.slice(0, limit) : all;
const entries = Array(images.length);
let next = 0;
async function worker() {
  while (next < images.length) {
    const index = next++;
    const image = images[index];
    const result = { id: image.id, filename: image.filename, uploaded: image.uploaded, role: image.meta?.role ?? null, ownerType: image.meta?.ownerType ?? null, ownerId: image.meta?.ownerId ?? null, sourceBytes: null, variantBytes: {}, errors: [] };
    entries[index] = result;
    // Original blob retrieval is not authorized by the current Cloudflare token (HTTP 403).
    // Explicitly mark original size unknown instead of downloading inaccessible originals.
    result.sourceBytes = null;
    const requestedVariants = image.meta?.role === 'logo' ? ['logosquare'] : image.meta?.role === 'flyer' ? ['flyercard', 'flyerpage'] : ['herocard', 'heropage'];
    for (const variant of requestedVariants) {
      const url = (image.variants ?? []).find(v => v.endsWith('/' + variant));
      if (!url) continue;
      try {
        const response = await fetch(url, { headers: { Accept: 'image/webp' }, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('Variant HTTP ' + response.status);
        const data = await response.arrayBuffer();
        result.variantBytes[variant] = data.byteLength;
      } catch (error) { result.errors.push(variant + ': ' + error.message); }
    }
    if ((index + 1) % 25 === 0) console.log('Measured', index + 1, '/', images.length);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const measured = entries.filter(e => e.sourceBytes != null);
const over = (bytes) => measured.filter(e => e.sourceBytes > bytes).length;
const sorted = [...measured].sort((a, b) => b.sourceBytes - a.sourceBytes);
const sum = values => values.reduce((a, b) => a + b, 0);
const variantPairs = entries.flatMap(e => Object.entries(e.variantBytes).map(([variant, bytes]) => ({ id: e.id, filename: e.filename, role: e.role, variant, bytes })));
const variantCountOver = threshold => variantPairs.filter(v => v.bytes > threshold).length;
const summary = {
  variantResponsesMeasured: variantPairs.length,
  totalVariantBytes: sum(variantPairs.map(v => v.bytes)),
  variantsOver500KB: variantCountOver(500 * 1024),
  variantsOver1MB: variantCountOver(1024 ** 2),
  variantsOver2MB: variantCountOver(2 * 1024 ** 2),
  variantsOver3MB: variantCountOver(3 * 1024 ** 2),
  largestVariants: [...variantPairs].sort((a,b)=>b.bytes-a.bytes).slice(0,20),
  originalSizesAvailable: false,
  scannedAt: new Date().toISOString(), totalInCloudflare: all.length, scanned: images.length,
  measured: measured.length, errors: entries.filter(e => e.errors.length).length,
  over500KB: over(500 * 1024), over1MB: over(1024 ** 2), over2MB: over(2 * 1024 ** 2), over3MB: over(3 * 1024 ** 2),
  totalSourceBytes: sum(measured.map(e => e.sourceBytes)), largest: sorted.slice(0, 20).map(({id,filename,role,sourceBytes,variantBytes})=>({id,filename,role,sourceBytes,variantBytes})),
};
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, JSON.stringify({ summary, entries }, null, 2));
console.log(JSON.stringify({summary,report:output},null,2));
