import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePolygonAreaMeters,
  createRectangleLocalPoints,
  ensureClosedRing,
  localPointsToGeoJsonPolygon,
  geoJsonPolygonToLocalPoints,
  getLocalPointsBounds,
  transformLocalPoints,
  duplicateMassingObject,
} from '../components/dev/building-inspector/manualMassingUtils';
import type { ManualMassingObject } from '../components/dev/building-inspector/types';

test('calculatePolygonAreaMeters calculates correct area for rectangle', () => {
  // 10m by 20m rectangle -> area 200m²
  const points: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 20],
    [0, 20],
    [0, 0],
  ];
  const area = calculatePolygonAreaMeters(points);
  assert.equal(area, 200);
});

test('createRectangleLocalPoints creates 5 closed points with correct dimensions', () => {
  const p1 = { x: -5, z: 10 };
  const p2 = { x: 15, z: 30 };
  const points = createRectangleLocalPoints(p1, p2);

  assert.equal(points.length, 5);
  assert.deepEqual(points[0], points[4]); // closed
  const bounds = getLocalPointsBounds(points);
  assert.equal(bounds.width, 20);
  assert.equal(bounds.depth, 20);
  assert.equal(bounds.centerX, 5);
  assert.equal(bounds.centerZ, 20);
});

test('ensureClosedRing closes unclosed points', () => {
  const open: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];
  const closed = ensureClosedRing(open);
  assert.equal(closed.length, 4);
  assert.deepEqual(closed[0], closed[3]);
});

test('localPointsToGeoJsonPolygon and geoJsonPolygonToLocalPoints round-trip precisely', () => {
  const origin = { lng: -122.4194, lat: 37.7749 };
  const originalLocal: [number, number][] = [
    [0, 0],
    [15, 0],
    [15, 25],
    [0, 25],
    [0, 0],
  ];

  const geoJson = localPointsToGeoJsonPolygon(originalLocal, origin);
  assert.equal(geoJson.type, 'Polygon');
  assert.equal(geoJson.coordinates.length, 1);
  assert.equal(geoJson.coordinates[0].length, 5);

  const restoredLocal = geoJsonPolygonToLocalPoints(geoJson, origin);
  assert.equal(restoredLocal.length, 5);
  for (let i = 0; i < originalLocal.length; i++) {
    assert.ok(Math.abs(restoredLocal[i][0] - originalLocal[i][0]) < 0.05, `X difference at index ${i}`);
    assert.ok(Math.abs(restoredLocal[i][1] - originalLocal[i][1]) < 0.05, `Z difference at index ${i}`);
  }
});

test('transformLocalPoints translates points accurately', () => {
  const points: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const delta = { x: 5, z: -3 };
  const moved = transformLocalPoints(points, delta, 0);

  assert.equal(moved[0][0], 5);
  assert.equal(moved[0][1], -3);
  assert.equal(moved[1][0], 15);
  assert.equal(moved[1][1], -3);
});

test('duplicateMassingObject applies offset and assigns unique id and copy name', () => {
  const origin = { lng: -122.4194, lat: 37.7749 };
  const original: ManualMassingObject = {
    id: 'massing-1',
    name: 'Building 1',
    role: 'ambient',
    heightMeters: 10,
    localCoordinates: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    geoJson: localPointsToGeoJsonPolygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ], origin),
    areaMeters: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const copy = duplicateMassingObject(original, { x: 4, z: 4 }, origin, 2);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, 'Building 1 (Copy 2)');
  assert.equal(copy.role, 'ambient');
  assert.equal(copy.heightMeters, 10);
  assert.equal(copy.localCoordinates[0][0], 4);
  assert.equal(copy.localCoordinates[0][1], 4);
  assert.equal(copy.areaMeters, 100);
});
