import fs from 'fs';
import path from 'path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const rawValue = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = rawValue;
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;

if (!accountId || !apiToken) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_IMAGES_API_TOKEN.');
  process.exit(1);
}

const variants = {
  logosquare: { fit: 'contain', width: 384, height: 384, metadata: 'none' },
  avatarsquare: { fit: 'cover', width: 384, height: 384, metadata: 'none' },
  herocard: { fit: 'cover', width: 768, height: 432, metadata: 'none' },
  heropage: { fit: 'cover', width: 1280, height: 720, metadata: 'none' },
  coverpage: { fit: 'cover', width: 1280, height: 427, metadata: 'none' },
  flyercard: { fit: 'contain', width: 480, metadata: 'none' },
  flyerpage: { fit: 'contain', width: 1080, metadata: 'none' },
  gallerythumb: { fit: 'cover', width: 384, height: 288, metadata: 'none' },
  gallerypage: { fit: 'cover', width: 1280, height: 960, metadata: 'none' },
};

const cfFetch = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || `Cloudflare request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
};

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/variants`;
const existingPayload = await cfFetch(baseUrl);
const rawExisting = existingPayload.result?.variants ?? existingPayload.result ?? [];
const existingVariants = Array.isArray(rawExisting)
  ? rawExisting
  : Object.entries(rawExisting).map(([id, value]) => ({ id, ...(value && typeof value === 'object' ? value : {}) }));
const existing = new Map(existingVariants.map((variant) => [variant.id, variant]));

const summary = { created: [], unchanged: [], failed: [] };

for (const [id, options] of Object.entries(variants)) {
  if (existing.has(id)) {
    summary.unchanged.push(id);
    continue;
  }

  try {
    await cfFetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ id, options }),
    });
    summary.created.push(id);
  } catch (error) {
    summary.failed.push(`${id}: ${error.message}`);
  }
}

console.log('Cloudflare Images variants summary');
console.log(`Created: ${summary.created.length ? summary.created.join(', ') : 'none'}`);
console.log(`Unchanged: ${summary.unchanged.length ? summary.unchanged.join(', ') : 'none'}`);
console.log(`Failed: ${summary.failed.length ? summary.failed.join('; ') : 'none'}`);
