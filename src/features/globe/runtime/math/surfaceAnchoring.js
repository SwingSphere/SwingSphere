import * as THREE from "three";
import { geographicToLocalPosition, wgs84ToGlobeLocal, wgs84ToRenderedGlobeLocal } from "./geoProjection.js";

const FALLBACK_DIRECTION_BIN_RADIANS = THREE.MathUtils.degToRad(2);
const FALLBACK_DIRECTION_SEARCH_RINGS = 3;
const fallbackVertexCaches = new WeakMap();

export function resolveLandSurfaceAnchor({
  lon,
  lat,
  config,
  landHitMesh,
  raycaster,
  origin = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  candidate = new THREE.Vector3()
}) {
  const localDirection = geographicToLocalPosition(lon, lat, 1, config).normalize();
  return resolveLandSurfaceAnchorFromDirection({
    localDirection,
    globeRadius: landHitMesh.geometry.boundingSphere?.radius ?? 3,
    landHitMesh,
    raycaster,
    origin,
    direction,
    candidate
  });
}

export function resolveCanonicalLandSurfaceAnchor({
  lng,
  lat,
  globeRadius,
  landHitMesh,
  raycaster,
  origin = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  candidate = new THREE.Vector3()
}) {
  const localDirection = wgs84ToGlobeLocal(lng, lat, globeRadius).normalize();
  return resolveLandSurfaceAnchorFromDirection({
    localDirection,
    globeRadius,
    landHitMesh,
    raycaster,
    origin,
    direction,
    candidate
  });
}

export function resolveRenderedGlobeLandSurfaceAnchor({
  lng,
  lat,
  config,
  globeRadius,
  landHitMesh,
  raycaster,
  origin = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  candidate = new THREE.Vector3(),
  preferTopSurface = false,
  centerOnLandGeometry = false
}) {
  const localDirection = wgs84ToRenderedGlobeLocal(lng, lat, globeRadius, config).normalize();
  return resolveLandSurfaceAnchorFromDirection({
    localDirection,
    globeRadius,
    landHitMesh,
    raycaster,
    origin,
    direction,
    candidate,
    preferTopSurface,
    centerOnLandGeometry
  });
}

export function resolveLandSurfaceAnchorFromDirection({
  localDirection,
  globeRadius,
  landHitMesh,
  raycaster,
  origin = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  candidate = new THREE.Vector3(),
  preferTopSurface = false,
  centerOnLandGeometry = false
}) {
  const normalizedLocalDirection = localDirection.clone().normalize();
  const landRadius = landHitMesh.geometry.boundingSphere?.radius ?? globeRadius;
  const meshScale = Math.max(
    Math.abs(landHitMesh.scale.x),
    Math.abs(landHitMesh.scale.y),
    Math.abs(landHitMesh.scale.z),
    1
  );
  const rayDistance = Math.max(landRadius * meshScale * 3 + landHitMesh.position.length(), 8);
  const landParent = landHitMesh.parent;
  landHitMesh.updateWorldMatrix(true, false);
  // Vector borders and other geographic overlays are calibrated against the
  // renderer's parent origin, so keep that as the default. Venue pins can opt
  // into land.glb's slightly offset geometric center without shifting the
  // GeoJSON/vector layers that share this anchoring helper.
  const landCenter = centerOnLandGeometry
    ? resolveLandParentLocalCenter(landHitMesh)
    : new THREE.Vector3();

  origin.copy(landCenter).addScaledVector(normalizedLocalDirection, rayDistance);
  landParent?.localToWorld(origin);
  const worldCenter = landCenter.clone();
  landParent?.localToWorld(worldCenter);
  direction.copy(worldCenter).sub(origin).normalize();
  raycaster.set(origin, direction);
  raycaster.near = 0;
  raycaster.far = origin.distanceTo(worldCenter) * 2;
  const hits = raycaster.intersectObject(landHitMesh, false);
  let bestSurfaceHit = null;
  let bestSurfaceProjection = -Infinity;
  for (const hit of hits) {
    const anchorPosition = toLandParentLocalPoint(landHitMesh, hit.point);
    const centerRelativeAnchor = anchorPosition.clone().sub(landCenter);
    if (centerRelativeAnchor.dot(normalizedLocalDirection) <= 0) continue;
    const radialDirection = centerRelativeAnchor.normalize();
    const surfaceNormal = resolveLandParentLocalSurfaceNormal({
      landHitMesh,
      hit,
      anchorPosition,
      radialDirection
    });
    // land.glb includes near-vertical coastline walls. Those are part of the
    // sculpted model, but a venue pin should sit on the terrain cap rather than
    // attach to a cliff face. Pin callers can ask us to ignore those wall hits.
    if (preferTopSurface && surfaceNormal.dot(radialDirection) < 0.12) continue;
    if (!preferTopSurface) return { anchorPosition, radialDirection, surfaceNormal, hit: true };
    const projection = anchorPosition.clone().sub(landCenter).dot(normalizedLocalDirection);
    if (projection > bestSurfaceProjection) {
      bestSurfaceProjection = projection;
      bestSurfaceHit = { anchorPosition, radialDirection, surfaceNormal, hit: true };
    }
  }
  if (bestSurfaceHit) return bestSurfaceHit;
  return resolveNearestLandVertexAnchor(
    landHitMesh,
    normalizedLocalDirection,
    candidate,
    centerOnLandGeometry
  );
}

