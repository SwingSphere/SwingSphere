import maplibregl, { type CustomLayerInterface, type Map as MapLibreMap } from 'maplibre-gl';
import * as THREE from 'three';

export type LandmarkSourceFeature = {
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: any;
};

export type StreetViewLandmarkLayer = CustomLayerInterface & {
  setColor: (color: string) => void;
};

const TRANSAMERICA_CENTER: [number, number] = [-122.40279, 37.79517];
const TRANSAMERICA_MAX_DISTANCE_METERS = 90;
const COIT_TOWER_CENTER: [number, number] = [-122.40582, 37.80239];
const COIT_TOWER_MAX_DISTANCE_METERS = 70;

function geometryCentroid(geometry: any): [number, number] | null {
  const points: Array<[number, number]> = [];
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(collect);
  };
  collect(geometry?.coordinates);
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]] as [number, number], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function distanceMeters(first: [number, number], second: [number, number]) {
  const cosLat = Math.cos(((first[1] + second[1]) * 0.5) * Math.PI / 180);
  const dx = (first[0] - second[0]) * 111320 * Math.max(0.2, cosLat);
  const dy = (first[1] - second[1]) * 110540;
  return Math.hypot(dx, dy);
}

function numericProperty(feature: LandmarkSourceFeature, key: string) {
  const value = Number(feature.properties?.[key]);
  return Number.isFinite(value) ? value : null;
}

function normalizeRing(ring: unknown): Array<[number, number]> | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const points = ring
    .map((point: unknown) => Array.isArray(point) ? [Number(point[0]), Number(point[1])] as [number, number] : null)
    .filter(Boolean) as Array<[number, number]>;
  if (points.length < 4) return null;
  const last = points[points.length - 1];
  const first = points[0];
  if (last[0] === first[0] && last[1] === first[1]) points.pop();
  return points.length >= 3 ? points : null;
}

function polygonOuterRings(feature: LandmarkSourceFeature): Array<Array<[number, number]>> {
  const geometry = feature.geometry;
  if (geometry?.type === 'Polygon') {
    const ring = normalizeRing(geometry.coordinates?.[0]);
    return ring ? [ring] : [];
  }
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates ?? [])
      .map((polygon: unknown) => Array.isArray(polygon) ? normalizeRing(polygon[0]) : null)
      .filter(Boolean) as Array<Array<[number, number]>>;
  }
  return [];
}

function polygonRing(feature: LandmarkSourceFeature): Array<[number, number]> | null {
  return polygonOuterRings(feature)[0] ?? null;
}

function ringBoundsAreaMeters(ring: Array<[number, number]>) {
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  const centerLat = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const width = (Math.max(...xs) - Math.min(...xs)) * 111320 * Math.max(0.2, Math.cos(centerLat * Math.PI / 180));
  const height = (Math.max(...ys) - Math.min(...ys)) * 110540;
  return Math.max(0, width * height);
}

export function resolveTransamericaPyramid(features: LandmarkSourceFeature[]) {
  const nearby = features.filter((feature) => {
    const center = geometryCentroid(feature.geometry);
    return center && distanceMeters(center, TRANSAMERICA_CENTER) <= TRANSAMERICA_MAX_DISTANCE_METERS;
  });

  const pyramid = nearby.find((feature) => {
    const height = numericProperty(feature, 'render_height');
    const minHeight = numericProperty(feature, 'render_min_height');
    return height != null && Math.abs(height - 260) < 1.5
      && minHeight != null && Math.abs(minHeight - 30) < 1.5
      && polygonRing(feature);
  });
  if (!pyramid) return null;

  const outer = nearby.find((feature) => {
    const height = numericProperty(feature, 'render_height');
    const minHeight = numericProperty(feature, 'render_min_height') ?? 0;
    return feature !== pyramid
      && height != null && Math.abs(height - 260) < 1.5
      && minHeight <= 0.5;
  });

  const ring = polygonRing(pyramid);
  const center = geometryCentroid(pyramid.geometry);
  if (!ring || !center) return null;

  const providerIds = [outer?.id, pyramid.id]
    .filter((value): value is string | number => value != null)
    .map(String);

  return {
    center,
    footprint: ring,
    minHeight: numericProperty(pyramid, 'render_min_height') ?? 30,
    height: numericProperty(pyramid, 'render_height') ?? 260,
    providerIds,
  };
}

