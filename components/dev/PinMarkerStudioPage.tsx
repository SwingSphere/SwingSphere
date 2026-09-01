import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DiscoveryMarker } from '../../src/features/globe/runtime/DiscoveryMarker.js';
import {
  createMarkerStyle,
  GlobeMarker,
} from '../../src/features/globe/runtime/GlobeMarker.js';
import { DEFAULT_GLOBE_RUNTIME_CONFIG } from '../../src/features/globe/runtime/GlobeRuntimeConfig.js';
import {
  HYBRID_MARKER_COLORS,
  type HybridMarkerShape,
} from './hybridMarkerSprites';

type ScaleMode = 'adaptive' | 'screen' | 'world';
type MarkerVariant = 'standard' | 'club' | 'promoter';
type StudioMarkerShape = HybridMarkerShape | 'beacon' | 'ship' | 'palm';
type StudioMarkerDefinition = {
  id: string;
  name: string;
  family: string;
  description: string;
  variant?: MarkerVariant;
  flat?: boolean;
  discovery?: boolean;
  spriteShape?: StudioMarkerShape;
  spriteColor?: string;
  position: [number, number, number];
};

type RuntimeMarker = {
  group: THREE.Group;
  hitTarget: THREE.Object3D;
  update: (state: Record<string, unknown>) => void;
  dispose: () => void;
};

const STUDIO_RADIUS = 5;
const SCREEN_LOCK_REFERENCE_DISTANCE = 11.5;
const MARKER_NEAR_DISTANCE = 4;
const MARKER_FAR_DISTANCE = 20;
const MARKER_NEAR_PIXELS = 22;
const MARKER_FAR_PIXELS = 12;
const MARKER_FIXED_PIXELS = 20;

const getAdaptiveMarkerPixels = (cameraDistance: number) => {
  const normalizedDistance = THREE.MathUtils.clamp(
    (cameraDistance - MARKER_NEAR_DISTANCE) / (MARKER_FAR_DISTANCE - MARKER_NEAR_DISTANCE),
    0,
    1,
  );
  const easedDistance = normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
  return THREE.MathUtils.lerp(MARKER_NEAR_PIXELS, MARKER_FAR_PIXELS, easedDistance);
};

const MARKERS: StudioMarkerDefinition[] = [
  {
    id: 'orb-pin',
    name: 'Orb Pin',
    family: '3D signal pin',
    description: 'Current event/listing pin with an icosahedron orb.',
    variant: 'standard',
    position: [-3.5, 0, -2.25],
  },
  {
    id: 'diamond-pin',
    name: 'Diamond Pin',
    family: '3D signal pin',
    description: 'Current club marker with the stretched diamond tip.',
    variant: 'club',
    position: [0, 0, -2.25],
  },
  {
    id: 'square-pin',
    name: 'Square Pin',
    family: '3D signal pin',
    description: 'Current host/promoter marker with the rotated cube tip.',
    variant: 'promoter',
    position: [3.5, 0, -2.25],
  },
  {
    id: 'discovery-beacon',
    name: 'Discovery Beacon',
    family: 'Regional marker',
    description: 'Pulsing hex beacon used before individual listings are disclosed.',
    spriteShape: 'beacon',
    spriteColor: '#F8FAFC',
    position: [-6.25, 0, 2.25],
  },
  {
    id: 'hybrid-event-circle',
    name: 'Event Circle',
    family: 'Vector marker',
    description: 'Gold vector circle for event listings.',
    spriteShape: 'circle',
    spriteColor: HYBRID_MARKER_COLORS.event,
    position: [-3.75, 0, 2.25],
  },
  {
    id: 'hybrid-club-diamond',
    name: 'Club Diamond',
    family: 'Vector marker',
    description: 'Red vector diamond for club listings.',
    spriteShape: 'diamond',
    spriteColor: HYBRID_MARKER_COLORS.club,
    position: [-1.25, 0, 2.25],
  },
  {
    id: 'hybrid-promoter-square',
    name: 'Promoter Square',
    family: 'Vector marker',
    description: 'Cyan vector square for promoter listings.',
    spriteShape: 'square',
    spriteColor: HYBRID_MARKER_COLORS.promoter,
    position: [1.25, 0, 2.25],
  },
  {
    id: 'cruise-ship-marker',
    name: 'Cruise Ship',
    family: 'Travel marker',
    description: 'Purple ship silhouette proposed for cruise listings and ports.',
    spriteShape: 'ship',
    spriteColor: '#A855F7',
    position: [3.75, 0, 2.25],
  },
  {
    id: 'resort-palm-marker',
    name: 'Resort Palm',
    family: 'Travel marker',
    description: 'Palm-tree silhouette proposed for resorts and destination properties.',
    spriteShape: 'palm',
    spriteColor: '#34D399',
    position: [6.25, 0, 2.25],
  },
];

