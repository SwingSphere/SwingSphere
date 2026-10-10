import * as THREE from 'three';
import type { ManualMassingObject, ManualMassingRole } from './types';

/**
 * Calculates planar area in square meters from local 2D coordinates [x, z].
 * Uses standard Shoelace formula.
 */
export const calculatePolygonAreaMeters = (points: [number, number][]): number => {
  if (points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
};

/**
 * Creates 4 closed corners of an axis-aligned rectangle from two diagonal points.
 * Returns 5 points with the first point repeated at the end to ensure closure.
 */
export const createRectangleLocalPoints = (
  p1: { x: number; z: number },
  p2: { x: number; z: number },
): [number, number][] => {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minZ = Math.min(p1.z, p2.z);
  const maxZ = Math.max(p1.z, p2.z);

  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
    [minX, minZ],
  ];
};

/**
 * Ensures an array of points forms a closed polygon ring by appending the
 * first point if not already matching.
 */
export const ensureClosedRing = (points: [number, number][]): [number, number][] => {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) {
    return points;
  }
  return [...points, [first[0], first[1]]];
};

/**
 * Converts local scene coordinates in meters [x, z] to geographic GeoJSON Polygon coordinates [lng, lat].
 * In Three.js: X = East (+), Z = South (+), Y = Up.
 * Geographic: lng = East (+), lat = North (+).
 */
export const localPointsToGeoJsonPolygon = (
  localPoints: [number, number][],
  origin: { lng: number; lat: number },
): GeoJSON.Polygon => {
  const closed = ensureClosedRing(localPoints);
  const metersPerDegreeLng = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  const metersPerDegreeLat = 110540;

  const coordinates: [number, number][] = closed.map(([x, z]) => {
    const lng = origin.lng + x / metersPerDegreeLng;
    const lat = origin.lat + (-z) / metersPerDegreeLat;
    return [Number(lng.toFixed(7)), Number(lat.toFixed(7))];
  });

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
};

/**
 * Converts a GeoJSON Polygon in [lng, lat] to local scene coordinates in meters [x, z].
 */
export const geoJsonPolygonToLocalPoints = (
  polygon: GeoJSON.Polygon,
  origin: { lng: number; lat: number },
): [number, number][] => {
  const ring = polygon.coordinates[0];
  if (!ring || !ring.length) return [];

  const metersPerDegreeLng = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  const metersPerDegreeLat = 110540;

  return ring.map(([lng, lat]) => {
    const x = (lng - origin.lng) * metersPerDegreeLng;
    const z = -(lat - origin.lat) * metersPerDegreeLat;
    return [x, z];
  });
};

/**
 * Builds a Three.js ExtrudeGeometry for a manual massing footprint.
 * Local points are [x, z] in meters.
 * In Shape space: shape.x = x, shape.y = -z.
 * Extrusion height goes along +Z in geometry space, which when rotated by -PI/2
 * maps to world +Y (Up).
 */
export const buildExtrudedManualMassingGeometry = (
  localPoints: [number, number][],
  heightMeters: number,
): THREE.ExtrudeGeometry | null => {
  const points = ensureClosedRing(localPoints);
  // Remove closing duplicate for Shape point definitions
  const uniquePoints = points.slice(0, points.length - 1);
  if (uniquePoints.length < 3) return null;

  let contour = uniquePoints.map(([x, z]) => new THREE.Vector2(x, -z));
  if (contour.length < 3) return null;

  if (!THREE.ShapeUtils.isClockWise(contour)) {
    contour = [...contour].reverse();
  }

  const shape = new THREE.Shape(contour);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, heightMeters),
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });

  return geometry;
};

/**
 * Calculates the bounding box of local points: { minX, maxX, minZ, maxZ, centerX, centerZ, width, depth }
 */
export const getLocalPointsBounds = (points: [number, number][]) => {
  if (!points.length) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, centerX: 0, centerZ: 0, width: 0, depth: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ),
  };
};

/**
 * Duplicates a manual massing object with a slight spatial offset (default +4m, +4m).
 */
export const duplicateMassingObject = (
  original: ManualMassingObject,
  offsetMeters: { x: number; z: number } = { x: 4, z: 4 },
  origin: { lng: number; lat: number },
  nextIndex: number,
): ManualMassingObject => {
  const newCoordinates: [number, number][] = original.localCoordinates.map(([x, z]) => [
    x + offsetMeters.x,
    z + offsetMeters.z,
  ]);

  const newGeoJson = localPointsToGeoJsonPolygon(newCoordinates, origin);
  const now = new Date().toISOString();

  return {
    id: `massing-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: `${original.name.replace(/ \(Copy.*\)/, '')} (Copy ${nextIndex})`,
    role: original.role,
    heightMeters: original.heightMeters,
    minHeightMeters: original.minHeightMeters,
    localCoordinates: newCoordinates,
    geoJson: newGeoJson,
    areaMeters: calculatePolygonAreaMeters(newCoordinates),
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Transforms local points by translation delta and optional rotation around center.
 */
export const transformLocalPoints = (
  points: [number, number][],
  delta: { x: number; z: number },
  rotationDeg: number = 0,
  center?: { x: number; z: number },
): [number, number][] => {
  const pivot = center ?? getLocalPointsBounds(points);
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return points.map(([x, z]) => {
    // Relative to pivot
    const rx = x - pivot.centerX;
    const rz = z - pivot.centerZ;

    // Rotate
    const rotX = rx * cos - rz * sin;
    const rotZ = rx * sin + rz * cos;

    // Translate back and apply delta
    return [
      rotX + pivot.centerX + delta.x,
      rotZ + pivot.centerZ + delta.z,
    ];
  });
};
