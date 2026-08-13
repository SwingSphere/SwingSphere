import * as THREE from 'three';
import maplibregl, {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import type { Listing } from '../../types';
import { getApproximateLocationCenter, isApproximateLocation } from '../../lib/publicLocation';

export type MapHostPin = {
  id: string;
  type: 'promoter';
  name: string;
  location: string;
  logoImageUrl?: string;
  geopoint: {
    latitude: number;
    longitude: number;
    address: { city: string; region: string; country: string };
  };
};

type MapPinEntity = Listing | MapHostPin;
import { getListingDisplayCoords } from '../../lib/explorerMarkers';
import { formatAddressRegion, resolveCountryFlagEmoji } from '../../lib/formatting';

export const THREE_PIN_LAYER_ID = 'swingsphere-three-pins';

const APPROXIMATE_PIN_FADE_START_ZOOM = 10.75;
const APPROXIMATE_PIN_HIDDEN_ZOOM = 12.25;
const AUTHORED_BUILDING_PIN_FADE_START_ZOOM = 9.5;
const AUTHORED_BUILDING_PIN_HIDDEN_ZOOM = 11;

const PIN_COLORS = {
  accent: 0xc51d34,
  active: 0xff4d5e,
  light: 0xc7cdd6,
  event: 0xd6a62e,
  eventActive: 0xf4c95d,
  host: 0x3f8cff,
  hostActive: 0x75b2ff,
  white: 0xf5f5f5,
} as const;

type PinEntityType = 'club' | 'event' | 'promoter';

type PinView = {
  listing: MapPinEntity;
  type: PinEntityType;
  group: THREE.Group;
  stem: THREE.Group;
  stemMaterials: THREE.MeshBasicMaterial[];
  tip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  mercator: maplibregl.MercatorCoordinate;
  currentScale: number;
  currentStemScale: number;
  currentLift: number;
  approximateLocation: boolean;
  privacyOpacity: number;
};

type ClusterPinData = {
  id: string;
  lng: number;
  lat: number;
  count: number;
  hovered: boolean;
};

export type MapThreePinPerformanceStats = {
  sourceListingCount: number;
  constructedPinCount: number;
  visiblePinCount: number;
  retainedPinMeshCount: number;
  constructedClusterCount: number;
  visibleClusterCount: number;
  retainedClusterMeshCount: number;
  projectedPinCount: number;
  retainedLabelNodeCount: number;
  listingSyncCount: number;
  clusterSyncCount: number;
  detachedUndisposedPinCount: number;
  detachedUndisposedClusterCount: number;
  lastListingSyncDurationMs: number;
  lastClusterSyncDurationMs: number;
};

type ClusterView = {
  group: THREE.Group;
  column: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  mercator: maplibregl.MercatorCoordinate;
  count: number;
  hovered: boolean;
};

const createGlowMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
  color,
  transparent: true,
  opacity,
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

const createSolidMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
  color,
  transparent: opacity < 1,
  opacity,
  depthTest: true,
  depthWrite: true,
  blending: THREE.NormalBlending,
  side: THREE.FrontSide,
});

const createStemMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
  color,
  transparent: true,
  opacity,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  side: THREE.DoubleSide,
});

const createTipGeometry = (type: PinEntityType): THREE.BufferGeometry => {
  if (type === 'club') {
    const geometry = new THREE.OctahedronGeometry(0.18, 0);
    geometry.scale(0.82, 0.82, 1.35);
    return geometry;
  }
  if (type === 'promoter') {
    const geometry = new THREE.BoxGeometry(0.27, 0.27, 0.27);
    geometry.rotateZ(Math.PI / 4);
    return geometry;
  }
  return new THREE.IcosahedronGeometry(0.18, 1);
};

const resolveEntityType = (listing: MapPinEntity): PinEntityType =>
  listing.type === 'club' ? 'club' : listing.type === 'promoter' ? 'promoter' : 'event';