export type TieredLandmarkComponent = {
  footprint: Array<[number, number]>;
  minHeight: number;
  height: number;
};

export function resolveCoitTower(features: LandmarkSourceFeature[]) {
  const nearby = features.filter((feature) => {
    const center = geometryCentroid(feature.geometry);
    return center && distanceMeters(center, COIT_TOWER_CENTER) <= COIT_TOWER_MAX_DISTANCE_METERS;
  });

  const findHeightFeature = (targetHeight: number) => nearby.find((feature) => {
    const height = numericProperty(feature, 'render_height');
    return height != null && Math.abs(height - targetHeight) < 1.5 && polygonOuterRings(feature).length > 0;
  });

  const base = findHeightFeature(5);
  const innerBase = findHeightFeature(12);
  const body = findHeightFeature(50);
  const top = findHeightFeature(64);
  if (!base || !innerBase || !body || !top) return null;

  const smallestOuterRing = (feature: LandmarkSourceFeature) => {
    const rings = polygonOuterRings(feature);
    return rings.sort((first, second) => ringBoundsAreaMeters(first) - ringBoundsAreaMeters(second))[0] ?? null;
  };

  const baseRing = smallestOuterRing(base);
  const innerBaseRing = smallestOuterRing(innerBase);
  const bodyRing = smallestOuterRing(body);
  const topRing = smallestOuterRing(top);
  if (!baseRing || !innerBaseRing || !bodyRing || !topRing) return null;

  const center = geometryCentroid(top.geometry) ?? geometryCentroid(body.geometry) ?? COIT_TOWER_CENTER;
  const providerIds = nearby
    .filter((feature) => {
      const height = numericProperty(feature, 'render_height');
      return feature.id != null && height != null && [5, 8, 10, 12, 50, 64].some((target) => Math.abs(height - target) < 1.5);
    })
    .map((feature) => String(feature.id));

  const components: TieredLandmarkComponent[] = [
    { footprint: baseRing, minHeight: 0, height: 5 },
    { footprint: innerBaseRing, minHeight: 5, height: 12 },
    { footprint: bodyRing, minHeight: 12, height: 50 },
    { footprint: topRing, minHeight: 50, height: 64 },
  ];

  return {
    center,
    components,
    providerIds: Array.from(new Set(providerIds)),
  };
}

function localMeters(point: [number, number], origin: [number, number]): [number, number] {
  const cosLat = Math.cos(((point[1] + origin[1]) * 0.5) * Math.PI / 180);
  return [
    (point[0] - origin[0]) * 111320 * Math.max(0.2, cosLat),
    (point[1] - origin[1]) * 110540,
  ];
}

