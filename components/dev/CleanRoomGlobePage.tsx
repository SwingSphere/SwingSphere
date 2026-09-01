import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Billboard, Html, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

type DiscoveryKind = 'club' | 'event' | 'host' | 'resort';

type DiscoveryPoint = {
  id: string;
  name: string;
  kind: DiscoveryKind;
  city: string;
  country: string;
  lat: number;
  lng: number;
};

type GeoGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

type GeoFeatureCollection = {
  features: Array<{ geometry?: GeoGeometry | null }>;
};

const EARTH_RADIUS = 1;
const LAND_RADIUS = 1.026;
const MARKER_RADIUS = 1.055;
const MIN_DISTANCE = 1.055;
const MAX_DISTANCE = 4.8;

const DEMO_POINTS: DiscoveryPoint[] = [
  { id: 'sf-1', name: 'Twist SF', kind: 'club', city: 'San Francisco', country: 'United States', lat: 37.7744, lng: -122.4193 },
  { id: 'sf-2', name: 'East Bay Social', kind: 'event', city: 'Oakland', country: 'United States', lat: 37.8044, lng: -122.2712 },
  { id: 'sf-3', name: 'South Bay Host', kind: 'host', city: 'Sunnyvale', country: 'United States', lat: 37.3688, lng: -122.0363 },
  { id: 'ny-1', name: 'Manhattan Social', kind: 'club', city: 'New York', country: 'United States', lat: 40.758, lng: -73.9855 },
  { id: 'ny-2', name: 'Brooklyn Night', kind: 'event', city: 'New York', country: 'United States', lat: 40.6782, lng: -73.9442 },
  { id: 'lon-1', name: 'London Community', kind: 'host', city: 'London', country: 'United Kingdom', lat: 51.5072, lng: -0.1276 },
  { id: 'ber-1', name: 'Berlin Club', kind: 'club', city: 'Berlin', country: 'Germany', lat: 52.52, lng: 13.405 },
  { id: 'par-1', name: 'Paris Social', kind: 'event', city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { id: 'ams-1', name: 'Amsterdam Host', kind: 'host', city: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { id: 'syd-1', name: 'Sydney Club', kind: 'club', city: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093 },
  { id: 'tok-1', name: 'Tokyo Night', kind: 'event', city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { id: 'rio-1', name: 'Rio Community', kind: 'host', city: 'Rio de Janeiro', country: 'Brazil', lat: -22.9068, lng: -43.1729 },
];

const KIND_COLORS: Record<DiscoveryKind, string> = {
  club: '#ff3b45',
  event: '#ff9d45',
  host: '#b9a7ff',
  resort: '#55d6be',
};

const latLngToVector = (lat: number, lng: number, radius = MARKER_RADIUS) => {
  const latitude = THREE.MathUtils.degToRad(lat);
  const longitude = THREE.MathUtils.degToRad(lng);
  return new THREE.Vector3(
    radius * Math.cos(latitude) * Math.sin(longitude),
    radius * Math.sin(latitude),
    radius * Math.cos(latitude) * Math.cos(longitude),
  );
};

const COAST_CONTROL_SPACING_DEGREES = 0.78;
const MAX_LAND_EDGE = 0.135;
const COAST_BASE_RADIUS = 1.008;

const simplifyCoastRing = (ring: number[][]) => {
  const source = ring.slice(0, -1);
  if (source.length <= 6) return source;
  const simplified: number[][] = [source[0]];
  let previous = source[0];
  for (let index = 1; index < source.length - 1; index += 1) {
    const point = source[index];
    const latitudeScale = Math.max(0.25, Math.cos(THREE.MathUtils.degToRad(point[1])));
    if (Math.hypot((point[0] - previous[0]) * latitudeScale, point[1] - previous[1]) >= COAST_CONTROL_SPACING_DEGREES) {
      simplified.push(point);
      previous = point;
    }
  }
  simplified.push(source[source.length - 1]);
  return simplified.length >= 3 ? simplified : source;
};

const terrainRadius = (direction: THREE.Vector3) => {
  // Paper Plane terrain uses broad planes rather than noisy spikes. These overlapping
  // low-frequency fields keep neighboring facets related while preserving hard faces.
  const continentalRise = Math.sin(direction.x * 4.1 + direction.z * 1.7) * 0.44;
  const ridge = Math.sin(direction.y * 6.2 - direction.x * 2.3) * 0.34;
  const valley = Math.cos((direction.x + direction.y - direction.z) * 3.6) * 0.22;
  return LAND_RADIUS + (continentalRise + ridge + valley) * 0.0105;
};

const buildLandGeometry = (collection: GeoFeatureCollection) => {
  const positions: number[] = [];
  const walls: number[] = [];

  const pushElevatedTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const vertex of [a, b, c]) {
      const elevated = vertex.clone().normalize().multiplyScalar(terrainRadius(vertex.clone().normalize()));
      positions.push(elevated.x, elevated.y, elevated.z);
    }
  };

  const subdivideTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth = 0) => {
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= MAX_LAND_EDGE || depth >= 7) {
      pushElevatedTriangle(a, b, c);
      return;
    }

    if (longest === ab) {
      const midpoint = a.clone().add(b).normalize();
      subdivideTriangle(a, midpoint, c, depth + 1);
      subdivideTriangle(midpoint, b, c, depth + 1);
    } else if (longest === bc) {
      const midpoint = b.clone().add(c).normalize();
      subdivideTriangle(a, b, midpoint, depth + 1);
      subdivideTriangle(a, midpoint, c, depth + 1);
    } else {
      const midpoint = c.clone().add(a).normalize();
      subdivideTriangle(a, b, midpoint, depth + 1);
      subdivideTriangle(midpoint, b, c, depth + 1);
    }
  };

  const pushCoastWall = (ring: number[][]) => {
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      const currentDirection = latLngToVector(current[1], current[0], 1).normalize();
      const nextDirection = latLngToVector(next[1], next[0], 1).normalize();
      const currentTop = currentDirection.clone().multiplyScalar(terrainRadius(currentDirection));
      const nextTop = nextDirection.clone().multiplyScalar(terrainRadius(nextDirection));
      const currentBase = currentDirection.clone().multiplyScalar(COAST_BASE_RADIUS);
      const nextBase = nextDirection.clone().multiplyScalar(COAST_BASE_RADIUS);
      for (const vertex of [currentTop, nextTop, nextBase, currentTop, nextBase, currentBase]) {
        walls.push(vertex.x, vertex.y, vertex.z);
      }
    }
  };

  const pushPolygon = (polygon: number[][][]) => {
    const outer = polygon[0];
    if (!outer || outer.length < 4) return;
    const coast = simplifyCoastRing(outer);
    const contour = coast.map(([lng, lat]) => new THREE.Vector2(lng, lat));
    let triangles: number[][];
    try {
      // Paper Plane's world reads as continuous land at globe scale, so inland water
      // rings are filled rather than cut into the terrain shell.
      triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      return;
    }

    const directions = contour.map((point) => latLngToVector(point.y, point.x, 1).normalize());
    for (const [a, b, c] of triangles) {
      subdivideTriangle(directions[a], directions[b], directions[c]);
    }
    pushCoastWall(coast);
  };

  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') pushPolygon(geometry.coordinates as number[][][]);
    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates as number[][][][]) pushPolygon(polygon);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const combined = positions.concat(walls);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(combined, 3));
  geometry.computeVertexNormals();
  geometry.userData.surfaceFacetCount = positions.length / 9;
  geometry.userData.wallFacetCount = walls.length / 9;
  console.info(
    `[clean-room globe] Paper Plane terrain: ${geometry.userData.surfaceFacetCount} surface + ${geometry.userData.wallFacetCount} coast-wall facets`,
  );
  return geometry;
};