const cloneRuntimeConfig = (flat: boolean) => {
  const config = JSON.parse(JSON.stringify(DEFAULT_GLOBE_RUNTIME_CONFIG));
  config.pinPlacement = {
    ...config.pinPlacement,
    showEventLabels: false,
    flatIdleMarkerExperiment: {
      enabled: flat,
      sizeScale: 3.6,
    },
  };
  config.presentation = {
    ...config.presentation,
    pins: {
      ...config.presentation.pins,
      baseScale: 1,
      clusterScale: 1,
    },
  };
  return config;
};

const markerPalette = (variant: MarkerVariant) => {
  if (variant === 'club') {
    return {
      stemEmissive: '#C51D34',
      stemSelectedColor: '#FF5A6B',
      tipColor: '#F2F4F7',
      tipHoverColor: '#FF3B50',
      tipSelectedColor: '#FF5A6B',
      glowColor: '#C51D34',
    };
  }
  if (variant === 'promoter') {
    return {
      stemEmissive: '#4AC6D7',
      stemSelectedColor: '#79E5F1',
      tipColor: '#BCECF2',
      tipHoverColor: '#4AC6D7',
      tipSelectedColor: '#79E5F1',
      glowColor: '#4AC6D7',
    };
  }
  return {
    stemEmissive: '#D9A441',
    stemSelectedColor: '#FFD36A',
    tipColor: '#F5E6B8',
    tipHoverColor: '#E5B54C',
    tipSelectedColor: '#FFD36A',
    glowColor: '#D9A441',
  };
};

const createStudioMarker = (definition: StudioMarkerDefinition): RuntimeMarker => {
  const config = cloneRuntimeConfig(Boolean(definition.flat));

  if (definition.discovery) {
    const marker = new DiscoveryMarker({
      region: {
        id: definition.id,
        name: 'Bay Area',
        listingIds: ['one', 'two', 'three'],
      },
      position: new THREE.Vector3(),
      radialDirection: new THREE.Vector3(0, 1, 0),
      config,
      referenceDistance: SCREEN_LOCK_REFERENCE_DISTANCE,
      globeRadius: STUDIO_RADIUS,
    });
    (marker.marker.style as Record<string, unknown>).showLabel = false;
    return marker as RuntimeMarker;
  }

  const variant = definition.variant ?? 'standard';
  const marker = new GlobeMarker({
    id: definition.id,
    labelTitle: definition.name,
    labelSubtitle: definition.family,
    position: new THREE.Vector3(),
    radialDirection: new THREE.Vector3(0, 1, 0),
    markerType: 'listing',
    variant,
    config,
    referenceDistance: SCREEN_LOCK_REFERENCE_DISTANCE,
    styleOverrides: createMarkerStyle(
      config,
      {
        ...markerPalette(variant),
        showLabel: false,
      },
      STUDIO_RADIUS,
    ),
  });
  return marker as RuntimeMarker;
};

