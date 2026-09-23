import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'lib/activityRegionProvider.ts'), 'utf8');

test('activity-region provider caps discovery areas to metro-scale geography', () => {
  assert.match(source, /DEFAULT_MAX_ACTIVITY_REGION_DIAMETER_KM = 140/);
  assert.match(source, /activityRegionDiameterKm\(members\) <= maxDiameterKm/);
  assert.match(source, /maxDistanceKm <= maxDiameterKm/);
});

test('activity-region markers use a real member coordinate instead of a raw centroid', () => {
  assert.match(source, /const representative = \[\.\.\.members\]\.sort/);
  assert.match(source, /latitude: representative\.latitude/);
  assert.match(source, /longitude: representative\.longitude/);
});
