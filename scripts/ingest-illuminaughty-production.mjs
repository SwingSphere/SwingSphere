import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load Cloudflare Credentials
const envLocalPath = path.join(rootDir, '.env.local');
if (!fs.existsSync(envLocalPath)) {
  throw new Error(`.env.local not found at ${envLocalPath}`);
}
const envContent = fs.readFileSync(envLocalPath, 'utf8');
const accountIdMatch = envContent.match(/CLOUDFLARE_ACCOUNT_ID=(.*)/);
const apiTokenMatch = envContent.match(/CLOUDFLARE_IMAGES_API_TOKEN=(.*)/);
const accountHashMatch = envContent.match(/NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH=(.*)/);

const accountId = accountIdMatch ? accountIdMatch[1].trim() : '';
const apiToken = apiTokenMatch ? apiTokenMatch[1].trim() : '';
const accountHash = accountHashMatch ? accountHashMatch[1].trim() : '0YABV7zDubNpRHPPku3C9Q';

if (!accountId || !apiToken) {
  throw new Error('Missing Cloudflare credentials in .env.local');
}

// 2. Load Staging Payload
const stagingPayloadPath = 'C:\\Users\\Ryoga\\OneDrive\\Documents\\OpenClawProjects\\SwingSphere-Event-Scout\\staging\\illuminaughty-live\\swingsphere_staging_payload.json';
if (!fs.existsSync(stagingPayloadPath)) {
  throw new Error(`Staging payload not found at ${stagingPayloadPath}`);
}
const stagingData = JSON.parse(fs.readFileSync(stagingPayloadPath, 'utf8'));
const stagedListings = stagingData.listings || [];
console.log(`Loaded ${stagedListings.length} staged listings from Event Scout.`);

// Helper to upload an image to Cloudflare Images
async function uploadToCloudflareImages(filePath, metadata) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'image/png' }), fileName);
  formData.append('requireSignedURLs', 'false');
  formData.append('metadata', JSON.stringify(metadata));

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    const errorMsg = json.errors?.[0]?.message || `Upload failed with status ${res.status}`;
    throw new Error(`Cloudflare upload failed for ${fileName}: ${errorMsg}`);
  }

  return json.result;
}

// Helper to verify URL via HTTP HEAD/GET
async function verifyImageUrl(url) {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(`Image verification failed for ${url}: status ${res.status}`);
  }
  return true;
}