const MarkerSample: React.FC<{
  definition: StudioMarkerDefinition;
  scaleMode: ScaleMode;
  selected: boolean;
  onSelect: (id: string) => void;
}> = ({ definition, scaleMode, selected, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  const outerRef = useRef<THREE.Group>(null);
  const marker = useMemo(() => createStudioMarker(definition), [definition]);
  const { camera, gl } = useThree();
  const worldPosition = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    marker.hitTarget.userData.studioMarkerId = definition.id;
    return () => marker.dispose();
  }, [definition.id, marker]);

  useEffect(() => {
    gl.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [gl, hovered]);

  useFrame((_, delta) => {
    const outer = outerRef.current;
    if (!outer) return;

    outer.getWorldPosition(worldPosition);
    const cameraDistance = camera.position.distanceTo(worldPosition);
    const screenCompensation = THREE.MathUtils.clamp(
      cameraDistance / SCREEN_LOCK_REFERENCE_DISTANCE,
      0.34,
      2.4,
    );
    const markerScale = scaleMode === 'screen'
      ? screenCompensation
      : scaleMode === 'adaptive'
        ? screenCompensation * (getAdaptiveMarkerPixels(cameraDistance) / MARKER_FIXED_PIXELS)
        : 1;
    outer.scale.setScalar(markerScale);

    marker.update({
      hovered,
      selected,
      attention: definition.discovery && !hovered && !selected,
      delta,
      cameraDistance,
      camera,
      domElement: gl.domElement,
      presentationOpacity: 1,
    });
  });

  const stop = (event: ThreeEvent<PointerEvent>) => event.stopPropagation();

  return (
    <group ref={outerRef} position={definition.position}>
      <primitive
        object={marker.group}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          stop(event);
          setHovered(true);
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          stop(event);
          setHovered(false);
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(definition.id);
        }}
      />
      <Html
        position={[0, 1.45, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className={`whitespace-nowrap rounded-md border px-2.5 py-1.5 text-center text-[10px] font-semibold tracking-wide shadow-lg backdrop-blur-md transition-colors ${
          selected
            ? 'border-red-500/80 bg-red-950/90 text-white'
            : hovered
              ? 'border-white/25 bg-gray-900/95 text-white'
              : 'border-white/10 bg-black/75 text-gray-400'
        }`}>
          {definition.name}
        </div>
      </Html>
    </group>
  );
};

