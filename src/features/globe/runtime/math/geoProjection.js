import * as THREE from "three";

export function wrapDegrees(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

export function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

export function rawGeographicToLocalPosition(lonDeg, latDeg, radius, meshLongitudeZeroLocalDeg) {
  const lon = THREE.MathUtils.degToRad(lonDeg + meshLongitudeZeroLocalDeg);
  const lat = THREE.MathUtils.degToRad(latDeg);
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    radius * cosLat * Math.sin(lon)
  );
}

const CANONICAL_GLOBE_LONGITUDE_ZERO_LOCAL_DEG = 90;

export function wgs84ToGlobeLocal(lng, lat, radius) {
  return rawGeographicToLocalPosition(
    wrapDegrees(lng),
    THREE.MathUtils.clamp(lat, -90, 90),
    radius,
    CANONICAL_GLOBE_LONGITUDE_ZERO_LOCAL_DEG
  );
}

export function globeLocalToWgs84(position) {
  const p = position.clone().normalize();
  const localLonDeg = THREE.MathUtils.radToDeg(Math.atan2(p.z, p.x));
  return {
    lng: wrapDegrees(localLonDeg - CANONICAL_GLOBE_LONGITUDE_ZERO_LOCAL_DEG),
    lat: THREE.MathUtils.radToDeg(THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)), -Math.PI / 2, Math.PI / 2))
  };
}

export function wgs84ToRenderedGlobeLocal(lng, lat, radius, config) {
  const alignment = config.alignment;
  const placedLon = wrapDegrees(alignment.pinLongitudeSign * lng + alignment.pinLongitudeOffsetDeg);
  const placedLat = THREE.MathUtils.clamp(
    alignment.pinLatitudeSign * lat + alignment.pinLatitudeOffsetDeg,
    -90,
    90
  );
  return rawGeographicToLocalPosition(
    placedLon,
    placedLat,
    radius,
    config.coordinateBasis.meshLongitudeZeroLocalDeg
  );
}

export function renderedGlobeLocalToWgs84(position, config) {
  const { lonDeg, latDeg } = localPositionToLonLat(position, config);
  const alignment = config.alignment;
  const lng = (lonDeg - alignment.pinLongitudeOffsetDeg) / alignment.pinLongitudeSign;
  const lat = (latDeg - alignment.pinLatitudeOffsetDeg) / alignment.pinLatitudeSign;
  return {
    lng: wrapDegrees(lng),
    lat: THREE.MathUtils.clamp(lat, -90, 90)
  };
}

export function geographicToLocalPosition(lonDeg, latDeg, radius, config) {
  return wgs84ToRenderedGlobeLocal(lonDeg, latDeg, radius, config);
}

export function localPositionToLonLat(point, config) {
  const p = point.clone().normalize();
  const localLonDeg = THREE.MathUtils.radToDeg(Math.atan2(p.z, p.x));
  return {
    lonDeg: wrapDegrees(localLonDeg - config.coordinateBasis.meshLongitudeZeroLocalDeg),
    latDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(p.y, -1, 1))),
    localLonDeg
  };
}

export function atlasUvFromLonLat(lonDeg, latDeg, config) {
  const alignment = config.alignment;
  const alignedLon = wrapDegrees(alignment.longitudeSign * lonDeg + alignment.longitudeOffsetDeg);
  const alignedLat = THREE.MathUtils.clamp(latDeg + alignment.latitudeOffsetDeg, -90, 90);
  let u = (alignedLon + 180) / 360;
  let v = 1 - (alignedLat + 90) / 180;
  u = wrap01(u);
  v = THREE.MathUtils.clamp(v, 0, 1);
  if (alignment.flipU) u = 1 - u;
  if (alignment.flipV) v = 1 - v;
  return {
    u: wrap01(u),
    v: THREE.MathUtils.clamp(v, 0, 1),
    rawLonDeg: lonDeg,
    rawLatDeg: latDeg,
    transformedLonDeg: alignedLon,
    transformedLatDeg: alignedLat
  };
}

export function sphericalUv(localPoint, config) {
  const { lonDeg, latDeg } = localPositionToLonLat(localPoint, config);
  return atlasUvFromLonLat(lonDeg, latDeg, config);
}
