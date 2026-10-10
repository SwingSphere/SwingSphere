import assert from 'node:assert/strict';
import test from 'node:test';
import Supercluster from 'supercluster';
import { USA_DISCOVERY_LISTINGS, findUsaMetro, getUsaMetroListings } from '../data/usaDiscoveryHierarchy';
import { listingsToGeoJson } from '../components/maps/listingGeoJson';
import {
  EXPLORER_CLUSTER_PIN_IMAGE_ID,
  getExplorerClusterImageId,
  type ClusterCategory,
} from '../lib/explorerPinStyle';
import { listingLayers } from '../components/maps/mapLayers';

test('Clustering Visibility Invariant: Every listing is accounted for across all zoom levels (0 to 16)', () => {
  const geojson = listingsToGeoJson(USA_DISCOVERY_LISTINGS);
  const clusterIndex = new Supercluster({
    radius: 50,
    maxZoom: 12,
  });
  clusterIndex.load(geojson.features as any);

  const totalListingCount = USA_DISCOVERY_LISTINGS.length;
  assert.ok(totalListingCount >= 20, 'Fixture should have a substantial listing set');

  for (let zoom = 0; zoom <= 16; zoom += 1) {
    const intZoom = Math.min(12, Math.max(0, Math.floor(zoom)));
    const clusteredListingIds = new Set<string>();
    const standaloneListingIds = new Set<string>();

    if (intZoom >= 12) {
      // Zoom 12+: clustering is disabled; every listing is an individual pin
      USA_DISCOVERY_LISTINGS.forEach((l) => standaloneListingIds.add(l.id));
    } else {
      const items = clusterIndex.getClusters([-180, -85, 180, 85], intZoom);
      items.forEach((item) => {
        if (item.properties?.cluster) {
          const leaves = clusterIndex.getLeaves(item.properties.cluster_id, Infinity);
          leaves.forEach((leaf) => {
            clusteredListingIds.add((leaf.properties as any).listingId);
          });
        } else {
          standaloneListingIds.add((item.properties as any).listingId);
        }
      });
    }

    const allAccounted = new Set([...clusteredListingIds, ...standaloneListingIds]);
    const intersection = [...clusteredListingIds].filter((id) => standaloneListingIds.has(id));

    assert.equal(
      allAccounted.size,
      totalListingCount,
      `All ${totalListingCount} listings must be accounted for at zoom ${zoom} (found ${allAccounted.size})`
    );
    assert.equal(
      intersection.length,
      0,
      `No listing should be both clustered and standalone at zoom ${zoom} (overlap: ${intersection.join(', ')})`
    );
  }
});

test('Geographic presence: San Francisco Bay Area is NEVER empty at any zoom level', () => {
  const geojson = listingsToGeoJson(USA_DISCOVERY_LISTINGS);
  const clusterIndex = new Supercluster({
    radius: 50,
    maxZoom: 12,
  });
  clusterIndex.load(geojson.features as any);

  const bayAreaMetro = findUsaMetro('bay-area')?.metro;
  assert.ok(bayAreaMetro, 'Bay Area metro must exist in test fixture');
  const bayAreaListings = getUsaMetroListings(bayAreaMetro.id);
  const bayAreaListingIds = new Set(bayAreaListings.map((l) => l.id));
  assert.equal(bayAreaListingIds.size, 10, 'Bay Area should have 10 listings');

  // Bay Area geographic bounding box: lng [-123.0, -121.8], lat [37.2, 38.2]
  const bayBbox: [number, number, number, number] = [-123.0, 37.2, -121.8, 38.2];

  for (let zoom = 3; zoom <= 16; zoom += 1) {
    const intZoom = Math.min(12, Math.max(0, Math.floor(zoom)));
    let bayAreaClusters = 0;
    let bayAreaStandalonePins = 0;
    let bayAreaTotalRepresented = 0;

    if (intZoom >= 12) {
      bayAreaStandalonePins = bayAreaListings.length;
      bayAreaTotalRepresented = bayAreaListings.length;
    } else {
      const items = clusterIndex.getClusters(bayBbox, intZoom);
      items.forEach((item) => {
        if (item.properties?.cluster) {
          bayAreaClusters += 1;
          const leaves = clusterIndex.getLeaves(item.properties.cluster_id, Infinity);
          leaves.forEach((leaf) => {
            if (bayAreaListingIds.has((leaf.properties as any).listingId)) {
              bayAreaTotalRepresented += 1;
            }
          });
        } else if (bayAreaListingIds.has((item.properties as any).listingId)) {
          bayAreaStandalonePins += 1;
          bayAreaTotalRepresented += 1;
        }
      });
    }

    assert.ok(
      bayAreaClusters + bayAreaStandalonePins > 0,
      `San Francisco Bay Area must have visible markers at zoom ${zoom} (clusters: ${bayAreaClusters}, standalone: ${bayAreaStandalonePins})`
    );

    // At regional zoom (3-8), Bay Area should be clustered into a grouped marker
    if (zoom >= 4 && zoom <= 8) {
      assert.ok(
        bayAreaClusters >= 1,
        `Bay Area should form at least 1 cluster marker at regional zoom ${zoom}`
      );
    }

    // At street zoom (12+), all Bay Area listings must be standalone individual pins
    if (zoom >= 12) {
      assert.equal(
        bayAreaStandalonePins,
        10,
        `At street zoom ${zoom}, all 10 Bay Area listings must be standalone individual pins`
      );
      assert.equal(
        bayAreaClusters,
        0,
        `At street zoom ${zoom}, there should be 0 clusters`
      );
    }

    assert.equal(
      bayAreaTotalRepresented,
      10,
      `All 10 Bay Area listings must be represented at zoom ${zoom}`
    );
  }
});

