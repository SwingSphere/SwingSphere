import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadConfigFromFile } from 'vite';

const source = JSON.parse(fs.readFileSync('data/listings.local.json', 'utf8'));
const loaded = await loadConfigFromFile({ command: 'build', mode: 'cloudflare' }, 'vite.config.ts');
const plugin = loaded.config.plugins.find((candidate) => candidate?.name === 'swingsphere-globe-showcase-data');
assert.ok(plugin, 'public listing virtual module plugin is present');

const virtualData = (id) => {
  const moduleId = plugin.resolveId(id);
  const code = plugin.load(moduleId);
  assert.ok(code?.startsWith('export default '));
  return JSON.parse(code.slice('export default '.length, -1));
};

test('public virtual modules omit precise metadata and addresses for private locations', () => {
  const listings = virtualData('virtual:swingsphere-public-listings');
  const showcase = virtualData('virtual:swingsphere-globe-showcase-events');
  const publicById = new Map(listings.map((listing) => [listing.id, listing]));
  const privateSources = source.filter((listing) =>
    listing.status === 'approved' && (
      listing.isAddressPrivate === true
      || listing.isPrivateLocation === true
      || ['approximate_public', 'private', 'hidden'].includes(listing.locationVisibility)
      || listing.locationMeta?.status === 'private'
    ),
  );
  assert.ok(privateSources.length > 0, 'fixture contains private listings');

  for (const original of privateSources) {
    const published = publicById.get(original.id);
    assert.ok(published, `${original.id} remains discoverable`);
    assert.equal(published.isAddressPrivate, true, `${original.id} retains its privacy flag`);
    assert.deepEqual(published.locationMeta, { status: 'approximate' });
    assert.equal(published.geopoint.address.addressLine1, undefined);
    assert.equal(published.geopoint.latitude, Math.round(original.geopoint.latitude * 100) / 100);
    assert.equal(published.geopoint.longitude, Math.round(original.geopoint.longitude * 100) / 100);
    for (const event of showcase.filter((item) => item.listingId === original.id)) {
      assert.equal(event.listing.locationVisibility, 'approximate_public');
      assert.equal(event.lat, published.geopoint.latitude);
      assert.equal(event.lon, published.geopoint.longitude);
    }
  }
});
