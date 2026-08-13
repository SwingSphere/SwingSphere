import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CornerDownRight,
  Crosshair,
  ExternalLink,
  GitMerge,
  Hand,
  MapPin,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Trash2,
  Undo2,
  Waves,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 760;
const EPSILON = 1e-8;

type Coord = [number, number];
type EdgeKind = 'coastline' | 'political';
type ToolMode = 'select' | 'add' | 'pan';
type SnapMode = 'none' | 'coastline' | 'neighbor';

type ManifestEntry = {
  aliases?: string[];
  url?: string;
  status?: string;
  ringCount?: number;
  semanticIssueCount?: number;
};

type BorderManifest = {
  countries?: Record<string, ManifestEntry>;
  skippedCountries?: Record<string, { reason?: string; status?: string }>;
};

type HybridSegment = {
  kind?: string;
  coordinates?: Coord[];
};

type HybridRing = {
  id: string;
  coordinates: Coord[];
  segments?: HybridSegment[];
  manualOverride?: boolean;
  presentation?: boolean;
};

type HybridAsset = {
  countryId?: string;
  countryName?: string;
  status?: string;
  rings?: HybridRing[];
};

type GeoFeature = {
  type: 'Feature';
  geometry?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  } | null;
  properties?: Record<string, any>;
};

type GeoCollection = {
  type: 'FeatureCollection';
  features?: GeoFeature[];
};

type PhysicalPath = {
  id: string;
  simplifiedCoordinates?: Coord[];
};

type PhysicalCoastlines = {
  paths?: PhysicalPath[];
};

type OverrideStore = {
  countries?: Record<string, {
    rings?: Record<string, {
      coordinates?: Coord[];
      edgeKinds?: EdgeKind[];
      updatedAt?: string;
    }>;
  }>;
};

type EditorSnapshot = {
  nodes: Coord[];
  edgeKinds: EdgeKind[];
};

type Projection = {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  lonSpan: number;
  latSpan: number;
};

type Intersection = {
  a: number;
  b: number;
  point: Coord;
};

type NeighborIntersection = {
  neighborId: string;
  neighborName: string;
  point: Coord;
};

type CrossingSummary = {
  count: number;
  neighborIds: string[];
};

type CountryOption = {
  id: string;
  name: string;
  status: string;
  editable: boolean;
  hasAsset: boolean;
  neighborIntersectionCount: number;
  neighborIntersectionCountryIds: string[];
};

const copyCoord = (coord: Coord): Coord => [coord[0], coord[1]];
const coordEqual = (a?: Coord, b?: Coord) => Boolean(a && b && Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const edgeKey = (a: Coord, b: Coord) => `${a[0].toFixed(6)},${a[1].toFixed(6)}>${b[0].toFixed(6)},${b[1].toFixed(6)}`;

const featureIso3 = (feature?: GeoFeature | null) => {
  const properties = feature?.properties ?? {};
  const candidates = [
    properties.ISO_A3,
    properties.ISO_A3_EH,
    properties.ADM0_A3,
    properties.ADM0_ISO,
    properties.SOV_A3,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(value)) return value;
  }
  return '';
};

const featureName = (feature?: GeoFeature | null) => String(
  feature?.properties?.NAME_EN
  ?? feature?.properties?.NAME
  ?? feature?.properties?.ADMIN
  ?? featureIso3(feature),
).trim();

const featureOuterRings = (feature?: GeoFeature | null): Coord[][] => {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0];
    return Array.isArray(ring) ? [ring as Coord[]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? [])
      .map((polygon: any) => polygon?.[0])
      .filter(Array.isArray) as Coord[][];
  }
  return [];
};

const openRing = (coordinates: Coord[] = []): Coord[] => {
  const nodes = coordinates
    .filter((coord) => Array.isArray(coord) && Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
    .map(copyCoord);
  if (nodes.length > 1 && coordEqual(nodes[0], nodes[nodes.length - 1])) nodes.pop();
  return nodes;
};

const wrapLongitude = (longitude: number) => {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Math.abs(wrapped + 180) < EPSILON && longitude > 0 ? 180 : wrapped;
};

const unwrapLongitudeNear = (longitude: number, referenceLongitude: number) => {
  let result = longitude;
  while (result - referenceLongitude > 180) result -= 360;
  while (result - referenceLongitude < -180) result += 360;
  return result;
};

const unwrapRing = (coordinates: Coord[] = [], referenceLongitude?: number): Coord[] => {
  const nodes = openRing(coordinates);
  if (!nodes.length) return [];
  const result: Coord[] = [copyCoord(nodes[0])];
  for (let index = 1; index < nodes.length; index += 1) {
    result.push([
      unwrapLongitudeNear(nodes[index][0], result[index - 1][0]),
      nodes[index][1],
    ]);
  }
  if (Number.isFinite(referenceLongitude)) {
    const center = result.reduce((sum, coord) => sum + coord[0], 0) / result.length;
    const turns = Math.round((Number(referenceLongitude) - center) / 360);
    if (turns) return result.map(([longitude, latitude]) => [longitude + turns * 360, latitude]);
  }
  return result;
};

const wrapRingForStorage = (nodes: Coord[]): Coord[] => {
  if (!nodes.length) return [];
  const wrapped = nodes.map(([longitude, latitude]) => [wrapLongitude(longitude), latitude] as Coord);
  return [...wrapped, copyCoord(wrapped[0])];
};

const closeRing = (nodes: Coord[]): Coord[] => nodes.length ? [...nodes.map(copyCoord), copyCoord(nodes[0])] : [];

const chooseDefaultRingId = (asset: HybridAsset | null | undefined): string => {
  const rings = asset?.rings ?? [];
  if (!rings.length) return 'mainland';
  const preferred = rings.find((ring) => ring.id === 'mainland')
    ?? rings.find((ring) => ring.id === 'main-island');
  if (preferred) return preferred.id;
  return [...rings].sort((a, b) => openRing(b.coordinates).length - openRing(a.coordinates).length)[0]?.id ?? 'mainland';
};

const ringEdgeKinds = (ring: HybridRing | null, nodeCount: number): EdgeKind[] => {
  if (!ring || nodeCount <= 0) return Array.from({ length: nodeCount }, () => 'political' as const);
  const kindsByEdge = new Map<string, EdgeKind>();
  for (const segment of ring.segments ?? []) {
    const kind: EdgeKind = segment.kind === 'coastline' ? 'coastline' : 'political';
    const coords = segment.coordinates ?? [];
    for (let index = 0; index < coords.length - 1; index += 1) {
      kindsByEdge.set(edgeKey(coords[index], coords[index + 1]), kind);
      kindsByEdge.set(edgeKey(coords[index + 1], coords[index]), kind);
    }
  }
  const nodes = openRing(ring.coordinates ?? []);
  return Array.from({ length: nodeCount }, (_, index) => {
    const a = nodes[index];
    const b = nodes[(index + 1) % nodeCount];
    return kindsByEdge.get(edgeKey(a, b)) ?? 'political';
  });
};

const featureBounds = (rings: Coord[][]): [number, number, number, number] | null => {
  const coords = rings.flat();
  if (!coords.length) return null;
  return [
    Math.min(...coords.map((coord) => coord[0])),
    Math.min(...coords.map((coord) => coord[1])),
    Math.max(...coords.map((coord) => coord[0])),
    Math.max(...coords.map((coord) => coord[1])),
  ];
};

const boundsOverlap = (a: [number, number, number, number], b: [number, number, number, number], padding = 0) => !(
  a[2] + padding < b[0]
  || a[0] - padding > b[2]
  || a[3] + padding < b[1]
  || a[1] - padding > b[3]
);

const buildProjection = (nodes: Coord[]): Projection => {
  if (!nodes.length) return { minLon: -10, maxLon: 10, minLat: -10, maxLat: 10, lonSpan: 20, latSpan: 20 };
  let minLon = Math.min(...nodes.map((coord) => coord[0]));
  let maxLon = Math.max(...nodes.map((coord) => coord[0]));
  let minLat = Math.min(...nodes.map((coord) => coord[1]));
  let maxLat = Math.max(...nodes.map((coord) => coord[1]));
  const baseLonSpan = Math.max(1.5, maxLon - minLon);
  const baseLatSpan = Math.max(1.5, maxLat - minLat);
  const padLon = baseLonSpan * 0.24;
  const padLat = baseLatSpan * 0.24;
  minLon -= padLon;
  maxLon += padLon;
  minLat -= padLat;
  maxLat += padLat;
  return {
    minLon,
    maxLon,
    minLat,
    maxLat,
    lonSpan: Math.max(0.001, maxLon - minLon),
    latSpan: Math.max(0.001, maxLat - minLat),
  };
};

const geoToScreen = (coord: Coord, projection: Projection): Coord => [
  ((coord[0] - projection.minLon) / projection.lonSpan) * VIEW_WIDTH,
  VIEW_HEIGHT - ((coord[1] - projection.minLat) / projection.latSpan) * VIEW_HEIGHT,
];

const screenToGeo = (point: Coord, projection: Projection): Coord => [
  projection.minLon + (point[0] / VIEW_WIDTH) * projection.lonSpan,
  projection.minLat + ((VIEW_HEIGHT - point[1]) / VIEW_HEIGHT) * projection.latSpan,
];

const pointSegmentProjection = (point: Coord, a: Coord, b: Coord): { point: Coord; distance: number; t: number } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq, 0, 1) : 0;
  const projected: Coord = [a[0] + dx * t, a[1] + dy * t];
  return { point: projected, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]), t };
};

