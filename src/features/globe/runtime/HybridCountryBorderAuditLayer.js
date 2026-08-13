import * as THREE from "three";
import { wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { resolveLandSurfaceAnchorFromDirection } from "./math/surfaceAnchoring.js";

const STYLES = {
  denseCoastline: { color: "#36efff", opacity: 0.65, order: 50 },
  simplifiedCoastline: { color: "#31cfff", opacity: 1, order: 51 },
  politicalSegments: { color: "#ffe45e", opacity: 1, order: 52 },
  rejectedGeoJsonCoastline: { color: "#ff405a", opacity: 0.9, order: 49 },
  assembled: { color: "#50ff86", opacity: 1, order: 53 },
  junctions: { color: "#ffffff", opacity: 1, order: 54, points: true }
};

export class HybridCountryBorderAuditLayer {
  constructor({ renderer, config }) {
    this.renderer = renderer;
    this.config = config;
    this.options = config.hybridBorderAudit ?? {};
    this.group = new THREE.Group();
    this.group.name = "hybrid-country-border-audit";
    this.renderer.globe.add(this.group);
    this.layers = new Map();
    this.manifest = null;
    this.requestToken = 0;
    this.selectedCountryId = null;
    this.layerVisibility = { ...(this.options.layers ?? {}) };
    this.sourceColors = this.options.sourceColors !== false;
    this.diagnostics = null;
    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.surfaceCandidate = new THREE.Vector3();
    this.positionCache = new Map();
  }

  async mount() {
    const response = await fetch(this.options.manifestUrl ?? "/assets/globe/borders/hybrid/v1/manifest.json");
    if (!response.ok) throw new Error(`Unable to load hybrid-border audit manifest (${response.status}).`);
    this.manifest = await response.json();
  }

  async setSelectedCountry(country) {
    const entry = findEntry(this.manifest, country);
    const countryId = entry?.iso3 ?? null;
    if (countryId === this.selectedCountryId) return;
    this.selectedCountryId = countryId;
    this.#clearLayers();
    this.diagnostics = null;
    if (!entry?.diagnosticUrl) return;
    const token = ++this.requestToken;
    const startedAt = performance.now();
    const response = await fetch(entry.diagnosticUrl);
    if (!response.ok) throw new Error(`Unable to load hybrid-border diagnostics (${response.status}).`);
    const data = await response.json();
    if (token !== this.requestToken) return;
    const pathLayers = {
      denseCoastline: data.rings.flatMap((ring) => ring.denseCoastline ?? []),
      simplifiedCoastline: data.rings.flatMap((ring) => ring.simplifiedCoastline ?? []),
      politicalSegments: data.rings.flatMap((ring) => ring.politicalSegments ?? []),
      rejectedGeoJsonCoastline: data.rings.flatMap((ring) => ring.rejectedGeoJsonCoastline ?? []),
      assembled: data.rings.map((ring) => ring.assembled ?? [])
    };
    for (const [id, paths] of Object.entries(pathLayers)) this.#addPathLayer(id, paths);
    this.#addPointLayer("junctions", data.rings.flatMap((ring) => (ring.junctions ?? []).map((junction) => junction.coordinate)));
    this.diagnostics = {
      countryId,
      loadDurationMs: performance.now() - startedAt,
      validation: data.validation,
      layers: Object.fromEntries(Object.entries(pathLayers).map(([id, paths]) => [id, { pathCount: paths.length, pointCount: paths.reduce((sum, path) => sum + path.length, 0) }]))
    };
  }

  setLayers(next = {}) {
    Object.assign(this.layerVisibility, next);
    for (const [id, visible] of Object.entries(next)) if (typeof visible === "boolean" && this.layers.has(id)) this.layers.get(id).visible = visible;
  }

  setSourceColors(enabled) {
    this.sourceColors = Boolean(enabled);
    for (const [id, object] of this.layers) object.material.color.set(this.sourceColors ? STYLES[id].color : "#ffffff");
  }

  getDiagnostics() { return this.diagnostics; }

  dispose() {
    this.requestToken += 1;
    this.#clearLayers();
    this.renderer.globe.remove(this.group);
  }

  #addPathLayer(id, paths) {
    const positions = [];
    for (const coordinates of paths) for (let index = 1; index < coordinates.length; index += 1) {
      positions.push(...this.#position(coordinates[index - 1]), ...this.#position(coordinates[index]));
    }
    const object = createObject(id, positions, false, this.sourceColors);
    object.visible = Boolean(this.layerVisibility[id]);
    this.group.add(object);
    this.layers.set(id, object);
  }

  #addPointLayer(id, coordinates) {
    const positions = coordinates.flatMap((coordinate) => this.#position(coordinate));
    const object = createObject(id, positions, true, this.sourceColors);
    object.visible = Boolean(this.layerVisibility[id]);
    this.group.add(object);
    this.layers.set(id, object);
  }

  #position([lng, lat]) {
    const key = `${lng},${lat}`;
    const cached = this.positionCache.get(key);
    if (cached) return cached;
    const localDirection = wgs84ToRenderedGlobeLocal(lng, lat, 1, this.config).normalize();
    const anchor = resolveLandSurfaceAnchorFromDirection({
      localDirection,
      globeRadius: this.renderer.globeRadius,
      landHitMesh: this.renderer.landHitMesh,
      raycaster: this.raycaster,
      origin: this.rayOrigin,
      direction: this.rayDirection,
      candidate: this.surfaceCandidate
    });
    const normal = (anchor.surfaceNormal ?? anchor.radialDirection).clone().normalize();
    if (normal.dot(anchor.radialDirection) < 0) normal.multiplyScalar(-1);
    const position = anchor.anchorPosition.clone().addScaledVector(normal, 0.009).toArray();
    this.positionCache.set(key, position);
    return position;
  }

  #clearLayers() {
    for (const object of this.layers.values()) {
      this.group.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
    this.layers.clear();
    this.positionCache.clear();
  }
}

function createObject(id, positions, points, sourceColors) {
  const style = STYLES[id];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = points
    ? new THREE.PointsMaterial({ color: sourceColors ? style.color : "#ffffff", size: 0.035, sizeAttenuation: true, depthWrite: false, toneMapped: false })
    : new THREE.LineBasicMaterial({ color: sourceColors ? style.color : "#ffffff", transparent: style.opacity < 1, opacity: style.opacity, depthWrite: false, toneMapped: false });
  const object = points ? new THREE.Points(geometry, material) : new THREE.LineSegments(geometry, material);
  object.renderOrder = style.order;
  object.frustumCulled = false;
  return object;
}

function findEntry(manifest, country) {
  const keys = new Set([country?.id, country?.iso2, country?.iso3, country?.name].filter(Boolean).map((value) => String(value).trim().toUpperCase()));
  for (const [iso3, entry] of Object.entries(manifest?.countries ?? {})) {
    if ([iso3, ...(entry.aliases ?? [])].some((key) => keys.has(String(key).trim().toUpperCase()))) return { ...entry, iso3 };
  }
  return null;
}