const HybridVectorSample: React.FC<{
  definition: StudioMarkerDefinition;
  scaleMode: ScaleMode;
  selected: boolean;
  onSelect: (id: string) => void;
}> = ({ definition, scaleMode, selected, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  const vectorRef = useRef<THREE.Group>(null);
  const beaconPulseRef = useRef<THREE.Mesh>(null);
  const { camera, gl, size } = useThree();
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const geometry = useMemo<THREE.BufferGeometry>(() => {
    if (definition.spriteShape === 'circle') {
      return new THREE.CircleGeometry(0.5, 64);
    }
    if (definition.spriteShape === 'beacon') {
      return new THREE.CircleGeometry(0.5, 6, Math.PI / 6);
    }
    if (definition.spriteShape === 'diamond') {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.53);
      shape.lineTo(0.5, 0);
      shape.lineTo(0, -0.53);
      shape.lineTo(-0.5, 0);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    if (definition.spriteShape === 'ship') {
      const shape = new THREE.Shape();
      shape.moveTo(-0.58, -0.08);
      shape.lineTo(-0.36, -0.08);
      shape.lineTo(-0.27, 0.16);
      shape.lineTo(-0.1, 0.16);
      shape.lineTo(-0.1, 0.36);
      shape.lineTo(0.2, 0.36);
      shape.lineTo(0.2, 0.16);
      shape.lineTo(0.39, 0.16);
      shape.lineTo(0.43, -0.08);
      shape.lineTo(0.58, -0.08);
      shape.lineTo(0.37, -0.42);
      shape.lineTo(-0.37, -0.42);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    if (definition.spriteShape === 'palm') {
      const shape = new THREE.Shape();
      shape.moveTo(-0.09, -0.53);
      shape.lineTo(0.11, -0.53);
      shape.lineTo(0.08, -0.06);
      shape.lineTo(0.22, 0.12);
      shape.lineTo(0.54, 0.13);
      shape.lineTo(0.29, 0.25);
      shape.lineTo(0.5, 0.43);
      shape.lineTo(0.18, 0.35);
      shape.lineTo(0.04, 0.56);
      shape.lineTo(-0.04, 0.31);
      shape.lineTo(-0.3, 0.5);
      shape.lineTo(-0.2, 0.21);
      shape.lineTo(-0.55, 0.28);
      shape.lineTo(-0.29, 0.05);
      shape.lineTo(-0.1, 0.03);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    return new THREE.PlaneGeometry(1, 1);
  }, [definition.spriteShape]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    gl.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [gl, hovered]);

  useFrame(({ clock }) => {
    const vector = vectorRef.current;
    if (!vector) return;

    vector.getWorldPosition(worldPosition);
    const cameraDistance = camera.position.distanceTo(worldPosition);
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const verticalFov = THREE.MathUtils.degToRad(perspectiveCamera.fov);
    const worldUnitsPerPixel = (2 * Math.tan(verticalFov / 2) * cameraDistance) / size.height;
    const referenceWorldUnitsPerPixel = (
      2 * Math.tan(verticalFov / 2) * SCREEN_LOCK_REFERENCE_DISTANCE
    ) / size.height;
    const baseScale = scaleMode === 'screen'
      ? worldUnitsPerPixel * MARKER_FIXED_PIXELS
      : scaleMode === 'adaptive'
        ? worldUnitsPerPixel * getAdaptiveMarkerPixels(cameraDistance)
        : referenceWorldUnitsPerPixel * MARKER_FIXED_PIXELS;
    const interactionScale = selected ? 1.25 : hovered ? 1.125 : 1;

    vector.quaternion.copy(camera.quaternion);
    vector.scale.setScalar(baseScale * interactionScale);

    const pulse = beaconPulseRef.current;
    if (pulse) {
      const phase = (clock.elapsedTime * 0.58) % 1;
      pulse.scale.setScalar(1.1 + phase * 1.2);
      (pulse.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * (
        selected ? 0.34 : hovered ? 0.26 : 0.18
      );
    }
  });

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
  };
  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(false);
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(definition.id);
  };

  const isBeacon = definition.spriteShape === 'beacon';

  return (
    <group position={[definition.position[0], 0.18, definition.position[2]]}>
      <group
        ref={vectorRef}
        scale={[0.2, 0.2, 0.2]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <mesh geometry={geometry} position={[0, 0, -0.03]} scale={1.5}>
          <meshBasicMaterial
            color={definition.spriteColor}
            transparent
            opacity={selected ? 0.3 : hovered ? 0.22 : 0.13}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={geometry} position={[0, 0, -0.015]} scale={1.14}>
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.9}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={isBeacon ? '#252A33' : definition.spriteColor}
            transparent
            opacity={isBeacon ? 0.96 : selected ? 1 : hovered ? 0.98 : 0.92}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {isBeacon && (
          <>
            <mesh geometry={geometry} position={[0, 0, 0.01]} scale={0.64}>
              <meshBasicMaterial color="#FFFFFF" depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh ref={beaconPulseRef} position={[0, 0, -0.025]}>
              <ringGeometry args={[0.5, 0.545, 6, 1, Math.PI / 6]} />
              <meshBasicMaterial
                color="#FFFFFF"
                transparent
                opacity={0.18}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </>
        )}
      </group>
      <Html position={[0, 0.48, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`whitespace-nowrap rounded-md border px-2.5 py-1.5 text-center text-[10px] font-semibold tracking-wide shadow-lg backdrop-blur-md transition-colors ${
          selected
            ? 'border-red-500/80 bg-red-950/90 text-white'
            : hovered
              ? 'border-white/25 bg-gray-900/95 text-white'
              : 'border-white/10 bg-black/75 text-gray-400'
        }`}>
          {definition.name}
        </div>
      </Html>
    </group>
  );
};

const CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const CAMERA_DIRECTION = new THREE.Vector3();

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 18, 4);

const CameraDistanceController: React.FC<{ distance: number; resetToken: number }> = ({ distance, resetToken }) => {
  const { camera } = useThree();

  useEffect(() => {
    CAMERA_DIRECTION.copy(DEFAULT_CAMERA_POSITION).normalize();
    camera.position.copy(CAMERA_TARGET).addScaledVector(CAMERA_DIRECTION, distance);
    camera.lookAt(CAMERA_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }, [camera, distance, resetToken]);

  return null;
};

const CameraDistanceReporter: React.FC<{ onChange: (distance: number) => void }> = ({ onChange }) => {
  const { camera } = useThree();
  const lastDistance = useRef(0);
  const lastUpdate = useRef(0);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    if (elapsed - lastUpdate.current < 0.15) return;
    lastUpdate.current = elapsed;
    const distance = camera.position.distanceTo(CAMERA_TARGET);
    if (Math.abs(distance - lastDistance.current) < 0.03) return;
    lastDistance.current = distance;
    onChange(distance);
  });

  return null;
};

const StudioScene: React.FC<{
  scaleMode: ScaleMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  requestedDistance: number;
  resetToken: number;
  onDistanceChange: (distance: number) => void;
}> = ({ scaleMode, selectedId, onSelect, requestedDistance, resetToken, onDistanceChange }) => (
  <>
    <color attach="background" args={['#090A0D']} />
    <fog attach="fog" args={['#090A0D', 70, 110]} />
    <ambientLight intensity={0.55} />
    <directionalLight position={[4, 9, 5]} intensity={1.3} color="#f5f5f5" />
    <directionalLight position={[-6, 4, -4]} intensity={0.55} color="#c51d34" />

    <mesh position={[0, -0.025, 0]} receiveShadow>
      <boxGeometry args={[48, 0.08, 48]} />
      <meshStandardMaterial color="#12151c" roughness={0.88} metalness={0.12} />
    </mesh>
    <Grid
      position={[0, 0.02, 0]}
      args={[48, 48]}
      cellSize={0.4}
      cellThickness={0.55}
      cellColor="#343740"
      sectionSize={2}
      sectionThickness={1}
      sectionColor="#5A2630"
      fadeDistance={90}
      fadeStrength={1}
      infiniteGrid
    />

    {MARKERS.map((definition) => (
      definition.spriteShape ? (
        <HybridVectorSample
          key={definition.id}
          definition={definition}
          scaleMode={scaleMode}
          selected={selectedId === definition.id}
          onSelect={onSelect}
        />
      ) : (
        <MarkerSample
          key={definition.id}
          definition={definition}
          scaleMode={scaleMode}
          selected={selectedId === definition.id}
          onSelect={onSelect}
        />
      )
    ))}

    <OrbitControls
      makeDefault
      target={[CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z]}
      minDistance={4}
      maxDistance={20}
      minPolarAngle={0.08}
      maxPolarAngle={1.1}
      enableRotate
      enablePan
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      screenSpacePanning
      enableDamping
      dampingFactor={0.07}
      zoomSpeed={0.7}
      rotateSpeed={0.55}
      panSpeed={0.75}
    />
    <CameraDistanceController distance={requestedDistance} resetToken={resetToken} />
    <CameraDistanceReporter onChange={onDistanceChange} />
  </>
);

const PinMarkerStudioPage: React.FC = () => {
  const [scaleMode, setScaleMode] = useState<ScaleMode>('adaptive');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraDistance, setCameraDistance] = useState(DEFAULT_CAMERA_POSITION.length());
  const [requestedDistance, setRequestedDistance] = useState(DEFAULT_CAMERA_POSITION.length());
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const selectedMarker = MARKERS.find((marker) => marker.id === selectedId) ?? null;

  return (
    <main className="min-h-screen bg-[#07080b] text-gray-100">
      <section className="border-b border-white/10 bg-[#0c0e13]/95 px-4 py-5 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-400">Development tool</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Pin & Marker Studio</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              One clean surface for comparing marker shapes, hover behavior, selection, and zoom scaling.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">Marker size while zooming</span>
            <button
              type="button"
              onClick={() => setScaleMode('adaptive')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scaleMode === 'adaptive'
                  ? 'bg-red-600 text-white shadow-[0_0_18px_rgba(197,29,52,0.28)]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Osiris-style
            </button>
            <button
              type="button"
              onClick={() => setScaleMode('screen')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scaleMode === 'screen'
                  ? 'bg-red-600 text-white shadow-[0_0_18px_rgba(197,29,52,0.28)]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Fixed 20 px
            </button>
            <button
              type="button"
              onClick={() => setScaleMode('world')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scaleMode === 'world'
                  ? 'bg-red-600 text-white shadow-[0_0_18px_rgba(197,29,52,0.28)]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Scales with scene
            </button>
            <div className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />
            <label className="flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              View zoom
              <input
                type="range"
                min="4"
                max="20"
                step="0.1"
                value={24 - cameraDistance}
                onChange={(event) => {
                  const distance = 24 - Number(event.target.value);
                  setCameraDistance(distance);
                  setRequestedDistance(distance);
                }}
                className="w-32 accent-red-600"
                aria-label="View zoom"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setCameraDistance(DEFAULT_CAMERA_POSITION.length());
                setRequestedDistance(DEFAULT_CAMERA_POSITION.length());
                setCameraResetToken((token) => token + 1);
              }}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/5 hover:text-white"
            >
              Reset view
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
        <div className="relative h-[620px] overflow-hidden rounded-2xl border border-white/10 bg-[#090a0d] shadow-2xl md:h-[740px]">
          <Canvas
            className="!absolute !inset-0 !h-full !w-full"
            camera={{ position: [0, 18, 4], fov: 45, near: 0.1, far: 140 }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, alpha: false }}
            onPointerMissed={() => setSelectedId(null)}
          >
            <StudioScene
              scaleMode={scaleMode}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((current) => current === id ? null : id)}
              requestedDistance={requestedDistance}
              resetToken={cameraResetToken}
              onDistanceChange={setCameraDistance}
            />
          </Canvas>

          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-xs text-gray-300 backdrop-blur-md">
            {scaleMode === 'adaptive'
              ? 'Osiris-style — markers ease from 12 px far away to 22 px up close'
              : scaleMode === 'screen'
                ? 'Fixed on screen — markers stay at 20 px while zooming'
                : 'Scales with scene — marker size changes directly with camera distance'}
          </div>

          {selectedMarker && (
            <div className="absolute right-4 top-4 w-[min(310px,calc(100%-2rem))] rounded-xl border border-red-500/45 bg-[#111217]/95 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300">Selected</p>
                  <h2 className="mt-1 text-base font-semibold text-white">{selectedMarker.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-400 transition hover:border-white/25 hover:text-white"
                  aria-label="Clear marker selection"
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-sm leading-5 text-gray-400">{selectedMarker.description}</p>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-xs text-gray-400 backdrop-blur-md">
            <span>Scroll to zoom · Left-drag to tilt · Right-drag to pan · Hover to animate · Click to select</span>
            <span className="font-mono text-gray-500">{cameraDistance.toFixed(1)}u</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default PinMarkerStudioPage;