const LowPolyEarth: React.FC<{ detail: number }> = ({ detail }) => {
  const [land, setLand] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/geo/_land/ne_land_simplified.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`Country data failed: ${response.status}`);
        return response.json();
      })
      .then((data: GeoFeatureCollection) => {
        const next = buildLandGeometry(data);
        if (active) setLand(next);
        else next.dispose();
      })
      .catch((error) => console.warn('[clean-room globe] land data unavailable', error));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => land?.dispose(), [land]);

  return (
    <group>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[EARTH_RADIUS, 4]} />
        <meshStandardMaterial
          color="#090c0f"
          roughness={0.88}
          metalness={0.12}
          flatShading
        />
      </mesh>
      {land && (
        <mesh geometry={land} renderOrder={2}>
          <meshStandardMaterial
            color="#4a535b"
            roughness={0.86}
            metalness={0.06}
            flatShading
            transparent
            opacity={THREE.MathUtils.lerp(0.88, 0.55, detail)}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}
      <mesh scale={1.025} renderOrder={1}>
        <icosahedronGeometry args={[EARTH_RADIUS, 4]} />
        <meshBasicMaterial color="#ff4a55" transparent opacity={0.025} side={THREE.BackSide} />
      </mesh>
    </group>
  );
};

const Marker: React.FC<{
  point: DiscoveryPoint;
  cameraDistance: number;
  selected: boolean;
  onSelect: (point: DiscoveryPoint) => void;
}> = ({ point, cameraDistance, selected, onSelect }) => {
  const position = useMemo(() => latLngToVector(point.lat, point.lng, MARKER_RADIUS), [point]);
  // Keep markers visually quiet and approximately constant in screen space. The
  // world-space radius contracts with camera altitude instead of swelling on zoom.
  const altitude = Math.max(0.035, cameraDistance - EARTH_RADIUS);
  const scale = THREE.MathUtils.clamp(altitude * 0.009, 0.00135, 0.015);
  const showLabel = selected || cameraDistance < 1.45;

  return (
    <group position={position}>
      <Billboard>
        <mesh
          scale={selected ? scale * 1.65 : scale}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(point);
          }}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
          renderOrder={8}
        >
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color={selected ? '#ffffff' : KIND_COLORS[point.kind]} transparent opacity={0.98} depthTest={false} />
        </mesh>
        {selected && (
          <mesh scale={scale * 2.55} renderOrder={7}>
            <ringGeometry args={[0.72, 1, 36]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.38} depthTest={false} />
          </mesh>
        )}
        {showLabel && (
          <Html
            center
            position={[0, scale * 2.8, 0]}
            distanceFactor={0.72}
            style={{ pointerEvents: 'none' }}
          >
            <div className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow-2xl backdrop-blur-md ${selected ? 'border-white/30 bg-white/95 text-black' : 'border-white/15 bg-black/75 text-white'}`}>
              {point.name}
            </div>
          </Html>
        )}
      </Billboard>
    </group>
  );
};

const CameraRig: React.FC<{
  focus: DiscoveryPoint | null;
  onDistance: (distance: number) => void;
}> = ({ focus, onDistance }) => {
  const controls = useRef<any>(null);
  const { camera, gl } = useThree();
  const goal = useRef<{ direction: THREE.Vector3; distance: number } | null>(null);

  useEffect(() => {
    if (!focus) return;
    goal.current = {
      direction: latLngToVector(focus.lat, focus.lng, 1).normalize(),
      distance: 1.22,
    };
  }, [focus]);

  useFrame((_, delta) => {
    if (goal.current) {
      const target = goal.current.direction.clone().multiplyScalar(goal.current.distance);
      camera.position.lerp(target, 1 - Math.exp(-delta * 4.8));
      camera.lookAt(0, 0, 0);
      controls.current?.update();
      if (camera.position.distanceTo(target) < 0.002) goal.current = null;
    }
    onDistance(camera.position.length());
  });

  return (
    <OrbitControls
      ref={controls}
      args={[camera, gl.domElement]}
      enablePan={false}
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.38}
      zoomSpeed={0.65}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI - 0.08}
    />
  );
};

const GlobeScene: React.FC<{
  selected: DiscoveryPoint | null;
  onSelect: (point: DiscoveryPoint) => void;
  onDistance: (distance: number) => void;
  distance: number;
}> = ({ selected, onSelect, onDistance, distance }) => {
  const detail = THREE.MathUtils.smoothstep(distance, 2.2, 1.08);
  return (
    <>
      <color attach="background" args={['#030405']} />
      <fog attach="fog" args={['#030405', 3.8, 8]} />
      <ambientLight intensity={0.42} color="#cbd2d4" />
      <directionalLight position={[3, 2, 4]} intensity={2.6} color="#ffffff" />
      <directionalLight position={[-3, -1, -2]} intensity={0.7} color="#9b1c2a" />
      <Stars radius={20} depth={14} count={detail > 0.5 ? 250 : 700} factor={1.5} saturation={0} fade speed={0.12} />
      <LowPolyEarth detail={detail} />
      {DEMO_POINTS.map((point) => (
        <Marker
          key={point.id}
          point={point}
          cameraDistance={distance}
          selected={selected?.id === point.id}
          onSelect={onSelect}
        />
      ))}
      <CameraRig focus={selected} onDistance={onDistance} />
    </>
  );
};

const CleanRoomGlobePage: React.FC = () => {
  const [selected, setSelected] = useState<DiscoveryPoint | null>(null);
  const [distance, setDistance] = useState(3.45);
  const lastPublish = useRef(0);

  const publishDistance = useCallback((next: number) => {
    const now = performance.now();
    if (now - lastPublish.current > 90) {
      lastPublish.current = now;
      setDistance(next);
    }
  }, []);

  const mode = distance < 1.42 ? 'CITY' : distance < 2.35 ? 'REGION' : 'WORLD';

  return (
    <main className="relative h-[calc(100vh-4rem)] min-h-[620px] overflow-hidden bg-[#030405] text-white">
      <Canvas
        camera={{ position: [0, 0.35, 3.45], fov: 42, near: 0.006, far: 40 }}
        dpr={[1, 1.65]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      >
        <Suspense fallback={null}>
          <GlobeScene
            selected={selected}
            onSelect={setSelected}
            onDistance={publishDistance}
            distance={distance}
          />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_34%,rgba(0,0,0,.52)_100%)]" />

      <header className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-5 md:p-8">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[9px] font-bold tracking-[0.24em] text-white/55 backdrop-blur-xl">
            CLEAN-ROOM PROTOTYPE <span className="h-1 w-1 rounded-full bg-red-400" /> {mode}
          </div>
          <h1 className="max-w-md text-2xl font-medium tracking-[-0.04em] md:text-4xl">
            One world. Every destination.
          </h1>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/48 md:text-sm">
            Drag to explore. Scroll continuously from the planet to city-level discovery.
          </p>
        </div>
        <div className="hidden rounded-2xl border border-white/10 bg-black/35 p-3 text-right backdrop-blur-xl md:block">
          <div className="text-[8px] font-bold tracking-[0.2em] text-white/35">CAMERA ALTITUDE</div>
          <div className="mt-1 font-mono text-sm text-white/75">{Math.max(0, (distance - 1) * 6371).toFixed(0)} km</div>
        </div>
      </header>

      <section className="pointer-events-none absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 md:bottom-8 md:left-8 md:right-8">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-black/55 p-4 shadow-2xl backdrop-blur-xl">
          {selected ? (
            <>
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/42">
                <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLORS[selected.kind] }} />
                {selected.kind} · {selected.city}
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight">{selected.name}</div>
              <div className="mt-1 text-xs text-white/45">{selected.city}, {selected.country}</div>
              <button
                type="button"
                className="mt-4 rounded-full bg-white px-4 py-2 text-[10px] font-bold text-black transition hover:bg-red-400"
              >
                View destination
              </button>
            </>
          ) : (
            <>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/38">Discovery signals</div>
              <div className="mt-2 text-sm text-white/72">Select any marker to travel directly to its city.</div>
              <div className="mt-3 flex flex-wrap gap-3">
                {(Object.keys(KIND_COLORS) as DiscoveryKind[]).slice(0, 3).map((kind) => (
                  <span key={kind} className="flex items-center gap-1.5 text-[10px] capitalize text-white/45">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLORS[kind] }} /> {kind}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="hidden text-right text-[9px] uppercase tracking-[0.18em] text-white/28 md:block">
          No model assets<br />Single coordinate system
        </div>
      </section>
    </main>
  );
};

export default CleanRoomGlobePage;