export function createPyramidalLandmarkLayer(options: {
  id: string;
  map: MapLibreMap;
  center: [number, number];
  footprint: Array<[number, number]>;
  minHeight: number;
  height: number;
  color: string;
}): StreetViewLandmarkLayer {
  const { id, map, center, footprint, minHeight, height } = options;
  const seaLevelOrigin = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
  const scale = seaLevelOrigin.meterInMercatorCoordinateUnits();
  const localFootprint = footprint.map((point) => localMeters(point, center));

  let material: THREE.MeshStandardMaterial | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;
  let scene: THREE.Scene | null = null;

  const layer: StreetViewLandmarkLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',
    setColor(color: string) {
      if (!material) return;
      material.color.set(color);
      material.needsUpdate = true;
      map.triggerRepaint();
    },
    onAdd(_map, gl) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      const ambient = new THREE.AmbientLight(0xffffff, 1.55);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(-80, 110, 180).normalize();
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffd8d5, 0.5);
      fill.position.set(120, -60, 100).normalize();
      scene.add(fill);

      const positions: number[] = [];
      const apex: [number, number, number] = [0, 0, height];
      for (let index = 0; index < localFootprint.length; index += 1) {
        const next = (index + 1) % localFootprint.length;
        const currentPoint = localFootprint[index];
        const nextPoint = localFootprint[next];
        positions.push(
          currentPoint[0], currentPoint[1], minHeight,
          nextPoint[0], nextPoint[1], minHeight,
          apex[0], apex[1], apex[2],
        );
      }

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      material = new THREE.MeshStandardMaterial({
        color: options.color,
        roughness: 0.88,
        metalness: 0.02,
        flatShading: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(_gl, args: any) {
      if (!renderer || !camera || !scene) return;
      const projectionMatrix = args?.defaultProjectionData?.mainMatrix;
      if (!projectionMatrix) return;
      const terrainElevation = map.queryTerrainElevation(center) ?? 0;
      const terrainOrigin = maplibregl.MercatorCoordinate.fromLngLat(center, terrainElevation);
      const mapMatrix = new THREE.Matrix4().fromArray(projectionMatrix);
      const modelMatrix = new THREE.Matrix4()
        .makeTranslation(terrainOrigin.x, terrainOrigin.y, terrainOrigin.z)
        .scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = mapMatrix.multiply(modelMatrix);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      geometry?.dispose();
      material?.dispose();
      geometry = null;
      material = null;
      scene = null;
      camera = null;
      renderer = null;
    },
  };

  return layer;
}

export function createTieredLandmarkLayer(options: {
  id: string;
  map: MapLibreMap;
  center: [number, number];
  components: TieredLandmarkComponent[];
  color: string;
}): StreetViewLandmarkLayer {
  const { id, map, center, components } = options;
  const seaLevelOrigin = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
  const scale = seaLevelOrigin.meterInMercatorCoordinateUnits();

  let material: THREE.MeshStandardMaterial | null = null;
  const geometries: THREE.BufferGeometry[] = [];
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;
  let scene: THREE.Scene | null = null;

  const layer: StreetViewLandmarkLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',
    setColor(color: string) {
      if (!material) return;
      material.color.set(color);
      material.needsUpdate = true;
      map.triggerRepaint();
    },
    onAdd(_map, gl) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      const ambient = new THREE.AmbientLight(0xffffff, 1.55);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(-80, 110, 180).normalize();
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffd8d5, 0.5);
      fill.position.set(120, -60, 100).normalize();
      scene.add(fill);

      material = new THREE.MeshStandardMaterial({
        color: options.color,
        roughness: 0.88,
        metalness: 0.02,
        flatShading: true,
        side: THREE.DoubleSide,
      });

      components.forEach((component) => {
        const localFootprint = component.footprint.map((point) => localMeters(point, center));
        if (localFootprint.length < 3 || component.height <= component.minHeight) return;
        const shape = new THREE.Shape();
        shape.moveTo(localFootprint[0][0], localFootprint[0][1]);
        for (let index = 1; index < localFootprint.length; index += 1) {
          shape.lineTo(localFootprint[index][0], localFootprint[index][1]);
        }
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: component.height - component.minHeight,
          bevelEnabled: false,
          steps: 1,
        });
        geometry.translate(0, 0, component.minHeight);
        geometry.computeVertexNormals();
        geometries.push(geometry);
        scene?.add(new THREE.Mesh(geometry, material!));
      });

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(_gl, args: any) {
      if (!renderer || !camera || !scene) return;
      const projectionMatrix = args?.defaultProjectionData?.mainMatrix;
      if (!projectionMatrix) return;
      const terrainElevation = map.queryTerrainElevation(center) ?? 0;
      const terrainOrigin = maplibregl.MercatorCoordinate.fromLngLat(center, terrainElevation);
      const mapMatrix = new THREE.Matrix4().fromArray(projectionMatrix);
      const modelMatrix = new THREE.Matrix4()
        .makeTranslation(terrainOrigin.x, terrainOrigin.y, terrainOrigin.z)
        .scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = mapMatrix.multiply(modelMatrix);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      geometries.forEach((geometry) => geometry.dispose());
      geometries.length = 0;
      material?.dispose();
      material = null;
      scene = null;
      camera = null;
      renderer = null;
    },
  };

  return layer;
}
