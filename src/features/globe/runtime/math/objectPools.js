import * as THREE from "three";

export class GlobeObjectPool {
  constructor() {
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.v4 = new THREE.Vector3();
    this.v5 = new THREE.Vector3();
    this.q1 = new THREE.Quaternion();
    this.sphere = new THREE.Sphere();
    this.box = new THREE.Box3();
    this.vec2 = new THREE.Vector2();
  }
}

export function disposeObject3D(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value && typeof value === "object" && value.isTexture) value.dispose();
      });
      material.map?.dispose();
      material.dispose?.();
    });
  });
}
