import React, { useMemo } from 'react';
import mapStyle from './miniMapStyle.json';

type PointGeometry = { type: 'Point'; coordinates: [number, number] };
type PolygonGeometry = { type: 'Polygon'; coordinates: number[][][] };
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: number[][][][] };
type LineStringGeometry = { type: 'LineString'; coordinates: number[][] };
type MultiLineStringGeometry = { type: 'MultiLineString'; coordinates: number[][][] };
export type MiniMapGeometry = PointGeometry | PolygonGeometry | MultiPolygonGeometry;
export type MiniMapAreaGeometry = PolygonGeometry | MultiPolygonGeometry;
export type MiniMapRoadGeometry = LineStringGeometry | MultiLineStringGeometry;
export type MiniMapDistrictGeometry = MiniMapAreaGeometry[];
export type MiniMapDistrictMeta = { id?: string | number; name?: string };
export type MiniMapStyleOverrides = {
  boundary?: { color?: string; opacity?: number; strokeWidth?: number; fillOpacity?: number; fillColor?: string };
  districts?: { color?: string; opacity?: number; strokeWidth?: number; fillOpacity?: number; fillColor?: string };
  roads?: { color?: string; opacity?: number; strokeWidth?: number };
  pin?: { color?: string; opacity?: number; strokeWidth?: number; dotRadius?: number; glowRadius?: number; glowOpacity?: number };
};
export type MiniMapDistrictStyle = {
  fillColor?: string;
  strokeColor?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeWidth?: number;
};

type MiniMapProps = {
  locationVisibility: 'public' | 'area-only';
  areaGeometry?: MiniMapAreaGeometry | null;
  districtsGeometry?: MiniMapDistrictGeometry | null;
  districtsMeta?: MiniMapDistrictMeta[] | null;
  districtsStyleResolver?: (meta: MiniMapDistrictMeta | null, index: number) => MiniMapDistrictStyle | null;
  pointGeometry?: PointGeometry | null;
  roadsGeometry?: MiniMapRoadGeometry | null;
  label?: string;
  disclosure?: string;
  styleOverrides?: MiniMapStyleOverrides;
};

const VIEWBOX_SIZE = 1000;
const FIT_RATIO = 0.86;
const VIEWBOX_PADDING = Math.round(((1 - FIT_RATIO) * VIEWBOX_SIZE) / 2);
const BOUNDS_PAD_FRACTION = 0.08;
const MIN_BOUNDS_PAD = 0.0001;
const POINT_PAD = 0.06;

const getLayerPaint = (id: string) => {
  const layer = mapStyle.layers.find((item) => item.id === id);
  return layer?.paint ?? {};
};

const colors = {
  background: (getLayerPaint('background') as { 'background-color'?: string })['background-color'] ?? '#0b0c0f',
  boundaryFill: (getLayerPaint('boundary-fill') as { 'fill-color'?: string })['fill-color'] ?? '#2a2018',
  boundaryFillOpacity:
    (getLayerPaint('boundary-fill') as { 'fill-opacity'?: number })['fill-opacity'] ?? 0.45,
  boundaryLine: (getLayerPaint('boundary-line') as { 'line-color'?: string })['line-color'] ?? '#c9b27a',
  boundaryLineOpacity:
    (getLayerPaint('boundary-line') as { 'line-opacity'?: number })['line-opacity'] ?? 0.6,
  roadLine: (getLayerPaint('road-minor') as { 'line-color'?: string })['line-color'] ?? '#6f6357',
  roadLineOpacity:
    (getLayerPaint('road-minor') as { 'line-opacity'?: number })['line-opacity'] ?? 0.2,
  districtLine: (getLayerPaint('boundary-line') as { 'line-color'?: string })['line-color'] ?? '#c9b27a',
  districtLineOpacity: 0.25,
  pointAccent: (getLayerPaint('point-accent') as { 'circle-color'?: string })['circle-color'] ?? '#d6b479',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mercator = (lat: number, lng: number) => {
  const x = (lng + 180) / 360;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { x, y };
};

const expandBounds = (bounds: { minX: number; maxX: number; minY: number; maxY: number }, pad: number) => ({
  minX: bounds.minX - pad,
  maxX: bounds.maxX + pad,
  minY: bounds.minY - pad,
  maxY: bounds.maxY + pad,
});

const boundsFromCoords = (coords: number[][]) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  coords.forEach(([lng, lat]) => {
    const p = mercator(lat, lng);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  return { minX, maxX, minY, maxY };
};

export const getGeometryBounds = (geometry?: MiniMapGeometry | null) => {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    const p = mercator(lat, lng);
    const pad = POINT_PAD;
    return expandBounds(
      {
        minX: p.x,
        maxX: p.x,
        minY: p.y,
        maxY: p.y,
      },
      pad
    );
  }

  const coords: number[][] = [];
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach((ring) => coords.push(...ring));
  } else {
    geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => coords.push(...ring)));
  }

  const bounds = boundsFromCoords(coords);
  const width = Math.max(0.0001, bounds.maxX - bounds.minX);
  const height = Math.max(0.0001, bounds.maxY - bounds.minY);
  const pad = Math.max(Math.max(width, height) * BOUNDS_PAD_FRACTION, MIN_BOUNDS_PAD);
  return expandBounds(bounds, pad);
};

