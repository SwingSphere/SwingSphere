import * as THREE from "three";

export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
  rotationOffset: number = 0,
) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180 + rotationOffset) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