function resolveLandParentLocalCenter(landHitMesh) {
  if (!landHitMesh.geometry.boundingSphere) landHitMesh.geometry.computeBoundingSphere();
  const center = landHitMesh.geometry.boundingSphere?.center?.clone() ?? new THREE.Vector3();
  landHitMesh.localToWorld(center);
  landHitMesh.parent?.worldToLocal(center);
  return center;
}

function toLandParentLocalPoint(landHitMesh, worldPoint) {
  const anchorPosition = worldPoint.clone();
  landHitMesh.parent?.worldToLocal(anchorPosition);
  return anchorPosition;
}

function resolveLandParentLocalSurfaceNormal({ landHitMesh, hit, anchorPosition, radialDirection }) {
  if (!hit.face) return radialDirection.clone();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(landHitMesh.matrixWorld);
  const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  const worldSurfacePoint = hit.point.clone().add(worldNormal);
  const parentLocalSurfacePoint = toLandParentLocalPoint(landHitMesh, worldSurfacePoint);
  const surfaceNormal = parentLocalSurfacePoint.sub(anchorPosition).normalize();
  if (surfaceNormal.dot(radialDirection) < 0) surfaceNormal.multiplyScalar(-1);
  return surfaceNormal;
}

function resolveNearestLandVertexAnchor(landHitMesh, localDirection, candidate, centerOnLandGeometry = false) {
  const cache = getFallbackVertexCache(landHitMesh, candidate, centerOnLandGeometry);
  const candidates = resolveNearbyLandVertices(cache, localDirection);
  const landCenter = cache.center;
  let bestProjectionScale = null;
  let bestDistanceSq = Infinity;
  for (const vertex of candidates) {
    const relativeVertex = vertex.clone().sub(landCenter);
    const projectionScale = relativeVertex.dot(localDirection);
    if (projectionScale <= 0) continue;
    const projectedX = localDirection.x * projectionScale;
    const projectedY = localDirection.y * projectionScale;
    const projectedZ = localDirection.z * projectionScale;
    const dx = relativeVertex.x - projectedX;
    const dy = relativeVertex.y - projectedY;
    const dz = relativeVertex.z - projectedZ;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const isCloser = distanceSq < bestDistanceSq - 1e-10;
    const isSameDirectionButHigher = Math.abs(distanceSq - bestDistanceSq) <= 1e-10
      && (bestProjectionScale == null || projectionScale > bestProjectionScale);
    if (!isCloser && !isSameDirectionButHigher) continue;
    bestDistanceSq = distanceSq;
    bestProjectionScale = projectionScale;
  }
  const radialDirection = localDirection.clone().normalize();
  const anchorPosition = landCenter.clone().addScaledVector(radialDirection, bestProjectionScale ?? 1);
  return { anchorPosition, radialDirection, surfaceNormal: radialDirection.clone(), hit: false };
}