const createClusterView = (cluster: ClusterPinData): ClusterView => {
  const group = new THREE.Group();
  const height = 0.7 + Math.min(1.1, Math.log2(Math.max(2, cluster.count)) * 0.15);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, height, 6, 1, false),
    createSolidMaterial(PIN_COLORS.accent, 0.88),
  );
  column.rotation.x = Math.PI / 2;
  column.position.z = height / 2;
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.36, 24),
    createGlowMaterial(PIN_COLORS.active, 0.12),
  );
  glow.position.z = 0.035;
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.29, 28),
    createGlowMaterial(PIN_COLORS.white, 0.08),
  );
  ripple.position.z = 0.045;
  group.add(column, glow, ripple);
  return {
    group,
    column,
    glow,
    ripple,
    mercator: maplibregl.MercatorCoordinate.fromLngLat([cluster.lng, cluster.lat], 0),
    count: cluster.count,
    hovered: cluster.hovered,
  };
};

const getPinCoords = (listing: MapPinEntity) => {
  if (listing.type === 'promoter') {
    return { lng: listing.geopoint.longitude, lat: listing.geopoint.latitude };
  }
  if (isApproximateLocation(listing)) {
    const center = getApproximateLocationCenter(listing);
    return center ? { lng: center.longitude, lat: center.latitude } : null;
  }
  return getListingDisplayCoords(listing);
};

const createPinView = (listing: MapPinEntity): PinView | null => {
  const coords = getPinCoords(listing);
  if (!coords) return null;

  const type = resolveEntityType(listing);
  const palette = type === 'event'
    ? { base: PIN_COLORS.event, active: PIN_COLORS.eventActive, tip: PIN_COLORS.event }
    : type === 'promoter'
      ? { base: PIN_COLORS.host, active: PIN_COLORS.hostActive, tip: PIN_COLORS.host }
      : { base: PIN_COLORS.accent, active: PIN_COLORS.active, tip: PIN_COLORS.accent };
  const group = new THREE.Group();
  const stem = new THREE.Group();
  const stemMaterials = [createStemMaterial(palette.base, 0.3)];
  const stemPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.12), stemMaterials[0]);
  stemPlane.rotation.x = Math.PI / 2;
  stemPlane.position.z = 0.56;
  stem.add(stemPlane);

  const tip = new THREE.Mesh(createTipGeometry(type), createSolidMaterial(palette.tip, 0.78));
  tip.position.z = 1.18;

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.27, 24),
    createGlowMaterial(palette.base, 0.06),
  );
  glow.position.z = 0.035;

  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.235, 28),
    createGlowMaterial(PIN_COLORS.white, 0.04),
  );
  ripple.position.z = 0.045;

  group.add(stem, glow, ripple, tip);

  return {
    listing,
    type,
    group,
    stem,
    stemMaterials,
    tip,
    glow,
    ripple,
    mercator: maplibregl.MercatorCoordinate.fromLngLat([coords.lng, coords.lat], 0),
    currentScale: 1,
    currentStemScale: 1,
    currentLift: 0,
    approximateLocation: listing.type !== 'promoter' && isApproximateLocation(listing),
    privacyOpacity: 1,
  };
};

const styleLabel = (element: HTMLDivElement, selected: boolean) => {
  element.className = selected
    ? 'map-venue-label map-venue-label--selected'
    : 'map-venue-label map-venue-label--hover';
  Object.assign(element.style, {
    position: 'absolute',
    zIndex: selected ? '26' : '25',
    display: 'flex',
    alignItems: 'center',
    gap: selected ? '12px' : '9px',
    maxWidth: selected ? '340px' : '280px',
    padding: selected ? '12px 15px' : '9px 12px',
    border: `1px solid ${selected ? 'rgba(255,77,94,.9)' : 'rgba(197,29,52,.72)'}`,
    borderRadius: selected ? '16px' : '13px',
    background: 'rgba(15,17,21,.94)',
    boxShadow: selected ? '0 14px 34px rgba(0,0,0,.42)' : '0 10px 26px rgba(0,0,0,.34)',
    color: '#f5f5f5',
    pointerEvents: 'none',
    opacity: '0',
    visibility: 'hidden',
    transform: 'translate(-50%, -100%)',
    transition: 'opacity 120ms ease, transform 120ms ease',
    backdropFilter: 'blur(12px)',
  });
};