const segmentIntersection = (a: Coord, b: Coord, c: Coord, d: Coord): Coord | null => {
  const r: Coord = [b[0] - a[0], b[1] - a[1]];
  const s: Coord = [d[0] - c[0], d[1] - c[1]];
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-10) return null;
  const ca: Coord = [c[0] - a[0], c[1] - a[1]];
  const t = (ca[0] * s[1] - ca[1] * s[0]) / denominator;
  const u = (ca[0] * r[1] - ca[1] * r[0]) / denominator;
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
};

const findIntersections = (nodes: Coord[]): Intersection[] => {
  const result: Intersection[] = [];
  const count = nodes.length;
  if (count < 4) return result;
  for (let a = 0; a < count; a += 1) {
    const aNext = (a + 1) % count;
    for (let b = a + 1; b < count; b += 1) {
      const bNext = (b + 1) % count;
      if (a === b || aNext === b || bNext === a) continue;
      if (a === 0 && bNext === 0) continue;
      const point = segmentIntersection(nodes[a], nodes[aNext], nodes[b], nodes[bNext]);
      if (point) result.push({ a, b, point });
    }
  }
  return result;
};

const findNeighborIntersections = (
  nodes: Coord[],
  neighbors: Array<{ id: string; name: string; ring: Coord[] }>,
): NeighborIntersection[] => {
  if (nodes.length < 2) return [];
  const dedupe = new Set<string>();
  const result: NeighborIntersection[] = [];
  for (const neighbor of neighbors) {
    const ring = openRing(neighbor.ring);
    if (ring.length < 2) continue;
    for (let first = 0; first < nodes.length; first += 1) {
      const a = nodes[first];
      const b = nodes[(first + 1) % nodes.length];
      for (let second = 0; second < ring.length; second += 1) {
        const point = segmentIntersection(a, b, ring[second], ring[(second + 1) % ring.length]);
        if (!point) continue;
        const key = `${neighbor.id}:${point[0].toFixed(5)}:${point[1].toFixed(5)}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        result.push({ neighborId: neighbor.id, neighborName: neighbor.name, point });
      }
    }
  }
  return result;
};

const snapshotKey = (snapshot: EditorSnapshot) => JSON.stringify(snapshot);

const BorderSurgeryPage: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ index: number; before: EditorSnapshot } | null>(null);
  const panRef = useRef<{ pointerId: number; start: Coord; center: Coord; lonSpan: number; latSpan: number } | null>(null);
  const [manifest, setManifest] = useState<BorderManifest | null>(null);
  const [geojson, setGeojson] = useState<GeoCollection | null>(null);
  const [coastlines, setCoastlines] = useState<PhysicalCoastlines | null>(null);
  const [overrides, setOverrides] = useState<OverrideStore>({ countries: {} });
  const [asset, setAsset] = useState<HybridAsset | null>(null);
  const [countryId, setCountryId] = useState('ITA');
  const [ringId, setRingId] = useState('mainland');
  const [nodes, setNodes] = useState<Coord[]>([]);
  const [edgeKinds, setEdgeKinds] = useState<EdgeKind[]>([]);
  const [baseline, setBaseline] = useState<EditorSnapshot>({ nodes: [], edgeKinds: [] });
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [spacePanning, setSpacePanning] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewCenter, setViewCenter] = useState<Coord | null>(null);
  const [snapMode, setSnapMode] = useState<SnapMode>('none');
  const [showSource, setShowSource] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(true);
  const [showCoast, setShowCoast] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crossingSummaries, setCrossingSummaries] = useState<Record<string, CrossingSummary>>({});
  const [hybridRingsByCountry, setHybridRingsByCountry] = useState<Record<string, Coord[][]>>({});
  const [crossingScanActive, setCrossingScanActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/assets/globe/borders/hybrid/v1/manifest.json').then((response) => response.json()),
      fetch('/geo/publicgeocountries-simplified-35.json').then((response) => response.json()),
      fetch('/assets/globe/coastlines/physical-coastlines-v1.json').then((response) => response.json()),
      fetch('/api/admin/globe/border-surgery/overrides').then((response) => response.json()),
    ]).then(([nextManifest, nextGeojson, nextCoastlines, nextOverrides]) => {
      if (cancelled) return;
      setManifest(nextManifest);
      setGeojson(nextGeojson);
      setCoastlines(nextCoastlines);
      setOverrides(nextOverrides);
      setLoading(false);
    }).catch((nextError) => {
      if (cancelled) return;
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const featuresById = useMemo(() => {
    const map = new Map<string, GeoFeature>();
    for (const feature of geojson?.features ?? []) {
      const id = featureIso3(feature);
      if (id && id !== '-99') map.set(id, feature);
    }
    return map;
  }, [geojson]);

  useEffect(() => {
    if (!manifest || !geojson) return;
    let cancelled = false;
    const assetEntries = Object.entries(manifest.countries ?? {}).filter(([, entry]) => Boolean(entry.url));
    const loaded: Array<{ id: string; name: string; rings: Coord[][] }> = [];
    let cursor = 0;
    setCrossingScanActive(true);
    const worker = async () => {
      while (!cancelled) {
        const index = cursor;
        cursor += 1;
        if (index >= assetEntries.length) return;
        const [id, entry] = assetEntries[index];
        try {
          const response = await fetch(`${entry.url}?borderCrossingScan=${Date.now()}`);
          if (!response.ok) continue;
          const nextAsset = await response.json() as HybridAsset;
          loaded.push({
            id,
            name: featureName(featuresById.get(id)),
            rings: (nextAsset.rings ?? []).filter((ring) => ring?.presentation !== false).map((ring) => unwrapRing(ring.coordinates ?? [])).filter((ring) => ring.length >= 2),
          });
        } catch {
          // A missing diagnostic asset should not prevent the rest of the dev scan.
        }
      }
    };
    const workerCount = Math.min(6, Math.max(1, assetEntries.length));
    Promise.all(Array.from({ length: workerCount }, () => worker())).then(() => {
      if (cancelled) return;
      const summaries: Record<string, CrossingSummary> = {};
      for (let first = 0; first < loaded.length; first += 1) {
        for (let second = first + 1; second < loaded.length; second += 1) {
          const a = loaded[first];
          const b = loaded[second];
          let pairCrossings = 0;
          for (const aRing of a.rings) {
            const aBounds = featureBounds([aRing]);
            if (!aBounds) continue;
            const centerLongitude = aRing.reduce((sum, coord) => sum + coord[0], 0) / aRing.length;
            for (const bRingSource of b.rings) {
              const bRing = unwrapRing(bRingSource, centerLongitude);
              const bBounds = featureBounds([bRing]);
              if (!bBounds || !boundsOverlap(aBounds, bBounds, 0.02)) continue;
              pairCrossings += findNeighborIntersections(aRing, [{ id: b.id, name: b.name, ring: bRing }]).length;
            }
          }
          // Two proper crossings mean one rendered border enters the other and exits again.
          // A single crossing is usually a shared-border junction or seam artifact.
          if (pairCrossings < 2) continue;
          for (const [country, neighbor] of [[a, b], [b, a]] as const) {
            const current = summaries[country.id] ?? { count: 0, neighborIds: [] };
            current.count += pairCrossings;
            if (!current.neighborIds.includes(neighbor.id)) current.neighborIds.push(neighbor.id);
            current.neighborIds.sort();
            summaries[country.id] = current;
          }
        }
      }
      setHybridRingsByCountry(Object.fromEntries(loaded.map((entry) => [entry.id, entry.rings])));
      setCrossingSummaries(summaries);
      setCrossingScanActive(false);
    });
    return () => {
      cancelled = true;
    };
  }, [featuresById, geojson, manifest]);

  const countryOptions = useMemo<CountryOption[]>(() => {
    return [...featuresById.entries()]
      .map(([id, feature]) => ({
        id,
        name: featureName(feature),
        status: manifest?.countries?.[id]?.status
          ?? (manifest?.skippedCountries?.[id] ? 'generator-skipped' : 'source-only'),
        editable: true,
        hasAsset: Boolean(manifest?.countries?.[id]?.url),
        neighborIntersectionCount: crossingSummaries[id]?.count ?? 0,
        neighborIntersectionCountryIds: crossingSummaries[id]?.neighborIds ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [crossingSummaries, featuresById, manifest]);

  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return countryOptions;
    return countryOptions.filter((country) => `${country.name} ${country.id}`.toLowerCase().includes(query));
  }, [countryOptions, search]);

  const selectedFeature = featuresById.get(countryId) ?? null;
  const selectedCountryOption = countryOptions.find((country) => country.id === countryId) ?? null;
  const selectedManifestEntry = manifest?.countries?.[countryId] ?? null;
  const selectedOverride = overrides.countries?.[countryId]?.rings?.[ringId] ?? null;

  const loadCountry = useCallback(async (nextCountryId: string) => {
    setError(null);
    setMessage(null);
    setSelectedNodes([]);
    setSelectedEdge(null);
    setUndoStack([]);
    setRedoStack([]);
    const entry = manifest?.countries?.[nextCountryId];
    if (!entry?.url) {
      setAsset(null);
      setRingId('mainland');
      return;
    }
    try {
      const response = await fetch(`${entry.url}?borderSurgery=${Date.now()}`);
      if (!response.ok) throw new Error(`Unable to load ${nextCountryId} hybrid border (${response.status}).`);
      const nextAsset = await response.json();
      setAsset(nextAsset);
      setRingId(chooseDefaultRingId(nextAsset));
    } catch (nextError) {
      setAsset(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [manifest]);

  useEffect(() => {
    if (!manifest || !geojson) return;
    void loadCountry(countryId);
  }, [countryId, geojson, loadCountry, manifest]);

  const ringOptions = useMemo(() => {
    if (asset?.rings?.length) return asset.rings.map((ring) => ring.id);
    return ['mainland'];
  }, [asset]);

  useEffect(() => {
    const assetRing = asset?.rings?.find((ring) => ring.id === ringId) ?? null;
    let nextNodes: Coord[] = [];
    let nextKinds: EdgeKind[] = [];
    if (assetRing) {
      const rawNodes = openRing(assetRing.coordinates);
      nextKinds = ringEdgeKinds(assetRing, rawNodes.length);
      nextNodes = unwrapRing(rawNodes);
    } else {
      const sourceRings = featureOuterRings(selectedFeature)
        .sort((a, b) => b.length - a.length);
      nextNodes = unwrapRing(sourceRings[0] ?? []);
      nextKinds = Array.from({ length: nextNodes.length }, () => 'political' as const);
    }
    if (selectedOverride?.coordinates?.length) {
      nextNodes = unwrapRing(selectedOverride.coordinates);
      nextKinds = Array.from({ length: nextNodes.length }, (_, index) => selectedOverride.edgeKinds?.[index] === 'coastline' ? 'coastline' : 'political');
    }
    setNodes(nextNodes);
    setEdgeKinds(nextKinds);
    setBaseline({ nodes: nextNodes.map(copyCoord), edgeKinds: [...nextKinds] });
    setSelectedNodes([]);
    setSelectedEdge(null);
    setUndoStack([]);
    setRedoStack([]);
    setViewZoom(1);
    setViewCenter(null);
  }, [asset, ringId, selectedFeature, selectedOverride]);

  const fitProjection = useMemo(() => buildProjection(baseline.nodes.length ? baseline.nodes : nodes), [baseline, nodes]);
  const projection = useMemo(() => {
    const zoom = clamp(viewZoom, 0.25, 40);
    const lonSpan = fitProjection.lonSpan / zoom;
    const latSpan = fitProjection.latSpan / zoom;
    const fallbackCenter: Coord = [
      (fitProjection.minLon + fitProjection.maxLon) / 2,
      (fitProjection.minLat + fitProjection.maxLat) / 2,
    ];
    const center = viewCenter ?? fallbackCenter;
    return {
      minLon: center[0] - lonSpan / 2,
      maxLon: center[0] + lonSpan / 2,
      minLat: center[1] - latSpan / 2,
      maxLat: center[1] + latSpan / 2,
      lonSpan,
      latSpan,
    };
  }, [fitProjection, viewCenter, viewZoom]);
  const editorBounds = useMemo<[number, number, number, number]>(() => [projection.minLon, projection.minLat, projection.maxLon, projection.maxLat], [projection]);
  const editorCenterLongitude = (projection.minLon + projection.maxLon) / 2;
  const sourceRings = useMemo(
    () => featureOuterRings(selectedFeature).map((ring) => unwrapRing(ring, editorCenterLongitude)),
    [editorCenterLongitude, selectedFeature],
  );
  const allNeighborRings = useMemo(() => {
    const workingBounds = featureBounds([nodes]);
    if (!workingBounds) return [] as Array<{ id: string; name: string; ring: Coord[] }>;
    const workingCenterLongitude = nodes.length
      ? nodes.reduce((sum, coord) => sum + coord[0], 0) / nodes.length
      : editorCenterLongitude;
    return (geojson?.features ?? []).flatMap((feature) => {
      const id = featureIso3(feature);
      if (!id || id === countryId) return [];
      const preferredRings = hybridRingsByCountry[id]?.length
        ? hybridRingsByCountry[id]
        : featureOuterRings(feature);
      return preferredRings.flatMap((ring) => {
        const alignedRing = unwrapRing(ring, workingCenterLongitude);
        const bounds = featureBounds([alignedRing]);
        if (!bounds || !boundsOverlap(workingBounds, bounds, 0.75)) return [];
        return [{ id, name: featureName(feature), ring: alignedRing }];
      });
    });
  }, [countryId, editorCenterLongitude, geojson, hybridRingsByCountry, nodes]);
  const neighborRings = showNeighbors ? allNeighborRings.filter((neighbor) => {
    const bounds = featureBounds([neighbor.ring]);
    return Boolean(bounds && boundsOverlap(editorBounds, bounds, 0.75));
  }) : [];
  const rawNeighborIntersections = useMemo(() => findNeighborIntersections(nodes, allNeighborRings), [allNeighborRings, nodes]);
  const neighborIntersections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of rawNeighborIntersections) counts.set(entry.neighborId, (counts.get(entry.neighborId) ?? 0) + 1);
    return rawNeighborIntersections.filter((entry) => (counts.get(entry.neighborId) ?? 0) >= 2);
  }, [rawNeighborIntersections]);
  const liveNeighborIds = useMemo(() => [...new Set(neighborIntersections.map((entry) => entry.neighborId))].sort(), [neighborIntersections]);

  const visibleCoastSegments = useMemo(() => {
    if (!showCoast) return [] as Array<{ pathId: string; a: Coord; b: Coord }>;
    const bounds: [number, number, number, number] = [
      editorBounds[0] - projection.lonSpan * 0.15,
      editorBounds[1] - projection.latSpan * 0.15,
      editorBounds[2] + projection.lonSpan * 0.15,
      editorBounds[3] + projection.latSpan * 0.15,
    ];
    return (coastlines?.paths ?? []).flatMap((path) => {
      const coords = path.simplifiedCoordinates ?? [];
      const result: Array<{ pathId: string; a: Coord; b: Coord }> = [];
      for (let index = 0; index < coords.length - 1; index += 1) {
        const rawA = coords[index];
        const rawB = coords[index + 1];
        const aLongitude = unwrapLongitudeNear(rawA[0], editorCenterLongitude);
        const a: Coord = [aLongitude, rawA[1]];
        const b: Coord = [unwrapLongitudeNear(rawB[0], aLongitude), rawB[1]];
        const segmentBounds: [number, number, number, number] = [
          Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]),
        ];
        if (boundsOverlap(bounds, segmentBounds)) result.push({ pathId: path.id, a, b });
      }
      return result;
    });
  }, [coastlines, editorBounds, editorCenterLongitude, projection.latSpan, projection.lonSpan, showCoast]);

  const intersections = useMemo(() => findIntersections(nodes), [nodes]);
  const currentSnapshot = useMemo<EditorSnapshot>(() => ({ nodes, edgeKinds }), [edgeKinds, nodes]);
  const dirty = useMemo(() => snapshotKey(currentSnapshot) !== snapshotKey(baseline), [baseline, currentSnapshot]);

  const pushSnapshot = useCallback((before: EditorSnapshot, next: EditorSnapshot) => {
    if (snapshotKey(before) === snapshotKey(next)) return;
    setUndoStack((stack) => [...stack.slice(-79), { nodes: before.nodes.map(copyCoord), edgeKinds: [...before.edgeKinds] }]);
    setRedoStack([]);
    setNodes(next.nodes.map(copyCoord));
    setEdgeKinds([...next.edgeKinds]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setRedoStack((redo) => [...redo.slice(-79), { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] }]);
      setNodes(previous.nodes.map(copyCoord));
      setEdgeKinds([...previous.edgeKinds]);
      setSelectedNodes([]);
      setSelectedEdge(null);
      return stack.slice(0, -1);
    });
  }, [edgeKinds, nodes]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const next = stack[stack.length - 1];
      if (!next) return stack;
      setUndoStack((undoHistory) => [...undoHistory.slice(-79), { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] }]);
      setNodes(next.nodes.map(copyCoord));
      setEdgeKinds([...next.edgeKinds]);
      setSelectedNodes([]);
      setSelectedEdge(null);
      return stack.slice(0, -1);
    });
  }, [edgeKinds, nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePanning(true);
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedNodes();
      } else if (event.key.toLowerCase() === 'a') {
        setToolMode('add');
      } else if (event.key.toLowerCase() === 'v') {
        setToolMode('select');
      } else if (event.key.toLowerCase() === 'h') {
        setToolMode('pan');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePanning(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  const clientPointToSvg = (clientX: number, clientY: number): Coord | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return [local.x, local.y];
  };

  const eventPoint = (event: { clientX: number; clientY: number }): Coord | null => clientPointToSvg(event.clientX, event.clientY);

  const resetView = useCallback(() => {
    setViewZoom(1);
    setViewCenter(null);
  }, []);

  const zoomAt = useCallback((screen: Coord, requestedZoom: number) => {
    const nextZoom = clamp(requestedZoom, 0.25, 40);
    const anchor = screenToGeo(screen, projection);
    const lonSpan = fitProjection.lonSpan / nextZoom;
    const latSpan = fitProjection.latSpan / nextZoom;
    const xFraction = screen[0] / VIEW_WIDTH;
    const yFraction = (VIEW_HEIGHT - screen[1]) / VIEW_HEIGHT;
    setViewZoom(nextZoom);
    setViewCenter([
      anchor[0] - (xFraction - 0.5) * lonSpan,
      anchor[1] - (yFraction - 0.5) * latSpan,
    ]);
  }, [fitProjection.latSpan, fitProjection.lonSpan, projection]);

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const screen = eventPoint(event);
    if (!screen) return;
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(screen, viewZoom * factor);
  };

  const beginCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const shouldPan = toolMode === 'pan' || spacePanning || event.button === 1;
    if (!shouldPan) {
      setSelectedNodes([]);
      setSelectedEdge(null);
      return;
    }
    const start = eventPoint(event);
    if (!start) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      start,
      center: [(projection.minLon + projection.maxLon) / 2, (projection.minLat + projection.maxLat) / 2],
      lonSpan: projection.lonSpan,
      latSpan: projection.latSpan,
    };
  };

  const moveCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const point = eventPoint(event);
    if (!point) return;
    const dx = point[0] - pan.start[0];
    const dy = point[1] - pan.start[1];
    setViewCenter([
      pan.center[0] - (dx / VIEW_WIDTH) * pan.lonSpan,
      pan.center[1] + (dy / VIEW_HEIGHT) * pan.latSpan,
    ]);
  };

  const endCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  };

  const nearestSnap = useCallback((screenPoint: Coord, mode: SnapMode): Coord | null => {
    if (mode === 'none') return null;
    let best: { point: Coord; distance: number } | null = null;
    if (mode === 'coastline') {
      for (const segment of visibleCoastSegments) {
        const candidate = pointSegmentProjection(screenPoint, geoToScreen(segment.a, projection), geoToScreen(segment.b, projection));
        if (!best || candidate.distance < best.distance) best = { point: candidate.point, distance: candidate.distance };
      }
    } else {
      for (const neighbor of neighborRings) {
        const ring = openRing(neighbor.ring);
        for (let index = 0; index < ring.length; index += 1) {
          const a = geoToScreen(ring[index], projection);
          const b = geoToScreen(ring[(index + 1) % ring.length], projection);
          const candidate = pointSegmentProjection(screenPoint, a, b);
          if (!best || candidate.distance < best.distance) best = { point: candidate.point, distance: candidate.distance };
        }
      }
    }
    return best && best.distance <= 28 ? screenToGeo(best.point, projection) : null;
  }, [neighborRings, projection, visibleCoastSegments]);

  const beginNodeDrag = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (toolMode !== 'select' || spacePanning || event.button === 1) return;
    event.stopPropagation();
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    dragRef.current = { index, before };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedEdge(null);
    setSelectedNodes((current) => event.shiftKey
      ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
      : [index]);
  };

  const moveNodeDrag = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (dragRef.current?.index !== index) return;
    const screen = eventPoint(event);
    if (!screen) return;
    const snapped = nearestSnap(screen, snapMode);
    const nextCoord = snapped ?? screenToGeo(screen, projection);
    setNodes((current) => current.map((coord, nodeIndex) => nodeIndex === index ? nextCoord : coord));
  };

  const endNodeDrag = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (dragRef.current?.index !== index) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const before = dragRef.current.before;
    dragRef.current = null;
    const after = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    if (snapshotKey(before) !== snapshotKey(after)) {
      setUndoStack((stack) => [...stack.slice(-79), before]);
      setRedoStack([]);
    }
  };

  const addPointOnEdge = (event: React.PointerEvent<SVGLineElement>, edgeIndex: number) => {
    if (toolMode === 'pan' || spacePanning || event.button === 1) return;
    event.stopPropagation();
    if (toolMode !== 'add' || nodes.length < 2) {
      setSelectedEdge(edgeIndex);
      setSelectedNodes([]);
      return;
    }
    const screen = eventPoint(event);
    if (!screen) return;
    const a = geoToScreen(nodes[edgeIndex], projection);
    const b = geoToScreen(nodes[(edgeIndex + 1) % nodes.length], projection);
    const projected = pointSegmentProjection(screen, a, b).point;
    const snapped = nearestSnap(projected, snapMode);
    const coord = snapped ?? screenToGeo(projected, projection);
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextNodes = [...nodes];
    const insertIndex = edgeIndex + 1;
    nextNodes.splice(insertIndex, 0, coord);
    const nextKinds = [...edgeKinds];
    nextKinds.splice(insertIndex, 0, edgeKinds[edgeIndex] ?? 'political');
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
    setSelectedNodes([insertIndex]);
    setSelectedEdge(null);
    setToolMode('select');
  };

  function deleteSelectedNodes() {
    if (!selectedNodes.length || nodes.length - selectedNodes.length < 3) return;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    let nextNodes = nodes.map(copyCoord);
    let nextKinds = [...edgeKinds];
    const sorted = [...new Set(selectedNodes)].sort((a, b) => b - a);
    for (const index of sorted) {
      if (nextNodes.length <= 3 || index < 0 || index >= nextNodes.length) continue;
      const previous = (index - 1 + nextNodes.length) % nextNodes.length;
      const incomingKind = nextKinds[previous] ?? 'political';
      const outgoingKind = nextKinds[index] ?? 'political';
      nextNodes.splice(index, 1);
      nextKinds.splice(index, 1);
      const adjustedPrevious = previous > index ? previous - 1 : previous;
      nextKinds[adjustedPrevious] = incomingKind === outgoingKind ? incomingKind : 'political';
    }
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
    setSelectedNodes([]);
    setSelectedEdge(null);
  }

  const straightenSelectedRun = () => {
    if (selectedNodes.length !== 2) return;
    const [start, end] = [...selectedNodes].sort((a, b) => a - b);
    if (end - start <= 1 || nodes.length - (end - start) <= 1) return;
    const directCount = end - start - 1;
    const wrapCount = nodes.length - (end - start) - 1;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    if (directCount <= wrapCount) {
      const removedKinds = edgeKinds.slice(start, end);
      const nextNodes = nodes.filter((_, index) => index <= start || index >= end);
      const nextKinds = edgeKinds.filter((_, index) => index <= start || index >= end);
      nextKinds[start] = removedKinds.every((kind) => kind === 'coastline') ? 'coastline' : 'political';
      pushSnapshot(before, { nodes: nextNodes, edgeKinds: nextKinds });
      setSelectedNodes([start, start + 1]);
    } else {
      const keptNodes = nodes.slice(start, end + 1);
      const keptKinds = edgeKinds.slice(start, end);
      const wrapKinds = [...edgeKinds.slice(end), ...edgeKinds.slice(0, start)];
      keptKinds.push(wrapKinds.every((kind) => kind === 'coastline') ? 'coastline' : 'political');
      pushSnapshot(before, { nodes: keptNodes, edgeKinds: keptKinds });
      setSelectedNodes([0, keptNodes.length - 1]);
    }
    setSelectedEdge(null);
  };

  const snapSelectedNode = (mode: Exclude<SnapMode, 'none'>) => {
    if (selectedNodes.length !== 1) return;
    const index = selectedNodes[0];
    const screen = geoToScreen(nodes[index], projection);
    const snapped = nearestSnap(screen, mode);
    if (!snapped) {
      setMessage(`No ${mode === 'coastline' ? 'physical coastline' : 'neighbor border'} within the 28 px snap radius.`);
      return;
    }
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextNodes = nodes.map((coord, nodeIndex) => nodeIndex === index ? snapped : copyCoord(coord));
    pushSnapshot(before, { nodes: nextNodes, edgeKinds: [...edgeKinds] });
    setMessage(mode === 'coastline' ? 'Node snapped to physical land.glb coastline.' : 'Node snapped to neighboring political edge.');
  };

  const setSelectedEdgeKind = (kind: EdgeKind) => {
    if (selectedEdge == null) return;
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    const nextKinds = edgeKinds.map((value, index) => index === selectedEdge ? kind : value);
    pushSnapshot(before, { nodes: nodes.map(copyCoord), edgeKinds: nextKinds });
  };

  const resetWorking = () => {
    const before = { nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] };
    pushSnapshot(before, { nodes: baseline.nodes.map(copyCoord), edgeKinds: [...baseline.edgeKinds] });
    setSelectedNodes([]);
    setSelectedEdge(null);
  };

  const saveOverride = async () => {
    if (!selectedCountryOption?.editable || nodes.length < 3) return;
    setSaving(true);
    setError(null);
    setMessage('Saving override and regenerating globe borders…');
    try {
      const response = await fetch('/api/admin/globe/border-surgery/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryId,
          ringId,
          coordinates: wrapRingForStorage(nodes),
          edgeKinds,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      const [nextOverrides, nextManifest] = await Promise.all([
        fetch(`/api/admin/globe/border-surgery/overrides?t=${Date.now()}`).then((res) => res.json()),
        fetch(`/assets/globe/borders/hybrid/v1/manifest.json?borderSurgery=${Date.now()}`).then((res) => res.json()),
      ]);
      setOverrides(nextOverrides);
      setManifest(nextManifest);
      setBaseline({ nodes: nodes.map(copyCoord), edgeKinds: [...edgeKinds] });
      setUndoStack([]);
      setRedoStack([]);
      setMessage(`Saved ${countryId}/${ringId}. Generator completed successfully.`);
      if (result.assetUrl) {
        const assetResponse = await fetch(`${result.assetUrl}?borderSurgery=${Date.now()}`);
        if (assetResponse.ok) setAsset(await assetResponse.json());
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (!selectedOverride || saving) return;
    setSaving(true);
    setError(null);
    setMessage('Removing manual override and regenerating…');
    try {
      const response = await fetch('/api/admin/globe/border-surgery/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryId, ringId }),
      });
      if (!response.ok) throw new Error(await response.text());
      const [nextOverrides, nextManifest] = await Promise.all([
        fetch(`/api/admin/globe/border-surgery/overrides?t=${Date.now()}`).then((res) => res.json()),
        fetch(`/assets/globe/borders/hybrid/v1/manifest.json?borderSurgery=${Date.now()}`).then((res) => res.json()),
      ]);
      setOverrides(nextOverrides);
      setManifest(nextManifest);
      const nextEntry = nextManifest?.countries?.[countryId];
      if (nextEntry?.url) {
        const assetResponse = await fetch(`${nextEntry.url}?borderSurgery=${Date.now()}`);
        setAsset(assetResponse.ok ? await assetResponse.json() : null);
      } else {
        setAsset(null);
        setRingId('mainland');
      }
      setMessage(`Removed manual override for ${countryId}/${ringId}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const sourcePath = (ring: Coord[]) => ring.map((coord, index) => `${index ? 'L' : 'M'} ${geoToScreen(coord, projection).join(' ')}`).join(' ');
  const workingPath = nodes.length ? `${nodes.map((coord, index) => `${index ? 'L' : 'M'} ${geoToScreen(coord, projection).join(' ')}`).join(' ')} Z` : '';

  if (loading) {
    return <div className="min-h-[70vh] bg-[#05070a] p-8 text-sm text-gray-400">Loading Border Surgery…</div>;
  }

  return (
    <div className="min-h-full bg-[#05070a] text-gray-100">
      <div className="mx-auto max-w-[1880px] px-5 py-5 xl:px-7">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-[#090c11]/90 px-5 py-4 shadow-2xl shadow-black/30">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-red-300">
              <Scissors className="h-4 w-4" />
              Globe laboratory
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Border Surgery</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
              Make visual corrections to SwingSphere country borders without touching the source GeoJSON. Manual edits are stored as generator overrides and still terrain-conform on the production globe.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/dev/globe" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-gray-200 hover:bg-white/[0.08]">
              <ExternalLink className="h-4 w-4" /> Live globe
            </a>
            <button type="button" onClick={saveOverride} disabled={!dirty || saving || !selectedCountryOption?.editable || intersections.length > 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300/25 bg-red-500/15 px-4 text-xs font-black text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-35">
              <Save className="h-4 w-4" /> {saving ? 'Regenerating…' : 'Save & regenerate'}
            </button>
          </div>
        </header>

        <div className="grid min-h-[760px] grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
          <aside className="rounded-2xl border border-white/10 bg-[#090c11]/90 p-4 shadow-xl shadow-black/20">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Country</div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search countries…" className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-300/35" />
            <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {filteredCountries.map((country) => {
                const crossingCount = country.id === countryId && dirty
                  ? neighborIntersections.length
                  : country.neighborIntersectionCount;
                return (
                  <button key={country.id} type="button" onClick={() => setCountryId(country.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${country.id === countryId ? 'bg-red-500/14 text-white' : 'text-gray-400 hover:bg-white/[0.045] hover:text-gray-200'}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold">{country.name}</span>
                      <span className="mt-0.5 block text-[9px] uppercase tracking-[0.14em] text-gray-600">{country.id} · {country.status}{crossingCount ? ` · ${crossingCount} neighbor cross${crossingCount === 1 ? '' : 'es'}` : ''}</span>
                    </span>
                    <span title={crossingCount ? `Crosses ${country.id === countryId && dirty ? liveNeighborIds.join(', ') : country.neighborIntersectionCountryIds.join(', ')}` : country.hasAsset ? 'Hybrid asset exists' : 'Source/skipped'} className={`h-2 w-2 shrink-0 rounded-full ${crossingCount ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.65)]' : country.hasAsset ? 'bg-emerald-400/80' : country.editable ? 'bg-amber-400/80' : 'bg-gray-700'}`} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] leading-5 text-gray-500">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.65)]" /><span><strong className="font-bold text-gray-300">Red</strong> · border crosses a neighboring country boundary</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400/80" /><span><strong className="font-bold text-gray-300">Green</strong> · hybrid border asset exists</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400/80" /><span><strong className="font-bold text-gray-300">Yellow</strong> · source/skipped; first save creates or repairs it</span></div>
              {crossingScanActive ? <div className="mt-1 text-red-200/55">Scanning hybrid assets for neighbor crossings…</div> : null}
            </div>

            <div className="my-4 h-px bg-white/[0.07]" />
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Ring</div>
            <select value={ringId} onChange={(event) => setRingId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-[#0b0e13] px-3 text-sm text-white outline-none">
              {ringOptions.map((id) => {
                const ring = asset?.rings?.find((candidate) => candidate.id === id);
                return <option key={id} value={id}>{id}{ring?.presentation === false ? ' · technical / hidden' : ''}</option>;
              })}
            </select>
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[11px] leading-5 text-gray-400">
              <div className="flex justify-between"><span>Status</span><strong className="text-gray-200">{selectedManifestEntry?.status ?? selectedCountryOption?.status ?? 'source'}</strong></div>
              <div className="flex justify-between"><span>Nodes</span><strong className="text-gray-200">{nodes.length}</strong></div>
              <div className="flex justify-between"><span>Self intersections</span><strong className={intersections.length ? 'text-red-300' : 'text-emerald-300'}>{intersections.length}</strong></div>
              <div className="flex justify-between"><span>Neighbor crossings</span><strong className={neighborIntersections.length ? 'text-red-300' : 'text-emerald-300'}>{neighborIntersections.length}</strong></div>
              {liveNeighborIds.length ? <div className="mt-1 text-[10px] text-red-200/65">Crosses: {liveNeighborIds.join(', ')}</div> : null}
              <div className="flex justify-between"><span>Manual override</span><strong className={selectedOverride ? 'text-amber-200' : 'text-gray-500'}>{selectedOverride ? 'yes' : 'no'}</strong></div>
              <div className="flex justify-between"><span>Presentation</span><strong className={asset?.rings?.find((candidate) => candidate.id === ringId)?.presentation === false ? 'text-amber-200' : 'text-gray-200'}>{asset?.rings?.find((candidate) => candidate.id === ringId)?.presentation === false ? 'technical / hidden' : 'visible'}</strong></div>
            </div>
            {selectedCountryOption?.status === 'source-only' ? (
              <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.05] p-3 text-[11px] leading-5 text-cyan-100/75">
                Source-only country. Your first saved surgery will create a manual hybrid target for this country automatically.
              </div>
            ) : null}
          </aside>

          <main className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07090d] shadow-2xl shadow-black/35">
            <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/65 p-2 backdrop-blur-xl">
              <ToolButton active={toolMode === 'select'} icon={<MousePointer2 className="h-4 w-4" />} label="Select / move (V)" onClick={() => setToolMode('select')} />
              <ToolButton active={toolMode === 'add'} icon={<Plus className="h-4 w-4" />} label="Add point (A)" onClick={() => setToolMode('add')} />
              <ToolButton active={toolMode === 'pan'} icon={<Hand className="h-4 w-4" />} label="Pan (H or Space + drag)" onClick={() => setToolMode('pan')} />
              <div className="mx-1 h-7 w-px bg-white/10" />
              <ToolButton icon={<ZoomOut className="h-4 w-4" />} label="Zoom out" onClick={() => zoomAt([VIEW_WIDTH / 2, VIEW_HEIGHT / 2], viewZoom / 1.35)} />
              <ToolButton icon={<ZoomIn className="h-4 w-4" />} label="Zoom in" onClick={() => zoomAt([VIEW_WIDTH / 2, VIEW_HEIGHT / 2], viewZoom * 1.35)} />
              <ToolButton icon={<Maximize2 className="h-4 w-4" />} label="Fit border" onClick={resetView} />
              <span className="min-w-[46px] px-1 text-center text-[10px] font-bold tabular-nums text-gray-500">{Math.round(viewZoom * 100)}%</span>
              <div className="mx-1 h-7 w-px bg-white/10" />
              <ToolButton active={snapMode === 'coastline'} icon={<Waves className="h-4 w-4" />} label="Auto-snap coast" onClick={() => setSnapMode((mode) => mode === 'coastline' ? 'none' : 'coastline')} />
              <ToolButton active={snapMode === 'neighbor'} icon={<GitMerge className="h-4 w-4" />} label="Auto-snap neighbor" onClick={() => setSnapMode((mode) => mode === 'neighbor' ? 'none' : 'neighbor')} />
              <div className="mx-1 h-7 w-px bg-white/10" />
              <ToolButton disabled={!undoStack.length} icon={<Undo2 className="h-4 w-4" />} label="Undo" onClick={undo} />
              <ToolButton disabled={!redoStack.length} icon={<Redo2 className="h-4 w-4" />} label="Redo" onClick={redo} />
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              className={`h-full min-h-[760px] w-full touch-none select-none ${toolMode === 'add' ? 'cursor-crosshair' : toolMode === 'pan' || spacePanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
              onWheel={handleWheel}
              onPointerDown={beginCanvasPointer}
              onPointerMove={moveCanvasPointer}
              onPointerUp={endCanvasPointer}
              onPointerCancel={endCanvasPointer}
            >
              <defs>
                <pattern id="border-surgery-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
                </pattern>
                <filter id="border-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#07090d" />
              <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#border-surgery-grid)" />

              {showNeighbors ? neighborRings.map((neighbor, index) => (
                <path key={`${neighbor.id}-${index}`} d={`${sourcePath(neighbor.ring)} Z`} fill="rgba(111, 125, 145, 0.045)" stroke="rgba(147, 161, 181, 0.22)" strokeWidth="1.25" />
              )) : null}

              {showCoast ? visibleCoastSegments.map((segment, index) => {
                const a = geoToScreen(segment.a, projection);
                const b = geoToScreen(segment.b, projection);
                return <line key={`${segment.pathId}-${index}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(65, 215, 255, 0.45)" strokeWidth="2.2" strokeLinecap="round" />;
              }) : null}

              {showSource ? sourceRings.map((ring, index) => (
                <path key={`source-${index}`} d={`${sourcePath(ring)} Z`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="7 7" />
              )) : null}

              {workingPath ? <path d={workingPath} fill="rgba(255,70,92,0.055)" stroke="rgba(255,70,92,0.14)" strokeWidth="9" filter="url(#border-glow)" /> : null}

              {nodes.map((coord, index) => {
                const next = nodes[(index + 1) % nodes.length];
                const a = geoToScreen(coord, projection);
                const b = geoToScreen(next, projection);
                const selected = selectedEdge === index;
                const coast = edgeKinds[index] === 'coastline';
                return (
                  <line
                    key={`edge-${index}`}
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                    stroke={selected ? '#ffffff' : coast ? '#ff5268' : '#f5dfe3'}
                    strokeWidth={selected ? 6 : 3}
                    strokeLinecap="round"
                    className={toolMode === 'add' ? 'cursor-crosshair' : 'cursor-pointer'}
                    onPointerDown={(event) => addPointOnEdge(event, index)}
                  />
                );
              })}

              {intersections.map((intersection, index) => {
                const point = geoToScreen(intersection.point, projection);
                return (
                  <g key={`intersection-${index}`} transform={`translate(${point[0]} ${point[1]})`}>
                    <circle r="11" fill="rgba(255,45,70,0.15)" stroke="#ff3854" strokeWidth="2" />
                    <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" stroke="#ff6a7d" strokeWidth="2" />
                  </g>
                );
              })}

              {neighborIntersections.map((intersection, index) => {
                const point = geoToScreen(intersection.point, projection);
                return (
                  <g key={`neighbor-intersection-${intersection.neighborId}-${index}`} transform={`translate(${point[0]} ${point[1]})`} className="pointer-events-none">
                    <circle r="9" fill="rgba(255,38,62,0.22)" stroke="#ff263e" strokeWidth="2.5" />
                    <circle r="2.5" fill="#fff" />
                    <text x="12" y="4" fill="#ff9aa8" fontSize="10" fontWeight="800">{intersection.neighborId}</text>
                  </g>
                );
              })}

              {nodes.map((coord, index) => {
                const point = geoToScreen(coord, projection);
                const selected = selectedNodes.includes(index);
                return (
                  <circle
                    key={`node-${index}`}
                    cx={point[0]}
                    cy={point[1]}
                    r={selected ? 8 : 5.5}
                    fill={selected ? '#ffffff' : '#0b0d11'}
                    stroke={selected ? '#ff465c' : '#ff9eaa'}
                    strokeWidth={selected ? 4 : 2.5}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(event) => beginNodeDrag(event, index)}
                    onPointerMove={(event) => moveNodeDrag(event, index)}
                    onPointerUp={(event) => endNodeDrag(event, index)}
                  />
                );
              })}
            </svg>

            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[10px] leading-5 text-gray-500 backdrop-blur-xl">
              <div><span className="text-gray-300">Pink-red</span> = coast-preserving edge · <span className="text-gray-300">white</span> = political/terrain-conformed · <span className="text-cyan-300/70">cyan</span> = physical land.glb coast</div>
              <div className="mt-0.5 text-gray-600">Wheel = zoom at cursor · Space + drag / middle mouse = pan · H = hand tool · Fit returns to country</div>
            </div>
          </main>

          <aside className="rounded-2xl border border-white/10 bg-[#090c11]/90 p-4 shadow-xl shadow-black/20">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Precision actions</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ActionButton icon={<Trash2 className="h-4 w-4" />} label="Delete node" disabled={!selectedNodes.length || nodes.length - selectedNodes.length < 3} onClick={deleteSelectedNodes} />
              <ActionButton icon={<CornerDownRight className="h-4 w-4" />} label="Straighten run" disabled={selectedNodes.length !== 2} onClick={straightenSelectedRun} />
              <ActionButton icon={<Waves className="h-4 w-4" />} label="Snap to coast" disabled={selectedNodes.length !== 1} onClick={() => snapSelectedNode('coastline')} />
              <ActionButton icon={<GitMerge className="h-4 w-4" />} label="Snap neighbor" disabled={selectedNodes.length !== 1} onClick={() => snapSelectedNode('neighbor')} />
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200"><Crosshair className="h-4 w-4 text-red-300" /> Selected edge</div>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">Click a line in Select mode, then tell the runtime whether interpolation should preserve the physical coastline or climb the terrain.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={selectedEdge == null} onClick={() => setSelectedEdgeKind('coastline')} className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${selectedEdge != null && edgeKinds[selectedEdge] === 'coastline' ? 'border-red-300/35 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/[0.03] text-gray-500'} disabled:opacity-30`}>Coastline</button>
                <button type="button" disabled={selectedEdge == null} onClick={() => setSelectedEdgeKind('political')} className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${selectedEdge != null && edgeKinds[selectedEdge] === 'political' ? 'border-white/25 bg-white/[0.07] text-white' : 'border-white/10 bg-white/[0.03] text-gray-500'} disabled:opacity-30`}>Terrain</button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="text-xs font-bold text-gray-200">Reference layers</div>
              <LayerToggle checked={showCoast} label="Physical land.glb coastline" accent="cyan" onChange={setShowCoast} />
              <LayerToggle checked={showSource} label="Original source GeoJSON" accent="white" onChange={setShowSource} />
              <LayerToggle checked={showNeighbors} label="Neighboring countries" accent="gray" onChange={setShowNeighbors} />
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[11px] leading-5 text-gray-500">
              <div className="flex items-center gap-2 font-bold text-gray-200"><Activity className="h-4 w-4 text-red-300" /> Workflow</div>
              <ol className="mt-2 space-y-1.5">
                <li>1. Drag a bad node or press Delete to remove a divot.</li>
                <li>2. Use Add Point to split an edge exactly where needed.</li>
                <li>3. Snap coastline nodes to cyan physical shoreline segments.</li>
                <li>4. Mark coastline edges red so the runtime preserves their physical radius.</li>
                <li>5. Save & regenerate, then verify on the live globe.</li>
              </ol>
            </div>

            {intersections.length ? (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.08] p-3 text-[11px] leading-5 text-red-100/85">
                Save is blocked because the edited ring has {intersections.length} self-intersection{intersections.length === 1 ? '' : 's'}. Red × markers show where edges cross.
              </div>
            ) : null}

            {message ? <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-500/[0.06] p-3 text-[11px] leading-5 text-emerald-100/80">{message}</div> : null}
            {error ? <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/[0.08] p-3 text-[11px] leading-5 text-red-100/85">{error}</div> : null}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={resetWorking} disabled={!dirty} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs font-bold text-gray-300 hover:bg-white/[0.07] disabled:opacity-30"><RotateCcw className="h-4 w-4" /> Reset edits</button>
              <button type="button" onClick={removeOverride} disabled={!selectedOverride || saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300/15 bg-amber-500/[0.045] px-3 py-2.5 text-xs font-bold text-amber-100/80 hover:bg-amber-500/[0.08] disabled:opacity-30"><Trash2 className="h-4 w-4" /> Remove override</button>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3 font-mono text-[10px] leading-5 text-gray-500">
              <div className="flex justify-between"><span>country</span><span className="text-gray-300">{countryId}</span></div>
              <div className="flex justify-between"><span>ring</span><span className="text-gray-300">{ringId}</span></div>
              <div className="flex justify-between"><span>selected nodes</span><span className="text-gray-300">{selectedNodes.join(', ') || 'none'}</span></div>
              <div className="flex justify-between"><span>selected edge</span><span className="text-gray-300">{selectedEdge ?? 'none'}</span></div>
              <div className="flex justify-between"><span>dirty</span><span className={dirty ? 'text-amber-300' : 'text-gray-300'}>{String(dirty)}</span></div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const ToolButton: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }> = ({ icon, label, active = false, disabled = false, onClick }) => (
  <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${active ? 'border-red-300/30 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/[0.035] text-gray-400 hover:bg-white/[0.075] hover:text-white'} disabled:opacity-30`}>
    {icon}
  </button>
);

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }> = ({ icon, label, disabled = false, onClick }) => (
  <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-2 text-[11px] font-bold text-gray-300 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
    {icon}{label}
  </button>
);

const LayerToggle: React.FC<{ checked: boolean; label: string; accent: 'cyan' | 'white' | 'gray'; onChange: (checked: boolean) => void }> = ({ checked, label, accent, onChange }) => (
  <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-[11px] text-gray-400">
    <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${accent === 'cyan' ? 'bg-cyan-300/70' : accent === 'white' ? 'bg-white/65' : 'bg-gray-500'}`} />{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-red-500" />
  </label>
);

export default BorderSurgeryPage;