function resolveNearbyLandVertices(cache, localDirection) {
  if (Math.abs(localDirection.y) > 0.985) return cache.vertices;
  const [longitudeBin, latitudeBin] = directionBin(localDirection, cache.longitudeBinCount, cache.latitudeBinCount);
  const nearby = [];
  let firstPopulatedRing = -1;
  for (let ring = 0; ring <= FALLBACK_DIRECTION_SEARCH_RINGS; ring += 1) {
    for (let latitudeOffset = -ring; latitudeOffset <= ring; latitudeOffset += 1) {
      for (let longitudeOffset = -ring; longitudeOffset <= ring; longitudeOffset += 1) {
        if (ring > 0 && Math.abs(latitudeOffset) !== ring && Math.abs(longitudeOffset) !== ring) continue;
        const candidateLatitudeBin = latitudeBin + latitudeOffset;
        if (candidateLatitudeBin < 0 || candidateLatitudeBin >= cache.latitudeBinCount) continue;
        const candidateLongitudeBin = (longitudeBin + longitudeOffset + cache.longitudeBinCount) % cache.longitudeBinCount;
        const bucket = cache.buckets.get(`${candidateLongitudeBin}:${candidateLatitudeBin}`);
        if (bucket) nearby.push(...bucket);
      }
    }
    if (nearby.length && firstPopulatedRing < 0) firstPopulatedRing = ring;
    if (firstPopulatedRing >= 0 && ring > firstPopulatedRing) break;
  }
  return nearby.length ? nearby : cache.vertices;
}

function getFallbackVertexCache(landHitMesh, candidate, centerOnLandGeometry = false) {
  const transformKey = [
    landHitMesh.position.x,
    landHitMesh.position.y,
    landHitMesh.position.z,
    landHitMesh.quaternion.x,
    landHitMesh.quaternion.y,
    landHitMesh.quaternion.z,
    landHitMesh.quaternion.w,
    landHitMesh.scale.x,
    landHitMesh.scale.y,
    landHitMesh.scale.z,
    centerOnLandGeometry ? "mesh-center" : "parent-origin"
  ].join(":");
  const cached = fallbackVertexCaches.get(landHitMesh);
  if (cached?.transformKey === transformKey && cached.geometry === landHitMesh.geometry) return cached;

  const longitudeBinCount = Math.ceil((Math.PI * 2) / FALLBACK_DIRECTION_BIN_RADIANS);
  const latitudeBinCount = Math.ceil(Math.PI / FALLBACK_DIRECTION_BIN_RADIANS);
  const vertices = [];
  const buckets = new Map();
  const center = centerOnLandGeometry
    ? resolveLandParentLocalCenter(landHitMesh)
    : new THREE.Vector3();
  const position = landHitMesh.geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    candidate.fromBufferAttribute(position, index);
    landHitMesh.localToWorld(candidate);
    landHitMesh.parent?.worldToLocal(candidate);
    const vertex = candidate.clone();
    vertices.push(vertex);
    const [longitudeBin, latitudeBin] = directionBin(vertex.clone().sub(center), longitudeBinCount, latitudeBinCount);
    const key = `${longitudeBin}:${latitudeBin}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(vertex);
  }
  const next = { geometry: landHitMesh.geometry, transformKey, center, vertices, buckets, longitudeBinCount, latitudeBinCount };
  fallbackVertexCaches.set(landHitMesh, next);
  return next;
}

function directionBin(direction, longitudeBinCount, latitudeBinCount) {
  const normalized = direction.clone().normalize();
  const longitude = Math.atan2(normalized.z, normalized.x);
  const latitude = Math.asin(THREE.MathUtils.clamp(normalized.y, -1, 1));
  const longitudeBin = Math.min(
    longitudeBinCount - 1,
    Math.floor(((longitude + Math.PI) / (Math.PI * 2)) * longitudeBinCount)
  );
  const latitudeBin = Math.min(
    latitudeBinCount - 1,
    Math.floor(((latitude + Math.PI / 2) / Math.PI) * latitudeBinCount)
  );
  return [longitudeBin, latitudeBin];
}