const countMeshes = (root: THREE.Object3D): number => {
  let count = 0;
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh || (object as THREE.Sprite).isSprite) count += 1;
  });
  return count;
};

const countDescendantElements = (root: Element): number => root.querySelectorAll('*').length;

const buildLabel = (selected: boolean) => {
  const element = document.createElement('div');
  styleLabel(element, selected);
  return element;
};

const setLabelContent = (element: HTMLDivElement, listing: MapPinEntity) => {
  element.replaceChildren();
  const logo = document.createElement('div');
  Object.assign(logo.style, {
    width: '38px',
    height: '38px',
    flex: '0 0 38px',
    borderRadius: '10px',
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(197,29,52,.14)',
    color: '#ff4d5e',
    fontWeight: '800',
  });
  if (listing.logoImageUrl) {
    const image = document.createElement('img');
    image.src = listing.logoImageUrl;
    image.alt = '';
    Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'cover' });
    logo.append(image);
  } else {
    logo.textContent = listing.name.slice(0, 1).toUpperCase();
  }

  const text = document.createElement('div');
  text.style.minWidth = '0';
  const title = document.createElement('div');
  title.textContent = listing.name;
  Object.assign(title.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '14px',
    fontWeight: '750',
    lineHeight: '1.2',
  });
  const subtitle = document.createElement('div');
  const address = listing.geopoint.address;
  const region = formatAddressRegion(address.region, address.country);
  const flag = resolveCountryFlagEmoji(address.country);
  const locationText = document.createElement('span');
  locationText.textContent = [address.city, region].filter(Boolean).join(', ');
  subtitle.append(locationText);
  if (flag) {
    const flagEmoji = document.createElement('span');
    flagEmoji.textContent = flag;
    flagEmoji.setAttribute('aria-label', address.country);
    Object.assign(flagEmoji.style, {
      flex: '0 0 auto',
      fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      fontSize: '12px',
      lineHeight: '1',
    });
    subtitle.append(flagEmoji);
  }
  Object.assign(subtitle.style, {
    marginTop: '3px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '11px',
    color: '#aeb7c3',
  });
  Object.assign(locationText.style, {
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  text.append(title, subtitle);
  element.append(logo, text);
};

export class MapLibreThreePinLayer implements CustomLayerInterface {
  readonly id = THREE_PIN_LAYER_ID;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private views = new Map<string, PinView>();
  private clusterViews = new Map<string, ClusterView>();
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private hoverLabel = buildLabel(false);
  private selectedLabel = buildLabel(true);
  private hoverLabelListingId: string | null = null;
  private selectedLabelListingId: string | null = null;
  private projectedPins = new Map<string, { x: number; y: number; entity: MapPinEntity }>();
  private authoredBuildingListingIds = new Set<string>();
  private startedAt = performance.now();
  private lifecycleStats = {
    listingSyncCount: 0,
    clusterSyncCount: 0,
    detachedUndisposedPinCount: 0,
    detachedUndisposedClusterCount: 0,
    lastListingSyncDurationMs: 0,
    lastClusterSyncDurationMs: 0,
  };

  constructor(private listings: MapPinEntity[]) {}

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    map.getContainer().append(this.hoverLabel, this.selectedLabel);
    this.setListings(this.listings);
  }

  onRemove() {
    this.views.forEach((view) => {
      view.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
      this.scene.remove(view.group);
    });
    this.views.clear();
    this.clusterViews.forEach((view) => {
      view.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
      this.scene.remove(view.group);
    });
    this.clusterViews.clear();
    this.hoverLabel.remove();
    this.selectedLabel.remove();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  setListings(listings: MapPinEntity[]) {
    const syncStartedAt = performance.now();
    this.listings = listings;
    const nextIds = new Set(listings.map((listing) => listing.id));
    for (const [id, view] of this.views) {
      if (nextIds.has(id)) continue;
      this.scene.remove(view.group);
      this.views.delete(id);
      this.lifecycleStats.detachedUndisposedPinCount += 1;
    }
    listings.forEach((listing) => {
      const existing = this.views.get(listing.id);
      if (existing) {
        existing.listing = listing;
        existing.approximateLocation = listing.type !== 'promoter' && isApproximateLocation(listing);
        const coords = getPinCoords(listing);
        if (coords) {
          existing.mercator = maplibregl.MercatorCoordinate.fromLngLat([coords.lng, coords.lat], 0);
        }
        return;
      }
      const view = createPinView(listing);
      if (!view) return;
      this.views.set(listing.id, view);
      this.scene.add(view.group);
    });
    this.lifecycleStats.listingSyncCount += 1;
    this.lifecycleStats.lastListingSyncDurationMs = performance.now() - syncStartedAt;
    this.map?.triggerRepaint();
  }

  setAuthoredBuildingListingIds(ids: Set<string>) {
    this.authoredBuildingListingIds = new Set(ids);
    this.map?.triggerRepaint();
  }

  setVisibleListingIds(ids: Set<string>) {
    this.views.forEach((view, id) => {
      view.group.visible = view.type === 'promoter' || ids.has(id) || id === this.selectedId;
    });
    this.map?.triggerRepaint();
  }

  setClusters(clusters: ClusterPinData[]) {
    const syncStartedAt = performance.now();
    const nextIds = new Set(clusters.map((cluster) => cluster.id));
    for (const [id, view] of this.clusterViews) {
      if (nextIds.has(id)) continue;
      this.scene.remove(view.group);
      this.clusterViews.delete(id);
      this.lifecycleStats.detachedUndisposedClusterCount += 1;
    }
    clusters.forEach((cluster) => {
      const existing = this.clusterViews.get(cluster.id);
      if (existing) {
        existing.count = cluster.count;
        existing.hovered = cluster.hovered;
        existing.mercator = maplibregl.MercatorCoordinate.fromLngLat([cluster.lng, cluster.lat], 0);
        return;
      }
      const view = createClusterView(cluster);
      this.clusterViews.set(cluster.id, view);
      this.scene.add(view.group);
    });
    this.lifecycleStats.clusterSyncCount += 1;
    this.lifecycleStats.lastClusterSyncDurationMs = performance.now() - syncStartedAt;
    this.map?.triggerRepaint();
  }

  getPerformanceStats(): MapThreePinPerformanceStats {
    let visiblePinCount = 0;
    let retainedPinMeshCount = 0;
    this.views.forEach((view) => {
      if (view.group.visible) visiblePinCount += 1;
      retainedPinMeshCount += countMeshes(view.group);
    });
    let visibleClusterCount = 0;
    let retainedClusterMeshCount = 0;
    this.clusterViews.forEach((view) => {
      if (view.group.visible) visibleClusterCount += 1;
      retainedClusterMeshCount += countMeshes(view.group);
    });
    return {
      sourceListingCount: this.listings.length,
      constructedPinCount: this.views.size,
      visiblePinCount,
      retainedPinMeshCount,
      constructedClusterCount: this.clusterViews.size,
      visibleClusterCount,
      retainedClusterMeshCount,
      projectedPinCount: this.projectedPins.size,
      retainedLabelNodeCount: countDescendantElements(this.hoverLabel) + countDescendantElements(this.selectedLabel),
      ...this.lifecycleStats,
    };
  }

  setHovered(id: string | null) {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    this.map?.triggerRepaint();
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    if (id) {
      const selectedView = this.views.get(id);
      if (selectedView) selectedView.group.visible = true;
    }
    this.map?.triggerRepaint();
  }

  hitTest(point: { x: number; y: number }, radiusPx = 24): MapPinEntity | null {
    let nearest: { entity: MapPinEntity; distanceSq: number } | null = null;
    const radiusSq = radiusPx * radiusPx;
    this.projectedPins.forEach((projected) => {
      const dx = projected.x - point.x;
      const dy = projected.y - point.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusSq || (nearest && distanceSq >= nearest.distanceSq)) return;
      nearest = { entity: projected.entity, distanceSq };
    });
    return nearest?.entity ?? null;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput) {
    if (!this.map || !this.renderer) return;
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(options.defaultProjectionData.mainMatrix);
    this.camera.matrixWorld.identity();
    this.camera.matrixWorldInverse.identity();
    const worldSize = 512 * 2 ** this.map.getZoom();
    const baseScale = 72 / worldSize;
    const elapsed = (performance.now() - this.startedAt) / 1000;

    this.clusterViews.forEach((view, id) => {
      const scale = baseScale * (view.hovered ? 1.08 : 0.92);
      view.group.position.set(view.mercator.x, view.mercator.y, 0);
      view.group.scale.set(scale, -scale, scale);
      view.column.material.color.setHex(view.hovered ? PIN_COLORS.active : PIN_COLORS.accent);
      view.column.material.opacity = view.hovered ? 1 : 0.88;
      view.glow.material.opacity = view.hovered ? 0.24 : 0.12;
      const phaseSeed = Number.parseInt(id.slice(-2), 36);
      const ripplePhase = (elapsed * 0.52 + (Number.isFinite(phaseSeed) ? phaseSeed : 0) * 0.03) % 1;
      view.ripple.scale.setScalar(0.5 + ripplePhase * 2.8);
      view.ripple.material.opacity = (view.hovered ? 0.16 : 0.07) * (1 - ripplePhase);
    });

    this.views.forEach((view, id) => {
      if (!view.group.visible) return;
      const hovered = id === this.hoveredId;
      const selected = id === this.selectedId;
      const zoom = this.map.getZoom();
      const approximateLocationOpacity = view.approximateLocation
        ? 1 - THREE.MathUtils.smoothstep(
            zoom,
            APPROXIMATE_PIN_FADE_START_ZOOM,
            APPROXIMATE_PIN_HIDDEN_ZOOM,
          )
        : 1;
      const authoredBuildingOpacity =
        view.type !== 'promoter' && this.authoredBuildingListingIds.has(id)
          ? 1 - THREE.MathUtils.smoothstep(
              zoom,
              AUTHORED_BUILDING_PIN_FADE_START_ZOOM,
              AUTHORED_BUILDING_PIN_HIDDEN_ZOOM,
            )
          : 1;
      const privacyOpacity = Math.min(approximateLocationOpacity, authoredBuildingOpacity);
      view.privacyOpacity = privacyOpacity;
      const targetScale = selected ? 1.25 : hovered ? 1.14 : 0.7;
      const targetStemScale = selected ? 1.58 : hovered ? 2 : 1;
      const targetLift = selected ? 0.1 : hovered ? 0.05 : 0;
      // Keep hover motion deliberate rather than snapping when the pointer only
      // briefly clips the hit area. The release grace period in FlatWorldMap
      // lets this easing complete before returning to idle.
      view.currentScale = THREE.MathUtils.lerp(view.currentScale, targetScale, 0.11);
      view.currentStemScale = THREE.MathUtils.lerp(view.currentStemScale, targetStemScale, 0.11);
      view.currentLift = THREE.MathUtils.lerp(view.currentLift, targetLift, 0.11);

      const scale = baseScale * view.currentScale;
      view.group.position.set(view.mercator.x, view.mercator.y, view.currentLift * scale);
      view.group.scale.set(scale, -scale, scale);
      view.stem.scale.z = view.currentStemScale;
      view.tip.position.z = 1.12 * view.currentStemScale + 0.08;
      const palette = view.type === 'event'
        ? { base: PIN_COLORS.event, active: PIN_COLORS.eventActive, idleTip: PIN_COLORS.event }
        : view.type === 'promoter'
          ? { base: PIN_COLORS.host, active: PIN_COLORS.hostActive, idleTip: PIN_COLORS.host }
          : { base: PIN_COLORS.accent, active: PIN_COLORS.active, idleTip: PIN_COLORS.accent };
      view.tip.material.color.setHex(selected || hovered ? palette.active : palette.idleTip);
      view.tip.material.opacity = (selected ? 1 : hovered ? 0.94 : 0.86) * privacyOpacity;
      view.stem.rotation.z = THREE.MathUtils.degToRad(this.map.getBearing());
      view.stemMaterials.forEach((material) => {
        material.color.setHex(selected || hovered ? palette.active : palette.base);
        material.opacity = (selected || hovered ? 0.48 : 0.3) * privacyOpacity;
      });
      view.glow.material.color.setHex(selected || hovered ? palette.active : palette.base);
      view.glow.material.opacity = (selected ? 0.16 : hovered ? 0.1 : 0.035) * privacyOpacity;
      view.glow.scale.setScalar(selected ? 1.35 : hovered ? 1.15 : 0.85);
      const ripplePhase = (elapsed * 0.62 + Number.parseInt(id.slice(-2), 36) * 0.03) % 1;
      const rippleScale = 0.35 + ripplePhase * 4;
      view.ripple.scale.setScalar(rippleScale);
      view.ripple.material.opacity = (selected
        ? 0.14 * (1 - ripplePhase)
        : hovered
          ? 0.08 * (1 - ripplePhase)
          : 0.025 * (1 - ripplePhase)) * privacyOpacity;
    });

    this.scene.updateMatrixWorld(true);
    this.projectedPins.clear();
    const canvas = this.map.getCanvas();
    this.views.forEach((view, id) => {
      if (!view.group.visible || view.privacyOpacity <= 0.08) return;
      const tipCenter = view.tip.localToWorld(new THREE.Vector3(0, 0, 0));
      const projected = tipCenter.project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;
      this.projectedPins.set(id, {
        x: (projected.x * 0.5 + 0.5) * canvas.clientWidth,
        y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight,
        entity: view.listing,
      });
    });
    this.updateLabel(this.hoverLabel, this.hoveredId, 12);
    this.updateLabel(this.selectedLabel, this.selectedId, 16);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  private updateLabel(element: HTMLDivElement, id: string | null, clearancePx: number) {
    if (!this.map || !id || (element === this.hoverLabel && id === this.selectedId)) {
      element.style.opacity = '0';
      element.style.visibility = 'hidden';
      return;
    }
    const view = this.views.get(id);
    if (!view || !view.group.visible) {
      element.style.opacity = '0';
      element.style.visibility = 'hidden';
      return;
    }
    const tipClearance = view.type === 'club' ? 0.26 : view.type === 'promoter' ? 0.24 : 0.2;
    const tipTop = view.tip.localToWorld(new THREE.Vector3(0, 0, tipClearance));
    const projected = tipTop.clone().project(this.camera);
    const canvas = this.map.getCanvas();
    const point = {
      x: (projected.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight,
    };
    const isHoverLabel = element === this.hoverLabel;
    const renderedListingId = isHoverLabel ? this.hoverLabelListingId : this.selectedLabelListingId;
    if (renderedListingId !== id) {
      setLabelContent(element, view.listing);
      if (isHoverLabel) this.hoverLabelListingId = id;
      else this.selectedLabelListingId = id;
    }
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y - clearancePx}px`;
    element.style.opacity = '1';
    element.style.visibility = 'visible';
  }
}