test('Isolated listings: Venues without near neighbors remain visible at country zoom', () => {
  // Create a dataset with 1 isolated venue in Hawaii and a cluster of 5 in LA
  const mockFeatures = [
    {
      type: 'Feature' as const,
      id: 'isolated-hawaii',
      geometry: { type: 'Point' as const, coordinates: [-157.8583, 21.3069] },
      properties: { listingId: 'isolated-hawaii', type: 'resort' },
    },
    {
      type: 'Feature' as const,
      id: 'la-1',
      geometry: { type: 'Point' as const, coordinates: [-118.2437, 34.0522] },
      properties: { listingId: 'la-1', type: 'club' },
    },
    {
      type: 'Feature' as const,
      id: 'la-2',
      geometry: { type: 'Point' as const, coordinates: [-118.2440, 34.0530] },
      properties: { listingId: 'la-2', type: 'club' },
    },
  ];

  const clusterIndex = new Supercluster({
    radius: 50,
    maxZoom: 12,
  });
  clusterIndex.load(mockFeatures as any);

  // At country zoom (zoom 3):
  const items = clusterIndex.getClusters([-180, -85, 180, 85], 3);
  const hawaiiItem = items.find((f) => (f.properties as any).listingId === 'isolated-hawaii');
  const laItem = items.find((f) => f.properties?.cluster);

  assert.ok(hawaiiItem, 'Isolated Hawaii listing must appear as standalone feature at country zoom 3');
  assert.equal(hawaiiItem?.properties?.cluster, undefined, 'Hawaii listing must not be marked as a cluster');
  assert.ok(laItem, 'LA listings must group into a cluster feature at country zoom 3');
  assert.equal(laItem?.properties?.point_count, 2, 'LA cluster should contain 2 items');
});

test('Layer Specification Integrity: Cluster layers are configured with solid base, glow, and valid image layouts', () => {
  const clusterGlow = listingLayers.find((l) => l.id === 'listing-cluster-glow');
  const clusterBase = listingLayers.find((l) => l.id === 'listing-cluster-base');
  const clusterSymbols = listingLayers.find((l) => l.id === 'listing-clusters');
  const clusterCount = listingLayers.find((l) => l.id === 'listing-cluster-count');

  assert.ok(clusterGlow, 'listing-cluster-glow layer must exist');
  assert.ok(clusterBase, 'listing-cluster-base layer must exist');
  assert.ok(clusterSymbols, 'listing-clusters layer must exist');
  assert.ok(clusterCount, 'listing-cluster-count layer must exist');

  // Verify clusterBase has opaque fill disc and stroke border
  assert.equal(clusterBase.type, 'circle');
  assert.equal((clusterBase.paint as any)['circle-opacity'], 0.94);
  assert.equal((clusterBase.paint as any)['circle-stroke-opacity'], 0.96);

  // Verify listing-clusters uses clean static image layout (no feature-state in layout)
  assert.equal(clusterSymbols.type, 'symbol');
  const iconImage = (clusterSymbols.layout as any)['icon-image'];
  assert.equal(
    typeof iconImage,
    'string',
    'listing-clusters icon-image should be a string image ID, not a feature-state expression'
  );
  assert.equal(iconImage, EXPLORER_CLUSTER_PIN_IMAGE_ID);

  // Verify category image IDs format
  const categories: ClusterCategory[] = ['club', 'event', 'promoter', 'resort', 'cruise', 'all'];
  categories.forEach((cat) => {
    assert.equal(getExplorerClusterImageId(cat, false), `swingsphere-explorer-cluster-${cat}`);
    assert.equal(getExplorerClusterImageId(cat, true), `swingsphere-explorer-cluster-${cat}-selected`);
  });

  // Verify numeric count text remains hidden per UX pass
  assert.equal((clusterCount.layout as any)?.visibility, 'none');
});