const project = (
  lng: number,
  lat: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  const p = mercator(lat, lng);
  const width = Math.max(0.0001, bounds.maxX - bounds.minX);
  const height = Math.max(0.0001, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (VIEWBOX_SIZE - VIEWBOX_PADDING * 2) / width,
    (VIEWBOX_SIZE - VIEWBOX_PADDING * 2) / height
  );
  const x = (p.x - bounds.minX) * scale + VIEWBOX_PADDING;
  const y = (p.y - bounds.minY) * scale + VIEWBOX_PADDING;
  return { x, y };
};

const buildPath = (
  geometry: PolygonGeometry | MultiPolygonGeometry,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  const segments: string[] = [];
  const addRing = (ring: number[][]) => {
    if (!ring.length) return;
    const first = project(ring[0][0], ring[0][1], bounds);
    let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
    for (let i = 1; i < ring.length; i += 1) {
      const point = project(ring[i][0], ring[i][1], bounds);
      path += ` L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }
    path += ' Z';
    segments.push(path);
  };

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(addRing);
  } else {
    geometry.coordinates.forEach((polygon) => polygon.forEach(addRing));
  }

  return segments.join(' ');
};

const buildLinePath = (
  geometry: LineStringGeometry | MultiLineStringGeometry,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  const segments: string[] = [];
  const addLine = (line: number[][]) => {
    if (!line.length) return;
    const first = project(line[0][0], line[0][1], bounds);
    let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
    for (let i = 1; i < line.length; i += 1) {
      const point = project(line[i][0], line[i][1], bounds);
      path += ` L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }
    segments.push(path);
  };

  if (geometry.type === 'LineString') {
    addLine(geometry.coordinates);
  } else {
    geometry.coordinates.forEach(addLine);
  }

  return segments.join(' ');
};