async function runIngest() {
  console.log('\n--- STEP 1: Uploading 15 Derivative Flyers to Cloudflare Images ---');
  const uploadedResults = [];

  for (let i = 0; i < stagedListings.length; i += 1) {
    const listing = stagedListings[i];
    const flyerPath = listing.generatedFlyerReference;
    if (!flyerPath || !fs.existsSync(flyerPath)) {
      throw new Error(`Flyer file does not exist: ${flyerPath}`);
    }

    console.log(`[${i + 1}/15] Uploading ${path.basename(flyerPath)}...`);
    const cfResult = await uploadToCloudflareImages(flyerPath, {
      ownerType: 'event',
      ownerId: listing.id,
      role: 'flyer',
      eventName: listing.name,
      promoter: 'illuminaughty',
      source: 'EventScout-v1',
    });

    const externalId = cfResult.id;
    const cardUrl = `https://imagedelivery.net/${accountHash}/${externalId}/flyercard`;
    const pageUrl = `https://imagedelivery.net/${accountHash}/${externalId}/flyerpage`;

    // Verify delivery
    await verifyImageUrl(cardUrl);
    console.log(`       ✓ Uploaded: ${externalId}`);
    console.log(`       ✓ Verified: ${cardUrl}`);

    uploadedResults.push({
      listingId: listing.id,
      externalId,
      cardUrl,
      pageUrl,
    });
  }

  console.log('\n--- STEP 2: Integrating Events into listings.local.json ---');
  const listingsStorePath = path.join(rootDir, 'data', 'listings.local.json');
  const existingListings = JSON.parse(fs.readFileSync(listingsStorePath, 'utf8'));
  console.log(`Existing listings count: ${existingListings.length}`);

  const existingMap = new Map();
  existingListings.forEach((l) => existingMap.set(l.id, l));

  const updatedOrCreatedListings = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < stagedListings.length; i += 1) {
    const staged = stagedListings[i];
    const upload = uploadedResults[i];

    // Standard lifestyle tags
    const baseTags = [
      'Lifestyle',
      'Couples & Select Singles',
      'Members Only',
      'Screening Required',
      'Illuminaughty Tour',
      'Consent Focused',
    ];
    if (staged.name.toLowerCase().includes('halloween') || staged.name.toLowerCase().includes('circus')) {
      baseTags.push('Halloween', 'Costume Party');
    }
    if (staged.name.toLowerCase().includes('cruise')) {
      baseTags.push('Cruise', 'Virgin Voyages', 'Multi-Day Event');
    }
    if (staged.name.toLowerCase().includes('mixer') || staged.name.toLowerCase().includes('tease')) {
      baseTags.push('Cocktail Mixer', 'Social Lounge');
    }
    if (staged.name.toLowerCase().includes('pajama')) {
      baseTags.push('Pajama Party', 'Themed Attire');
    }
    if (staged.name.toLowerCase().includes('masquerade')) {
      baseTags.push('Masquerade', 'Formal Masked');
    }

    const flyerAsset = {
      id: crypto.randomUUID(),
      owner_type: 'event',
      owner_id: staged.id,
      role: 'flyer',
      storage_provider: 'cloudflare_images',
      external_id: upload.externalId,
      status: 'approved',
      aspect_mode: 'contain',
      target_ratio: '4:5',
      alt_text: `${staged.name} Official Presentation Flyer`,
      sort_order: 0,
      focal_point_x: null,
      focal_point_y: null,
      created_by: 'e3dc3a93-8d16-4e4a-b60a-30ad267ee32d',
      created_at: nowIso,
      updated_at: nowIso,
    };

    const logoAsset = {
      id: crypto.randomUUID(),
      owner_type: 'event',
      owner_id: staged.id,
      role: 'logo',
      storage_provider: 'cloudflare_images',
      external_id: 'ae6636d9-f865-4baa-6256-794aa12f8b00',
      status: 'approved',
      aspect_mode: 'contain',
      target_ratio: '1:1',
      alt_text: 'Illuminaughty Logo',
      sort_order: 0,
      focal_point_x: null,
      focal_point_y: null,
      created_by: 'e3dc3a93-8d16-4e4a-b60a-30ad267ee32d',
      created_at: nowIso,
      updated_at: nowIso,
    };

    const slugify = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const city = staged.geopoint?.address?.city || '';
    const region = staged.geopoint?.address?.region || '';
    const addressObj = {
      ...(staged.geopoint?.address || {}),
      city,
      region,
      country: staged.geopoint?.address?.country || 'United States',
      citySlug: slugify(city),
      admin1Slug: slugify(region),
      countrySlug: 'us',
      isCityState: false,
    };

    const canonicalListing = {
      id: staged.id,
      type: 'event',
      name: staged.name,
      hostName: 'illuminaughty',
      venue: staged.venue,
      description_full: staged.description_full,
      location: staged.location,
      website: staged.website,
      contactEmail: staged.contactEmail || 'support@weareilluminaughty.com',
      isAddressPrivate: staged.isAddressPrivate,
      attendancePolicy: staged.attendancePolicy || 'application_required',
      entryRequirements: staged.entryRequirements || ['screening_approval_required', 'members_only'],
      time: staged.time,
      geopoint: {
        ...staged.geopoint,
        address: addressObj,
      },
      locationMeta: staged.locationMeta,
      organizerOrganizationId: 'org-promoter-illuminaughty',
      status: 'approved',
      postedByUserId: 'user1',
      tags: baseTags,
      mediaAssets: [logoAsset, flyerAsset],
      logoImageUrl: 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare',
      headerImageUrl: upload.pageUrl,
      flyerImageUrl: upload.pageUrl,
      ticketUrl: staged.ticketUrl,
    };

    existingMap.set(staged.id, canonicalListing);
    updatedOrCreatedListings.push(canonicalListing);
  }

  const finalListingList = Array.from(existingMap.values());
  fs.writeFileSync(listingsStorePath, JSON.stringify(finalListingList, null, 2), 'utf8');
  console.log(`\nSuccessfully saved ${finalListingList.length} total listings to ${listingsStorePath}.`);
  console.log(`Ingested ${updatedOrCreatedListings.length} Illuminaughty events.`);

  console.log('\n--- Ingestion Manifest ---');
  for (const item of updatedOrCreatedListings) {
    console.log(`- [${item.id}] ${item.name} | ${item.time.start} | Coords: [${item.geopoint.latitude}, ${item.geopoint.longitude}] | Private: ${item.isAddressPrivate}`);
  }
}

runIngest().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
