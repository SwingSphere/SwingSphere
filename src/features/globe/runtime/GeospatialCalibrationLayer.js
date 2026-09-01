import * as THREE from "three";
import { wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { resolveRenderedGlobeLandSurfaceAnchor } from "./math/surfaceAnchoring.js";

const DEFAULT_ANCHORS = [
  { id: "san-francisco", name: "San Francisco", lng: -122.4194, lat: 37.7749 },
  { id: "new-york", name: "New York", lng: -74.006, lat: 40.7128 },
  { id: "miami", name: "Miami", lng: -80.1918, lat: 25.7617 },
  { id: "paris", name: "Paris", lng: 2.3522, lat: 48.8566 },
  { id: "milan", name: "Milan", lng: 9.19, lat: 45.4642 },
  { id: "tokyo", name: "Tokyo", lng: 139.6503, lat: 35.6762 },
  { id: "sydney", name: "Sydney", lng: 151.2093, lat: -33.8688 },
  { id: "santiago", name: "Santiago", lng: -70.6693, lat: -33.4489 },
  { id: "cape-town", name: "Cape Town", lng: 18.4241, lat: -33.9249 },
];

export class GeospatialCalibrationLayer {
  constructor({ renderer, config }) {
    this.renderer = renderer;
    this.config = config;
    this.options = config.geospatialCalibration ?? {};
    this.visible = Boolean(this.options.visible);
    this.group = new THREE.Group();
    this.group.name = "swingsphere-geospatial-calibration";
    this.group.renderOrder = 46;
    this.group.visible = this.visible;
    this.renderer.globe.add(this.group);
    this.items = [];
    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.surfaceCandidate = new THREE.Vector3();
    this.disposed = false;
  }

  mount() {
    if (this.disposed) return;
    const anchors = Array.isArray(this.options.anchors) && this.options.anchors.length
      ? this.options.anchors
      : DEFAULT_ANCHORS;
    for (const anchor of anchors) {
      const texture = createAnchorTexture(anchor.name);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = `geospatial-calibration:${anchor.id}`;
      sprite.renderOrder = 47;

      const groundTexture = createGroundAnchorTexture();
      const groundMaterial = new THREE.SpriteMaterial({
        map: groundTexture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      });
      const groundSprite = new THREE.Sprite(groundMaterial);
      groundSprite.name = `geospatial-calibration-ground:${anchor.id}`;
      groundSprite.renderOrder = 48;

      const stemGeometry = new THREE.BufferGeometry();
      stemGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const stemMaterial = new THREE.LineBasicMaterial({
        color: "#67e8f9",
        transparent: true,
        opacity: 0.94,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      const stem = new THREE.Line(stemGeometry, stemMaterial);
      stem.name = `geospatial-calibration-stem:${anchor.id}`;
      stem.renderOrder = 47;

      this.group.add(stem, groundSprite, sprite);
      this.items.push({
        anchor,
        sprite,
        material,
        texture,
        groundSprite,
        groundMaterial,
        groundTexture,
        stem,
        stemGeometry,
        stemMaterial,
        surfacePosition: new THREE.Vector3(),
        radialDirection: new THREE.Vector3(),
      });
    }
    this.refreshPositions();
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.group.visible = this.visible;
  }

  refreshPositions() {
    if (this.disposed) return;
    const globeRadius = this.renderer.globeRadius;
    const landHitMesh = this.renderer.landHitMesh;
    const fallbackSurfaceRadius = globeRadius * Number(this.options.surfaceRadiusScale ?? 1.006);
    const labelLift = globeRadius * Number(this.options.labelLiftScale ?? 0.105);
    const surfaceClearance = globeRadius * Number(this.options.surfaceClearanceScale ?? 0.0032);

    for (const item of this.items) {
      const fallbackDirection = wgs84ToRenderedGlobeLocal(
        item.anchor.lng,
        item.anchor.lat,
        1,
        this.config
      ).normalize();

      let surfacePosition = fallbackDirection.clone().multiplyScalar(fallbackSurfaceRadius);
      let radialDirection = fallbackDirection;
      if (landHitMesh) {
        const surface = resolveRenderedGlobeLandSurfaceAnchor({
          lng: item.anchor.lng,
          lat: item.anchor.lat,
          config: this.config,
          globeRadius,
          landHitMesh,
          raycaster: this.raycaster,
          origin: this.rayOrigin,
          direction: this.rayDirection,
          candidate: this.surfaceCandidate,
        });
        if (surface?.anchorPosition) {
          radialDirection = (surface.radialDirection ?? fallbackDirection).clone().normalize();
          surfacePosition = surface.anchorPosition.clone().addScaledVector(radialDirection, surfaceClearance);
        }
      }

      item.surfacePosition.copy(surfacePosition);
      item.radialDirection.copy(radialDirection);
      item.groundSprite.position.copy(surfacePosition);
      item.sprite.position.copy(surfacePosition).addScaledVector(radialDirection, labelLift);
      updateStemGeometry(item.stemGeometry, surfacePosition, item.sprite.position);
    }
  }

  update() {
    if (!this.visible || this.disposed) return;
    this.group.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    const distance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    const width = THREE.MathUtils.clamp(distance * 0.072, 0.22, 0.72);
    const height = width * 0.3;
    const groundSize = THREE.MathUtils.clamp(distance * 0.018, 0.055, 0.16);
    for (const item of this.items) {
      item.sprite.scale.set(width, height, 1);
      item.groundSprite.scale.set(groundSize, groundSize, 1);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items) {
      item.material.dispose();
      item.texture.dispose();
      item.groundMaterial.dispose();
      item.groundTexture.dispose();
      item.stemGeometry.dispose();
      item.stemMaterial.dispose();
      this.group.remove(item.sprite, item.groundSprite, item.stem);
    }
    this.items = [];
    this.renderer.globe.remove(this.group);
    this.group.clear();
  }
}

function updateStemGeometry(geometry, start, end) {
  const position = geometry.getAttribute("position");
  position.setXYZ(0, start.x, start.y, start.z);
  position.setXYZ(1, end.x, end.y, end.z);
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function createGroundAnchorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.shadowColor = "rgba(103,232,249,0.92)";
  context.shadowBlur = 18;
  context.beginPath();
  context.arc(96, 96, 44, 0, Math.PI * 2);
  context.strokeStyle = "rgba(103,232,249,0.98)";
  context.lineWidth = 8;
  context.stroke();
  context.shadowBlur = 0;

  context.beginPath();
  context.moveTo(96, 22);
  context.lineTo(96, 70);
  context.moveTo(96, 122);
  context.lineTo(96, 170);
  context.moveTo(22, 96);
  context.lineTo(70, 96);
  context.moveTo(122, 96);
  context.lineTo(170, 96);
  context.strokeStyle = "rgba(255,255,255,0.98)";
  context.lineWidth = 6;
  context.stroke();

  context.beginPath();
  context.arc(96, 96, 10, 0, Math.PI * 2);
  context.fillStyle = "#67e8f9";
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createAnchorTexture(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.shadowColor = "rgba(0,0,0,0.9)";
  context.shadowBlur = 16;
  context.fillStyle = "rgba(6,10,14,0.88)";
  roundRect(context, 90, 34, 520, 112, 34);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(103,232,249,0.9)";
  context.lineWidth = 5;
  context.stroke();

  context.beginPath();
  context.arc(62, 90, 29, 0, Math.PI * 2);
  context.fillStyle = "rgba(6,10,14,0.92)";
  context.fill();
  context.strokeStyle = "#67e8f9";
  context.lineWidth = 5;
  context.stroke();
  context.beginPath();
  context.moveTo(62, 48);
  context.lineTo(62, 132);
  context.moveTo(20, 90);
  context.lineTo(104, 90);
  context.strokeStyle = "rgba(255,255,255,0.95)";
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.arc(62, 90, 7, 0, Math.PI * 2);
  context.fillStyle = "#67e8f9";
  context.fill();

  context.font = "700 42px Inter, ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "#f8fafc";
  context.textBaseline = "middle";
  context.fillText(name, 124, 92, 456);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