export const MiniMap: React.FC<MiniMapProps> = ({
  locationVisibility,
  areaGeometry,
  districtsGeometry,
  districtsMeta,
  districtsStyleResolver,
  pointGeometry,
  roadsGeometry,
  label,
  disclosure,
  styleOverrides,
}) => {
  const boundaryStyle = {
    color: styleOverrides?.boundary?.color ?? colors.boundaryLine,
    opacity: clamp(styleOverrides?.boundary?.opacity ?? colors.boundaryLineOpacity, 0, 1),
    strokeWidth: clamp(styleOverrides?.boundary?.strokeWidth ?? 1.2, 0.2, 4),
    fillColor: styleOverrides?.boundary?.fillColor ?? styleOverrides?.boundary?.color ?? colors.boundaryFill,
    fillOpacity: clamp(styleOverrides?.boundary?.fillOpacity ?? colors.boundaryFillOpacity, 0, 1),
  };
  const districtStyle = {
    color: styleOverrides?.districts?.color ?? colors.districtLine,
    opacity: clamp(styleOverrides?.districts?.opacity ?? colors.districtLineOpacity, 0, 1),
    strokeWidth: clamp(styleOverrides?.districts?.strokeWidth ?? 0.6, 0.2, 3),
    fillColor: styleOverrides?.districts?.fillColor ?? styleOverrides?.districts?.color ?? colors.boundaryFill,
    fillOpacity: clamp(styleOverrides?.districts?.fillOpacity ?? 0.16, 0, 1),
  };
  const roadsStyle = {
    color: styleOverrides?.roads?.color ?? colors.roadLine,
    opacity: clamp(styleOverrides?.roads?.opacity ?? colors.roadLineOpacity, 0, 1),
    strokeWidth: clamp(styleOverrides?.roads?.strokeWidth ?? 0.8, 0.2, 3),
  };
  const pinStyle = {
    color: styleOverrides?.pin?.color ?? colors.pointAccent,
    opacity: clamp(styleOverrides?.pin?.opacity ?? 1, 0, 1),
    strokeWidth: clamp(styleOverrides?.pin?.strokeWidth ?? 1.2, 0.4, 4),
    dotRadius: clamp(styleOverrides?.pin?.dotRadius ?? 7, 3, 14),
    glowRadius: clamp(styleOverrides?.pin?.glowRadius ?? 16, 8, 30),
    glowOpacity: clamp(styleOverrides?.pin?.glowOpacity ?? 0.6, 0, 1),
  };
  const pinRingRadius = Math.max(pinStyle.dotRadius + 6, pinStyle.dotRadius * 2);
  const pinStemStart = pinStyle.dotRadius + 2;
  const pinStemEnd = pinStyle.dotRadius + 14;
  const activeGeometry = areaGeometry ?? null;
  const bounds = useMemo(
    () => getGeometryBounds(activeGeometry ?? pointGeometry),
    [activeGeometry, pointGeometry]
  );

  const boundaryPath = useMemo(() => {
    if (!bounds || !activeGeometry) return null;
    return buildPath(activeGeometry, bounds);
  }, [activeGeometry, bounds]);

  const roadsPath = useMemo(() => {
    if (!bounds || !roadsGeometry) return null;
    return buildLinePath(roadsGeometry, bounds);
  }, [bounds, roadsGeometry]);

  const districtsPaths = useMemo(() => {
    if (!bounds || !districtsGeometry?.length) return null;
    return districtsGeometry.map((geom) => buildPath(geom, bounds));
  }, [bounds, districtsGeometry]);

  const point = useMemo(() => {
    if (!bounds || !pointGeometry || locationVisibility !== 'public') return null;
    const [lng, lat] = pointGeometry.coordinates;
    return project(lng, lat, bounds);
  }, [bounds, pointGeometry, locationVisibility]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="w-full h-full"
        aria-hidden="true"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <radialGradient id="map-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <radialGradient id="point-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pinStyle.color} stopOpacity={pinStyle.glowOpacity * pinStyle.opacity} />
            <stop offset="100%" stopColor={pinStyle.color} stopOpacity={0} />
          </radialGradient>
        </defs>

        <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} fill={colors.background} />

        {boundaryPath && (
          <>
            <path
              d={boundaryPath}
              fill={boundaryStyle.fillColor}
              fillOpacity={boundaryStyle.fillOpacity}
              stroke="none"
            />
            <path
              d={boundaryPath}
              fill="none"
              stroke={boundaryStyle.color}
              strokeOpacity={boundaryStyle.opacity}
              strokeWidth={boundaryStyle.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {districtsPaths?.length &&
          districtsPaths.map((path, index) => {
            const meta = districtsMeta?.[index] ?? null;
            const resolved = districtsStyleResolver?.(meta, index) ?? null;
            const fillColor = resolved?.fillColor ?? districtStyle.fillColor;
            const strokeColor = resolved?.strokeColor ?? districtStyle.color;
            const fillOpacity = clamp(resolved?.fillOpacity ?? districtStyle.fillOpacity, 0, 1);
            const strokeOpacity = clamp(resolved?.strokeOpacity ?? districtStyle.opacity, 0, 1);
            const strokeWidth = clamp(resolved?.strokeWidth ?? districtStyle.strokeWidth, 0.2, 3);
            return (
              <path
                key={`district-${index}`}
                d={path}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={strokeColor}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

        {roadsPath && (
          <path
            d={roadsPath}
            fill="none"
            stroke={roadsStyle.color}
            strokeOpacity={roadsStyle.opacity}
            strokeWidth={roadsStyle.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {point && (
          <>
            <circle cx={point.x} cy={point.y} r={pinStyle.glowRadius} fill="url(#point-glow)" opacity={pinStyle.opacity} />
            <line
              x1={point.x}
              y1={point.y + pinStemStart}
              x2={point.x}
              y2={point.y + pinStemEnd}
              stroke={pinStyle.color}
              strokeOpacity={0.55 * pinStyle.opacity}
              strokeWidth={pinStyle.strokeWidth}
              strokeLinecap="round"
            />
            <circle cx={point.x} cy={point.y} r={pinStyle.dotRadius} fill={pinStyle.color} fillOpacity={pinStyle.opacity} />
            <circle
              cx={point.x}
              cy={point.y}
              r={pinRingRadius}
              fill="none"
              stroke={pinStyle.color}
              strokeOpacity={0.35 * pinStyle.opacity}
              strokeWidth={pinStyle.strokeWidth * 0.6}
            />
          </>
        )}

        <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} fill="url(#map-vignette)" />
      </svg>

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 border border-[#b89b64]/30 shadow-[0_0_18px_rgba(200,170,120,0.2)] rounded-[10px]" />
      </div>

      {label && (
        <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-black/70 text-[11px] tracking-[0.14em] text-[#d2c2a2] uppercase">
          {label}
        </div>
      )}

      {disclosure && locationVisibility === 'area-only' && (
        <div className="absolute top-3 left-3 right-3 text-[11px] text-[#a9987a] bg-black/50 rounded-md px-2 py-1">
          {disclosure}
        </div>
      )}
    </div>
  );
};

export default MiniMap;
