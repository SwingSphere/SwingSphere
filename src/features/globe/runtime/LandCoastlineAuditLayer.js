import * as THREE from "three";

const LAYER_STYLES = {
  radialSilhouette: { color: "#38f6ff", opacity: 1, renderOrder: 44 },
  terrainWallRim: { color: "#ff9f43", opacity: 0.82, renderOrder: 43 },
  openEdges: { color: "#5cff88", opacity: 1, renderOrder: 46 },
  nonManifoldEdges: { color: "#ff3df2", opacity: 1, renderOrder: 47 },
  rejectedInternalEdges: { color: "#ffe45e", opacity: 0.7, renderOrder: 42 }
};

export class LandCoastlineAuditLayer {
  constructor({ renderer, config }) {
    this.renderer = renderer;
    this.options = config.landCoastlineAudit ?? {};
    this.group = new THREE.Group();
    this.group.name = "land-coastline-audit";
    this.renderer.globe.add(this.group);
    this.layers = new Map();
    this.diagnostics = null;
  }

  async mount() {
    const response = await fetch(this.options.url ?? "/assets/globe/models/audit/land-coastline-diagnostics.json");
    if (!response.ok) throw new Error(`Unable to load coastline audit diagnostics (${response.status}).`);
    const data = await response.json();
    for (const [id, paths] of Object.entries(data.layers ?? {})) {
      const style = LAYER_STYLES[id];
      if (!style) continue;
      const object = createSegmentLayer(paths, style);
      object.name = `land-coastline-audit-${id}`;
      object.visible = Boolean(this.options.layers?.[id]);
      this.group.add(object);
      this.layers.set(id, object);
    }
    this.diagnostics = {
      source: data.source,
      weldTolerance: data.weldTolerance,
      selectedThreshold: data.selectedThreshold,
      faceClassification: data.faceClassification,
      triangleCount: data.triangleCount,
      layers: Object.fromEntries(Object.entries(data.layers ?? {}).map(([id, paths]) => [id, {
        pathCount: paths.length,
        pointCount: paths.reduce((count, points) => count + points.length, 0)
      }]))
    };
  }

  setLayers(next = {}) {
    for (const [id, visible] of Object.entries(next)) {
      if (typeof visible === "boolean") this.layers.get(id) && (this.layers.get(id).visible = visible);
    }
  }

  getDiagnostics() {
    return this.diagnostics;
  }

  dispose() {
    for (const object of this.layers.values()) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.layers.clear();
    this.renderer.globe.remove(this.group);
  }
}

function createSegmentLayer(paths, style) {
  const positions = [];
  for (const points of paths) {
    for (let index = 1; index < points.length; index += 1) {
      positions.push(...points[index - 1], ...points[index]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: style.color,
    transparent: style.opacity < 1,
    opacity: style.opacity,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = style.renderOrder;
  lines.frustumCulled = false;
  return lines;
}
