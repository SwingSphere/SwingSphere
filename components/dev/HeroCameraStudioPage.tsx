import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  Camera,
  Check,
  Clipboard,
  Download,
  Eye,
  Gauge,
  Move3d,
  Pause,
  Play,
  RefreshCcw,
  Rotate3d,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { DEV_TOOLS_ENABLED } from '../../lib/devTools';
import {
  defaultHeroArrivalProfile,
  formatHeroArrivalSnippet,
  HERO_COMPOSER_CUSTOM_PRESET_STORAGE_KEY,
  mergeHeroArrivalProfile,
  persistHeroArrivalProfile,
  readHeroArrivalProfile,
  saveHeroArrivalProfileToProduction,
  type HeroArrivalProfile,
  type HeroComposerSnapshot,
} from '../../lib/heroArrivalProfile';
import {
  cloneHeroStudioPose,
  poseViewOffsetFromScreenFraming,
  screenFramingFromPose,
  type HeroStudioPose,
  type HeroStudioPoseOrigin,
} from '../../lib/heroStudioPose';

type Destination = {
  id: string;
  name: string;
  city: string;
  country: string;
  countryIso2: string;
  countryIso3: string;
  lat: number;
  lon: number;
};

type RuntimeEvent = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  countryIso2: string;
  countryIso3: string;
  listingId: string;
  listing: Record<string, unknown>;
};

export type HeroCaptureState = 'idle' | 'target-selected' | 'endpoint-captured' | 'previewing';

type StudioRuntime = {
  mount: () => Promise<StudioRuntime>;
  updateEvents: (events: RuntimeEvent[]) => void;
  updateActivityRegions: (regions: Array<Record<string, unknown>>) => void;
  setIdleMotionSuppressed: (suppressed: boolean) => void;
  setHeroStudioPoseListener: (listener: ((pose: HeroStudioPose, meta: { source: HeroStudioPoseOrigin }) => void) | null) => void;
  setHeroStudioPlaybackActive: (active: boolean) => void;
  setHeroStudioControlsEnabled: (enabled: boolean) => void;
  prepareHeroStudioDestination: (eventId: string) => RuntimeEvent | null;
  setHeroStudioCaptureState: (state: HeroCaptureState) => void;
  selectHeroStudioDestination: (eventId: string) => RuntimeEvent | null;
  previewHeroArrivalProfile: (profile: HeroArrivalProfile) => HeroComposerSnapshot | null;
  getHeroArrivalComposerSnapshot: () => HeroComposerSnapshot | null;
  getHeroStudioPose: () => HeroStudioPose | null;
  applyHeroStudioPose: (pose: HeroStudioPose, options?: { source?: HeroStudioPoseOrigin; emit?: boolean }) => HeroStudioPose | null;
  previewHeroStudioPoseProgress: (from: HeroStudioPose, to: HeroStudioPose, progress: number, ease: HeroArrivalProfile['ease']) => HeroStudioPose | null;
  rotateHeroStudioGlobe: (yaw: number, pitch: number) => HeroStudioPose | null;
  resetHeroStudioPose: () => HeroStudioPose | null;
  captureFinalHeroStudioPose: () => { pose: HeroStudioPose; profile: HeroArrivalProfile } | null;
  resize: () => void;
  dispose: () => void;
};

type StudioRuntimeConstructor = new (container: HTMLElement, options: Record<string, unknown>) => StudioRuntime;

type PreviewHandle = {
  applyPose: (pose: HeroStudioPose, source: HeroStudioPoseOrigin) => HeroStudioPose | null;
  previewProfile: (profile: HeroArrivalProfile) => HeroStudioPose | null;
  captureFinal: () => { pose: HeroStudioPose; profile: HeroArrivalProfile } | null;
  previewCapturedProgress: (from: HeroStudioPose, to: HeroStudioPose, progress: number, ease: HeroArrivalProfile['ease']) => HeroStudioPose | null;
  setPlaybackActive: (active: boolean) => void;
  setCaptureState: (state: HeroCaptureState) => void;
  reset: (profile: HeroArrivalProfile) => HeroStudioPose | null;
  getPose: () => HeroStudioPose | null;
};

const DESTINATIONS: Destination[] = [
  { id: 'san-francisco', name: 'Velvet Circuit', city: 'San Francisco', country: 'United States', countryIso2: 'US', countryIso3: 'USA', lat: 37.7749, lon: -122.4194 },
  { id: 'london', name: 'Soho Salon', city: 'London', country: 'United Kingdom', countryIso2: 'GB', countryIso3: 'GBR', lat: 51.5074, lon: -0.1278 },
  { id: 'tokyo', name: 'Neon Assembly', city: 'Tokyo', country: 'Japan', countryIso2: 'JP', countryIso3: 'JPN', lat: 35.6762, lon: 139.6503 },
  { id: 'sydney', name: 'Harbour Room', city: 'Sydney', country: 'Australia', countryIso2: 'AU', countryIso3: 'AUS', lat: -33.8688, lon: 151.2093 },
  { id: 'cape-town', name: 'Atlantic House', city: 'Cape Town', country: 'South Africa', countryIso2: 'ZA', countryIso3: 'ZAF', lat: -33.9249, lon: 18.4241 },
  { id: 'ibiza', name: 'Isla Nocturne', city: 'Ibiza', country: 'Spain', countryIso2: 'ES', countryIso3: 'ESP', lat: 38.9067, lon: 1.4206 },
];

const ASPECTS = [
  { id: '16:9', label: 'Desktop 16:9', value: 16 / 9 },
  { id: '21:9', label: 'Wide 21:9', value: 21 / 9 },
  { id: '4:3', label: 'Classic 4:3', value: 4 / 3 },
  { id: '1:1', label: 'Square 1:1', value: 1 },
];

const globeAssetsConfig = {
  assets: {
    landModel: '/assets/globe/models/land.glb',
    oceanModel: '/assets/globe/models/ocean.glb',
    countryIdTexture: '/assets/globe/textures/countryIdTexture.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v3.png',
    countryLookup: '/assets/globe/data/countryLookup.json',
  },
};

const eventIdForDestination = (destination: Destination) => `hero-studio-${destination.id}`;

const makeRuntimeEvent = (destination: Destination): RuntimeEvent => ({
  id: eventIdForDestination(destination),
  name: destination.name,
  lat: destination.lat,
  lon: destination.lon,
  countryIso2: destination.countryIso2,
  countryIso3: destination.countryIso3,
  listingId: eventIdForDestination(destination),
  listing: {
    id: eventIdForDestination(destination),
    type: 'club',
    name: destination.name,
    description_short: 'Hero Camera Studio destination preview.',
    location: `${destination.city}, ${destination.country}`,
    contactEmail: 'studio@swingsphere.local',
    geopoint: {
      latitude: destination.lat,
      longitude: destination.lon,
      address: { city: destination.city, country: destination.country },
    },
    schedule: [],
    generalAmenities: [],
    status: 'approved',
    postedByUserId: 'hero-camera-studio',
  },
});

const makeActivityRegion = (destination: Destination) => ({
  id: `hero-region-${destination.id}`,
  scopeKey: `hero-studio:${destination.id}`,
  name: destination.city,
  latitude: destination.lat,
  longitude: destination.lon,
  countryIso2: destination.countryIso2,
  discoveryPointIds: [eventIdForDestination(destination)],
  listingIds: [eventIdForDestination(destination)],
  clubCount: 1,
  eventCount: 0,
});

const tuple3 = (vector: THREE.Vector3): [number, number, number] => vector.toArray() as [number, number, number];
const tuple4 = (quaternion: THREE.Quaternion): [number, number, number, number] => quaternion.toArray() as [number, number, number, number];

const lookAtQuaternion = (position: [number, number, number], target: [number, number, number]) => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.fromArray(position);
  camera.lookAt(new THREE.Vector3().fromArray(target));
  camera.updateMatrixWorld(true);
  return tuple4(camera.quaternion);
};

const createTestStartPose = (pose: HeroStudioPose): HeroStudioPose => {
  const next = cloneHeroStudioPose(pose);
  const center = new THREE.Vector3().fromArray(pose.globe.position);
  const current = new THREE.Vector3().fromArray(pose.camera.position).sub(center);
  const distance = Math.max(current.length() + 1.4, 8.04);
  const yaw = THREE.MathUtils.degToRad(92 + Math.random() * 46);
  const pitch = THREE.MathUtils.degToRad(-18 + Math.random() * 34);
  const direction = current.lengthSq() > 0.001 ? current.normalize() : new THREE.Vector3(0, 0, 1);
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  direction.applyAxisAngle(right.lengthSq() > 0.001 ? right : new THREE.Vector3(1, 0, 0), pitch).normalize();
  const position = center.clone().addScaledVector(direction, distance);
  next.camera.position = tuple3(position);
  next.camera.target = tuple3(center);
  next.camera.quaternion = lookAtQuaternion(next.camera.position, next.camera.target);
  next.camera.fov = 45;
  next.camera.viewOffset = null;
  const globeQuaternion = new THREE.Quaternion().fromArray(next.globe.quaternion);
  globeQuaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(24 + Math.random() * 32)));
  next.globe.quaternion = tuple4(globeQuaternion.normalize());
  return next;
};

const buildFrustumPoints = (pose: HeroStudioPose, aspect: number) => {
  const camera = new THREE.PerspectiveCamera(pose.camera.fov, aspect, 0.1, 100);
  camera.position.fromArray(pose.camera.position);
  camera.quaternion.fromArray(pose.camera.quaternion);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const point = new THREE.Vector3(x, y, -1).unproject(camera);
    return camera.position.clone().add(point.sub(camera.position).normalize().multiplyScalar(2.2));
  });
  return { position: camera.position.clone(), corners };
};

const CameraMirror: React.FC<{
  pose: HeroStudioPose;
  editable: boolean;
  aspect: number;
  onChange: (pose: HeroStudioPose) => void;
}> = ({ pose, editable, aspect, onChange }) => {
  const rigRef = useRef<THREE.Group>(null);
  const draggingRef = useRef(false);
  const frustum = useMemo(() => buildFrustumPoints(pose, aspect), [pose, aspect]);

  useEffect(() => {
    if (draggingRef.current || !rigRef.current) return;
    rigRef.current.position.fromArray(pose.camera.position);
    rigRef.current.quaternion.fromArray(pose.camera.quaternion);
  }, [pose]);

  const publish = () => {
    if (!rigRef.current) return;
    const next = cloneHeroStudioPose(pose);
    next.camera.position = tuple3(rigRef.current.position);
    next.camera.target = [...pose.camera.target];
    next.camera.quaternion = lookAtQuaternion(next.camera.position, next.camera.target);
    rigRef.current.quaternion.fromArray(next.camera.quaternion);
    onChange(next);
  };

  const model = (
    <group ref={rigRef} position={pose.camera.position} quaternion={pose.camera.quaternion}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 0.38, 4]} />
        <meshStandardMaterial color="#ff5265" emissive="#7f1020" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.38, 0.22, 0.28]} />
        <meshStandardMaterial color="#171a20" metalness={0.75} roughness={0.26} />
      </mesh>
    </group>
  );

  return (
    <>
      {editable ? (
        <TransformControls
          mode="translate"
          space="world"
          size={0.7}
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={() => { draggingRef.current = false; publish(); }}
          onObjectChange={publish}
        >
          {model}
        </TransformControls>
      ) : model}
      {frustum.corners.map((corner, index) => (
        <Line key={index} points={[frustum.position, corner]} color="#e8edf5" opacity={0.38} transparent lineWidth={0.8} />
      ))}
      <Line points={[...frustum.corners, frustum.corners[0]]} color="#e8edf5" opacity={0.3} transparent lineWidth={0.8} />
      <Line points={[new THREE.Vector3().fromArray(pose.camera.position), new THREE.Vector3().fromArray(pose.camera.target)]} color="#ff5265" dashed dashSize={0.16} gapSize={0.1} opacity={0.55} transparent />
    </>
  );
};

const GlobeMirror: React.FC<{
  pose: HeroStudioPose;
  editable: boolean;
  onChange: (pose: HeroStudioPose) => void;
}> = ({ pose, editable, onChange }) => {
  const globeRef = useRef<THREE.Group>(null);
  const draggingRef = useRef(false);
  const localPin = useMemo(() => new THREE.Vector3().fromArray(pose.destinationLocalPosition ?? [0, 0, 2]), [pose.destinationLocalPosition]);
  const radius = Math.max(localPin.length(), 2);
  const normal = localPin.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
  if (right.lengthSq() < 0.001) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const arrows = useMemo(() => [
    new THREE.ArrowHelper(normal, localPin, 0.95, 0xff5265, 0.15, 0.09),
    new THREE.ArrowHelper(right, localPin, 0.75, 0x5e9eff, 0.13, 0.08),
    new THREE.ArrowHelper(up, localPin, 0.75, 0x78d6ad, 0.13, 0.08),
  ], [localPin.x, localPin.y, localPin.z]);

  useEffect(() => {
    if (draggingRef.current || !globeRef.current) return;
    globeRef.current.position.fromArray(pose.globe.position);
    globeRef.current.quaternion.fromArray(pose.globe.quaternion);
    globeRef.current.scale.fromArray(pose.globe.scale);
  }, [pose]);

  const publish = () => {
    if (!globeRef.current) return;
    const next = cloneHeroStudioPose(pose);
    next.globe.position = tuple3(globeRef.current.position);
    next.globe.quaternion = tuple4(globeRef.current.quaternion.normalize());
    next.globe.scale = tuple3(globeRef.current.scale);
    onChange(next);
  };

  const model = (
    <group ref={globeRef} position={pose.globe.position} quaternion={pose.globe.quaternion} scale={pose.globe.scale}>
      <mesh>
        <icosahedronGeometry args={[radius, 3]} />
        <meshStandardMaterial color="#292c31" roughness={0.78} metalness={0.18} flatShading />
      </mesh>
      <mesh scale={1.008}>
        <icosahedronGeometry args={[radius, 2]} />
        <meshBasicMaterial color="#767982" wireframe transparent opacity={0.22} />
      </mesh>
      <mesh position={localPin.toArray()}>
        <sphereGeometry args={[0.11, 18, 12]} />
        <meshBasicMaterial color="#fff4f5" />
      </mesh>
      {arrows.map((arrow, index) => <primitive key={index} object={arrow} />)}
    </group>
  );

  return editable ? (
    <TransformControls
      mode="rotate"
      space="world"
      size={0.78}
      onMouseDown={() => { draggingRef.current = true; }}
      onMouseUp={() => { draggingRef.current = false; publish(); }}
      onObjectChange={publish}
    >
      {model}
    </TransformControls>
  ) : model;
};

const MirroredScene: React.FC<{
  pose: HeroStudioPose;
  capturedPose: HeroStudioPose | null;
  playbackStart: HeroStudioPose | null;
  editTarget: 'camera' | 'globe';
  aspect: number;
  showPath: boolean;
  onPoseChange: (pose: HeroStudioPose) => void;
}> = ({ pose, capturedPose, playbackStart, editTarget, aspect, showPath, onPoseChange }) => {
  const target = new THREE.Vector3().fromArray(pose.camera.target);
  const path = [
    playbackStart ? new THREE.Vector3().fromArray(playbackStart.camera.position) : null,
    new THREE.Vector3().fromArray(pose.camera.position),
    capturedPose ? new THREE.Vector3().fromArray(capturedPose.camera.position) : null,
  ].filter((point): point is THREE.Vector3 => Boolean(point));
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[6, 8, 9]} intensity={2.2} color="#ffe5e8" />
      <pointLight position={[-7, -2, 6]} intensity={10} distance={18} color="#a0162a" />
      <GlobeMirror pose={pose} editable={editTarget === 'globe'} onChange={onPoseChange} />
      <CameraMirror pose={pose} editable={editTarget === 'camera'} aspect={aspect} onChange={onPoseChange} />
      <mesh position={target.toArray()}>
        <sphereGeometry args={[0.085, 16, 12]} />
        <meshBasicMaterial color="#f4f5f7" />
      </mesh>
      <gridHelper args={[24, 24, '#692432', '#252931']} position={[0, -2.15, 0]} />
      {showPath && path.length > 1 ? <Line points={path} color="#ff5265" opacity={0.35} transparent dashed dashSize={0.2} gapSize={0.14} /> : null}
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={8} maxDistance={28} enableDamping />
    </>
  );
};

const EditorViewport: React.FC<{
  pose: HeroStudioPose | null;
  capturedPose: HeroStudioPose | null;
  playbackStart: HeroStudioPose | null;
  destination: Destination;
  aspect: number;
  showPath: boolean;
  onPoseChange: (pose: HeroStudioPose) => void;
}> = ({ pose, capturedPose, playbackStart, destination, aspect, showPath, onPoseChange }) => {
  const [editTarget, setEditTarget] = useState<'camera' | 'globe'>('camera');
  return (
    <section className="relative min-h-[390px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#07090c] shadow-[0_30px_90px_rgba(0,0,0,0.42)]">
      {pose ? (
        <Canvas camera={{ position: [11, 8, 13], fov: 42, near: 0.1, far: 100 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#07090c']} />
          <fog attach="fog" args={['#07090c', 18, 40]} />
          <MirroredScene pose={pose} capturedPose={capturedPose} playbackStart={playbackStart} editTarget={editTarget} aspect={aspect} showPath={showPath} onPoseChange={onPoseChange} />
        </Canvas>
      ) : <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">Waiting for production pose…</div>}
      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
        <div className="pointer-events-none rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">Live production rig mirror</p>
          <p className="mt-1 text-sm font-semibold text-white">{destination.city}</p>
          <p className="text-[10px] text-zinc-500">Spectator camera remains independent</p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-black/60 p-1 backdrop-blur-xl">
          {(['camera', 'globe'] as const).map((targetName) => (
            <button key={targetName} type="button" onClick={() => setEditTarget(targetName)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide ${editTarget === targetName ? 'bg-red-500/20 text-red-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
              {targetName}
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Drag gizmo to author · drag empty space to inspect</div>
    </section>
  );
};

const PreviewGuides: React.FC<{ profile: HeroArrivalProfile; pose: HeroStudioPose | null }> = ({ profile, pose }) => {
  const framing = pose ? screenFramingFromPose(pose) : { x: profile.heroStage.globeScreenX, y: profile.heroStage.globeScreenY };
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-white/20" />
      <div className="absolute left-0 h-px w-full border-t border-dashed border-sky-300/35" style={{ top: `${framing.y * 100}%` }} />
      <div className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-300/70" style={{ left: `${framing.x * 100}%`, top: `${framing.y * 100}%` }} />
      <div className="absolute inset-y-0 left-0 w-[22%] border-r border-dashed border-violet-300/25 bg-violet-500/[0.035]" />
      <div className="absolute inset-y-0 right-0 w-[24%] border-l border-dashed border-violet-300/25 bg-violet-500/[0.035]" />
    </div>
  );
};

type ProductionPreviewProps = {
  profile: HeroArrivalProfile;
  destination: Destination;
  aspect: number;
  showGuides: boolean;
  pose: HeroStudioPose | null;
  progress: number;
  captureState: HeroCaptureState;
  onPose: (pose: HeroStudioPose, source: HeroStudioPoseOrigin) => void;
  onSnapshot: (snapshot: HeroComposerSnapshot | null) => void;
  onStatus: (status: string) => void;
  onPinClick: () => void;
  onLabelAnchor: (x: number, y: number) => void;
};

const ProductionPreview = forwardRef<PreviewHandle, ProductionPreviewProps>(({
  profile,
  destination,
  aspect,
  showGuides,
  pose,
  progress,
  captureState,
  onPose,
  onSnapshot,
  onStatus,
  onPinClick,
  onLabelAnchor,
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<StudioRuntime | null>(null);
  const readyRef = useRef(false);
  const latestRef = useRef({ profile, destination });
  const callbacksRef = useRef({ onPose, onSnapshot, onStatus, onPinClick });
  const [authorMode, setAuthorMode] = useState<'camera' | 'globe'>('camera');
  const authorModeRef = useRef<'camera' | 'globe'>('camera');
  const globeDragRef = useRef<{ x: number; y: number } | null>(null);
  latestRef.current = { profile, destination };
  callbacksRef.current = { onPose, onSnapshot, onStatus, onPinClick };
  authorModeRef.current = authorMode;

  const publishPose = useCallback((source: HeroStudioPoseOrigin) => {
    const runtimePose = runtimeRef.current?.getHeroStudioPose();
    if (runtimePose) callbacksRef.current.onPose(runtimePose, source);
    callbacksRef.current.onSnapshot(runtimeRef.current?.getHeroArrivalComposerSnapshot() ?? null);
    return runtimePose ?? null;
  }, []);

  const syncDestination = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !readyRef.current) return null;
    const current = latestRef.current;
    const event = makeRuntimeEvent(current.destination);
    runtime.updateEvents([event]);
    runtime.updateActivityRegions([makeActivityRegion(current.destination)]);
    window.requestAnimationFrame(() => {
      runtime.selectHeroStudioDestination(event.id);
      runtime.previewHeroArrivalProfile(current.profile);
      runtime.prepareHeroStudioDestination(event.id);
      runtime.setHeroStudioCaptureState('idle');
      publishPose('profile');
    });
    return runtime.getHeroStudioPose();
  }, [publishPose]);

  useImperativeHandle(ref, () => ({
    applyPose(nextPose, source) {
      const applied = runtimeRef.current?.applyHeroStudioPose(nextPose, { source }) ?? null;
      if (applied) callbacksRef.current.onPose(applied, source);
      return applied;
    },
    previewProfile(nextProfile) {
      const runtime = runtimeRef.current;
      if (!runtime || !readyRef.current) return null;
      runtime.previewHeroArrivalProfile(nextProfile);
      return publishPose('profile');
    },
    captureFinal() {
      return runtimeRef.current?.captureFinalHeroStudioPose() ?? null;
    },
    previewCapturedProgress(from, to, nextProgress, ease) {
      return runtimeRef.current?.previewHeroStudioPoseProgress(from, to, nextProgress, ease) ?? null;
    },
    setPlaybackActive(active) {
      runtimeRef.current?.setHeroStudioPlaybackActive(active);
      if (!active) runtimeRef.current?.setHeroStudioControlsEnabled(authorModeRef.current === 'camera');
    },
    setCaptureState(nextState) {
      runtimeRef.current?.setHeroStudioCaptureState(nextState);
    },
    reset(nextProfile) {
      const runtime = runtimeRef.current;
      if (!runtime) return null;
      runtime.prepareHeroStudioDestination(eventIdForDestination(latestRef.current.destination));
      runtime.setHeroStudioCaptureState('idle');
      const resetPose = runtime.resetHeroStudioPose();
      if (!resetPose) return null;
      resetPose.heroProfile = nextProfile;
      return runtime.applyHeroStudioPose(resetPose, { source: 'reset' });
    },
    getPose() {
      return runtimeRef.current?.getHeroStudioPose() ?? null;
    },
  }), [publishPose]);

  useEffect(() => {
    let cancelled = false;
    const mount = async () => {
      if (!containerRef.current) return;
      try {
        const module = await import('../../src/features/globe/runtime/index.js');
        if (cancelled || !containerRef.current) return;
        const SwingSphereGlobe = module.SwingSphereGlobe as StudioRuntimeConstructor;
        const runtime = new SwingSphereGlobe(containerRef.current, {
          events: [makeRuntimeEvent(latestRef.current.destination)],
          activityRegions: [makeActivityRegion(latestRef.current.destination)],
          config: globeAssetsConfig,
          onReady: () => {
            if (cancelled) return;
            readyRef.current = true;
            runtime.setIdleMotionSuppressed(true);
            callbacksRef.current.onStatus(`Click the ${latestRef.current.destination.city} pin to select the hero subject.`);
            syncDestination();
          },
          onError: (error: unknown) => callbacksRef.current.onStatus(`Preview error: ${error instanceof Error ? error.message : String(error)}`),
          onEventSelect: () => {
            callbacksRef.current.onPinClick();
            return false;
          },
        });
        runtimeRef.current = runtime;
        runtime.setHeroStudioPoseListener((nextPose, meta) => callbacksRef.current.onPose(nextPose, meta.source));
        await runtime.mount();
      } catch (error) {
        callbacksRef.current.onStatus(`Preview error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    void mount();
    return () => {
      cancelled = true;
      readyRef.current = false;
      runtimeRef.current?.setHeroStudioPoseListener(null);
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [syncDestination]);

  useEffect(() => {
    syncDestination();
  }, [destination.id, syncDestination]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !readyRef.current) return;
    runtime.setHeroStudioControlsEnabled(authorMode === 'camera');
  }, [authorMode]);

  useEffect(() => {
    if (!readyRef.current) return;
    runtimeRef.current?.setHeroStudioCaptureState(captureState);
  }, [captureState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => runtimeRef.current?.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [aspect]);

  const moveLabelHandle = (clientX: number, clientY: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    onLabelAnchor(
      THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0.1, 0.9),
      THREE.MathUtils.clamp((clientY - rect.top) / rect.height, 0.1, 0.9),
    );
  };

  return (
    <section className="relative flex min-h-[390px] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-[#030406] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.42)]">
      <div ref={frameRef} className="relative w-full max-h-full overflow-hidden rounded-xl border border-white/[0.08] bg-black" style={{ aspectRatio: String(aspect) }}>
        <div ref={containerRef} className="absolute inset-0" aria-label="Production SwingSphere hero arrival preview" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_28%,rgba(0,0,0,0.18)_100%)]" />
        {showGuides ? <PreviewGuides profile={profile} pose={pose} /> : null}
        <div className={`pointer-events-none absolute right-3 top-3 z-50 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] backdrop-blur-xl ${
          captureState === 'idle'
            ? 'border-white/10 bg-black/60 text-zinc-400'
            : captureState === 'target-selected'
              ? 'border-red-300/35 bg-red-500/15 text-red-100 shadow-[0_0_22px_rgba(197,29,52,0.18)]'
              : captureState === 'endpoint-captured'
                ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100 shadow-[0_0_22px_rgba(110,231,183,0.12)]'
                : 'border-amber-200/35 bg-amber-300/10 text-amber-100'
        }`}>
          {captureState === 'idle'
            ? 'Idle'
            : captureState === 'target-selected'
              ? 'Ready to Capture Hero Pose'
              : captureState === 'endpoint-captured'
                ? 'Hero Endpoint Captured'
                : 'Previewing Arrival'}
        </div>
        {authorMode === 'globe' ? (
          <div
            className="absolute inset-0 z-30 cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(event) => {
              globeDragRef.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const previous = globeDragRef.current;
              if (!previous) return;
              runtimeRef.current?.rotateHeroStudioGlobe((event.clientX - previous.x) * 0.006, (event.clientY - previous.y) * 0.006);
              globeDragRef.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUp={(event) => {
              globeDragRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
        ) : null}
        {pose ? (
          <button
            type="button"
            title="Drag label hero anchor"
            className="absolute z-40 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-200 bg-amber-300/15 shadow-[0_0_18px_rgba(253,230,138,0.25)]"
            style={{ left: `${pose.labelAnchor.x * 100}%`, top: `${pose.labelAnchor.y * 100}%` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              moveLabelHandle(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) moveLabelHandle(event.clientX, event.clientY);
            }}
          />
        ) : null}
        <div className="absolute left-3 top-3 z-50 flex rounded-lg border border-white/10 bg-black/65 p-1 backdrop-blur-xl">
          <button type="button" onClick={() => setAuthorMode('camera')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide ${authorMode === 'camera' ? 'bg-red-500/20 text-red-100' : 'text-zinc-500'}`}><Camera size={11} />Camera</button>
          <button type="button" onClick={() => setAuthorMode('globe')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide ${authorMode === 'globe' ? 'bg-red-500/20 text-red-100' : 'text-zinc-500'}`}><Rotate3d size={11} />Globe</button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 z-50 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400 backdrop-blur-lg">
          {authorMode === 'camera' ? 'Drag orbit · right-drag pan · wheel zoom · click pin' : 'Drag to rotate production globe'} · {Math.round(progress * 100)}%
        </div>
      </div>
    </section>
  );
});

ProductionPreview.displayName = 'ProductionPreview';

type NumberFieldProps = { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void };

const NumberField: React.FC<NumberFieldProps> = ({ label, value, min, max, step, onChange }) => (
  <label className="grid grid-cols-[7.8rem_1fr_4.3rem] items-center gap-2 text-[10px] text-zinc-400">
    <span>{label}</span>
    <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="accent-red-500" />
    <input type="number" value={Number(value.toFixed(3))} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="h-7 rounded border border-white/10 bg-black/45 px-1.5 text-right text-zinc-200 outline-none focus:border-red-400/60" />
  </label>
);

const ToolButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }> = ({ icon, children, className = '', ...props }) => (
  <button {...props} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-3 text-[10px] font-bold uppercase tracking-wide text-zinc-200 transition hover:border-red-300/40 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>
    {icon}{children}
  </button>
);

const HeroCameraStudioPage: React.FC = () => {
  const previewRef = useRef<PreviewHandle>(null);
  const [profile, setProfile] = useState<HeroArrivalProfile>(() => readHeroArrivalProfile());
  const [pose, setPose] = useState<HeroStudioPose | null>(null);
  const [capturedPose, setCapturedPose] = useState<HeroStudioPose | null>(null);
  const [capturedByDestination, setCapturedByDestination] = useState<Record<string, HeroStudioPose>>({});
  const [captureState, setCaptureState] = useState<HeroCaptureState>('idle');
  const [playbackStart, setPlaybackStart] = useState<HeroStudioPose | null>(null);
  const [destinationId, setDestinationId] = useState(DESTINATIONS[0].id);
  const [aspectId, setAspectId] = useState('16:9');
  const [showGuides, setShowGuides] = useState(true);
  const [showPath, setShowPath] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [message, setMessage] = useState('Loading production runtime…');
  const [snapshot, setSnapshot] = useState<HeroComposerSnapshot | null>(null);
  const playStartedAtRef = useRef(0);
  const playStartProgressRef = useRef(0);
  const poseRef = useRef<HeroStudioPose | null>(null);
  const capturedPoseRef = useRef<HeroStudioPose | null>(null);
  const playbackStartRef = useRef<HeroStudioPose | null>(null);
  const captureStateRef = useRef<HeroCaptureState>('idle');

  const destination = DESTINATIONS.find((item) => item.id === destinationId) ?? DESTINATIONS[0];
  const aspect = ASPECTS.find((item) => item.id === aspectId)?.value ?? 16 / 9;
  const capturedMatchesDestination = capturedPose?.destination?.id === eventIdForDestination(destination);
  poseRef.current = pose;
  capturedPoseRef.current = capturedPose;
  playbackStartRef.current = playbackStart;
  captureStateRef.current = captureState;

  const transitionCaptureState = useCallback((nextState: HeroCaptureState) => {
    captureStateRef.current = nextState;
    setCaptureState(nextState);
    previewRef.current?.setCaptureState(nextState);
  }, []);

  const acceptProductionPose = useCallback((nextPose: HeroStudioPose, source: HeroStudioPoseOrigin) => {
    setPose(nextPose);
    poseRef.current = nextPose;
    if (source === 'production' && !isPlaying) setProgress(0);
  }, [isPlaying]);

  const authorPoseFromLeft = useCallback((nextPose: HeroStudioPose) => {
    setPose(nextPose);
    poseRef.current = nextPose;
    previewRef.current?.applyPose(nextPose, 'left-editor');
    setProgress(0);
  }, []);

  const applyProfile = (nextProfile: HeroArrivalProfile, announcement?: string) => {
    setProfile(nextProfile);
    previewRef.current?.previewProfile(nextProfile);
    setProgress(1);
    if (announcement) setMessage(announcement);
  };

  const updateStage = <K extends keyof HeroArrivalProfile['heroStage']>(key: K, value: HeroArrivalProfile['heroStage'][K]) => {
    applyProfile({ ...profile, heroStage: { ...profile.heroStage, [key]: value } });
  };

  const updateExactPose = (mutator: (next: HeroStudioPose) => void, source: HeroStudioPoseOrigin = 'left-editor') => {
    if (!pose) return;
    const next = cloneHeroStudioPose(pose);
    mutator(next);
    next.heroProfile = profile;
    setPose(next);
    previewRef.current?.applyPose(next, source);
  };

  const updateFov = (value: number) => {
    const nextProfile = { ...profile, fov: value };
    setProfile(nextProfile);
    updateExactPose((next) => { next.camera.fov = value; next.heroProfile = nextProfile; });
  };

  const updateFraming = (axis: 'x' | 'y', value: number) => {
    if (!pose) return;
    const framing = screenFramingFromPose(pose);
    const x = axis === 'x' ? value : framing.x;
    const y = axis === 'y' ? value : framing.y;
    const nextProfile = {
      ...profile,
      heroStage: { ...profile.heroStage, globeScreenX: x, globeScreenY: y },
    };
    setProfile(nextProfile);
    updateExactPose((next) => {
      next.camera.viewOffset = poseViewOffsetFromScreenFraming(next, x, y);
      next.heroProfile = nextProfile;
    });
  };

  const updateLabelAnchor = useCallback((x: number, y: number) => {
    const nextProfile: HeroArrivalProfile = {
      ...profile,
      heroStage: { ...profile.heroStage, labelAnchorX: x, labelAnchorY: y },
      heroComposition: { ...profile.heroComposition, anchorX: x, anchorY: y },
    };
    setProfile(nextProfile);
    const nextPose = poseRef.current ? cloneHeroStudioPose(poseRef.current) : null;
    if (nextPose) {
      nextPose.labelAnchor = { x, y };
      nextPose.heroProfile = nextProfile;
      setPose(nextPose);
    }
    previewRef.current?.previewProfile(nextProfile);
  }, [profile]);

  const captureFinal = () => {
    if (captureStateRef.current !== 'target-selected' && captureStateRef.current !== 'endpoint-captured') return;
    const captured = previewRef.current?.captureFinal();
    if (!captured) {
      setMessage('Production runtime is not ready to capture.');
      return;
    }
    const exact = cloneHeroStudioPose(captured.pose);
    exact.capturedAt = new Date().toISOString();
    exact.heroProfile = captured.profile;
    setCapturedPose(exact);
    setCapturedByDestination((current) => ({
      ...current,
      [eventIdForDestination(destination)]: exact,
    }));
    capturedPoseRef.current = exact;
    setPose(exact);
    setProfile(captured.profile);
    setPlaybackStart(null);
    setProgress(1);
    transitionCaptureState('endpoint-captured');
    setMessage('Hero Endpoint Captured');
  };

  const moveToTestStart = () => {
    const base = capturedPose ?? pose;
    if (!base) return;
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(false);
    transitionCaptureState('endpoint-captured');
    const start = createTestStartPose(base);
    setPlaybackStart(start);
    playbackStartRef.current = start;
    setPose(start);
    previewRef.current?.applyPose(start, 'test-start');
    setProgress(0);
    setMessage('Moved to a test start. Click the destination pin or Play to Captured Pose.');
  };

  const beginPlayback = useCallback(() => {
    const end = capturedPoseRef.current;
    const current = poseRef.current;
    if (!end || !current || end.destination?.id !== eventIdForDestination(destination)) {
      setMessage('Capture a final pose for the selected destination before playback.');
      return;
    }
    let start = playbackStartRef.current;
    if (!start || progress >= 0.9999) {
      start = cloneHeroStudioPose(current);
      setPlaybackStart(start);
      playbackStartRef.current = start;
      setProgress(0);
      playStartProgressRef.current = 0;
    } else {
      playStartProgressRef.current = progress;
    }
    playStartedAtRef.current = performance.now();
    previewRef.current?.setPlaybackActive(true);
    transitionCaptureState('previewing');
    setIsPlaying(true);
    setMessage('Playing the production camera and globe to the exact captured endpoint.');
  }, [destination, progress, transitionCaptureState]);

  const handlePinClick = useCallback(() => {
    const currentState = captureStateRef.current;
    if (currentState === 'previewing') return;
    if (currentState === 'endpoint-captured') {
      beginPlayback();
      return;
    }
    if (currentState === 'target-selected') return;

    const savedEndpoint = capturedPoseRef.current;
    if (savedEndpoint?.destination?.id === eventIdForDestination(destination)) {
      previewRef.current?.applyPose(savedEndpoint, 'profile');
      if (savedEndpoint.heroProfile) setProfile(savedEndpoint.heroProfile);
      transitionCaptureState('endpoint-captured');
      setMessage('Hero Endpoint Captured');
      return;
    }

    transitionCaptureState('target-selected');
    previewRef.current?.previewProfile(profile);
    setMessage('Ready to Capture Hero Pose');
  }, [beginPlayback, destination, profile, transitionCaptureState]);

  const pausePlayback = () => {
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(false);
    transitionCaptureState('endpoint-captured');
    setMessage('Playback paused.');
  };

  const restartPlayback = () => {
    const start = playbackStartRef.current;
    if (!start) {
      moveToTestStart();
      return;
    }
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(false);
    transitionCaptureState('endpoint-captured');
    setProgress(0);
    setPose(start);
    previewRef.current?.applyPose(start, 'playback');
  };

  const scrubTo = (nextProgress: number) => {
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(true);
    let start = playbackStartRef.current;
    const end = capturedPoseRef.current;
    if (!start && poseRef.current) {
      start = cloneHeroStudioPose(poseRef.current);
      setPlaybackStart(start);
      playbackStartRef.current = start;
    }
    if (start && end) {
      previewRef.current?.previewCapturedProgress(start, end, nextProgress, profile.ease);
      setProgress(nextProgress);
    }
    previewRef.current?.setPlaybackActive(false);
    transitionCaptureState('endpoint-captured');
  };

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = (now: number) => {
      const start = playbackStartRef.current;
      const end = capturedPoseRef.current;
      if (!start || !end) {
        setIsPlaying(false);
        previewRef.current?.setPlaybackActive(false);
        transitionCaptureState(capturedPoseRef.current ? 'endpoint-captured' : 'target-selected');
        return;
      }
      const duration = Math.max(profile.durationMs, 1);
      const next = playStartProgressRef.current + (now - playStartedAtRef.current) / duration;
      if (next >= 1) {
        previewRef.current?.previewCapturedProgress(start, end, 1, profile.ease);
        setPose(cloneHeroStudioPose(end));
        setProgress(1);
        if (loop) {
          previewRef.current?.previewCapturedProgress(start, end, 0, profile.ease);
          playStartedAtRef.current = now;
          playStartProgressRef.current = 0;
          setProgress(0);
        } else {
          setIsPlaying(false);
          previewRef.current?.setPlaybackActive(false);
          transitionCaptureState('endpoint-captured');
          setMessage('Arrived at the exact captured hero pose.');
          return;
        }
      } else {
        previewRef.current?.previewCapturedProgress(start, end, next, profile.ease);
        setProgress(next);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, loop, profile.durationMs, profile.ease, transitionCaptureState]);

  const clearCaptured = () => {
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(false);
    const currentEventId = eventIdForDestination(destination);
    setCapturedPose(null);
    setCapturedByDestination((current) => {
      const next = { ...current };
      delete next[currentEventId];
      return next;
    });
    capturedPoseRef.current = null;
    setPlaybackStart(null);
    playbackStartRef.current = null;
    setProgress(0);
    transitionCaptureState('target-selected');
    setMessage('Captured endpoint cleared. Ready to Capture Hero Pose.');
  };

  const saveProfile = async () => {
    try {
      persistHeroArrivalProfile(profile);
      await saveHeroArrivalProfileToProduction(profile);
      setMessage('Saved the captured destination-relative profile to GlobeRuntimeConfig.js.');
    } catch (error) {
      setMessage(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
    }
  };

  const savePreset = () => {
    const preset = { id: 'custom', name: 'Hero Camera Studio', description: 'Derived from an exact captured Studio endpoint.', profile };
    window.localStorage.setItem(HERO_COMPOSER_CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(preset));
    persistHeroArrivalProfile(profile);
    setMessage('Saved the derived profile as the Hero Arrival Composer Custom preset.');
  };

  const copyJson = async () => {
    const payload = { exactStudioEndpoint: capturedPose, reusableHeroArrivalProfile: JSON.parse(formatHeroArrivalSnippet(profile)) };
    await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setMessage('Copied exact Studio endpoint and reusable profile JSON.');
  };

  const exportJson = () => {
    const payload = { exactStudioEndpoint: capturedPose, reusableHeroArrivalProfile: JSON.parse(formatHeroArrivalSnippet(profile)) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'swingsphere-hero-studio-pose.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Exported exact Studio endpoint and reusable profile.');
  };

  const fullReset = () => {
    const nextProfile = mergeHeroArrivalProfile(defaultHeroArrivalProfile, {});
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(false);
    setCapturedPose(null);
    setCapturedByDestination({});
    capturedPoseRef.current = null;
    setPlaybackStart(null);
    playbackStartRef.current = null;
    setProgress(0);
    setProfile(nextProfile);
    transitionCaptureState('idle');
    const resetPose = previewRef.current?.reset(nextProfile);
    if (resetPose) setPose(resetPose);
    setMessage('Full Studio reset: default world camera, globe transform, profile, capture, and timeline restored.');
  };

  const changeDestination = (nextDestinationId: string) => {
    const nextDestination = DESTINATIONS.find((item) => item.id === nextDestinationId) ?? DESTINATIONS[0];
    const savedEndpoint = capturedByDestination[eventIdForDestination(nextDestination)] ?? null;
    setIsPlaying(false);
    previewRef.current?.setPlaybackActive(false);
    setDestinationId(nextDestinationId);
    setCapturedPose(savedEndpoint);
    capturedPoseRef.current = savedEndpoint;
    setPlaybackStart(null);
    playbackStartRef.current = null;
    setProgress(0);
    transitionCaptureState('idle');
    setMessage(savedEndpoint
      ? `Saved endpoint available for ${nextDestination.city}. Click its pin to select it.`
      : `Click the ${nextDestination.city} pin to select the hero subject.`);
  };

  if (!DEV_TOOLS_ENABLED) return <Navigate to="/" replace />;

  const framing = pose ? screenFramingFromPose(pose) : { x: profile.heroStage.globeScreenX, y: profile.heroStage.globeScreenY };
  const targetIsSelected = captureState !== 'idle';
  const capturedEndpointIsActive = capturedMatchesDestination && (captureState === 'endpoint-captured' || captureState === 'previewing');

  return (
    <div className="h-full min-h-0 overflow-auto bg-[#050608] text-zinc-100">
      <div className="mx-auto flex min-h-full w-full max-w-[1880px] flex-col gap-4 p-4 lg:p-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-[rgba(12,14,18,0.82)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-2 text-red-300"><Camera size={16} /><span className="text-[10px] font-bold uppercase tracking-[0.22em]">Synchronized pose authoring</span></div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Hero Camera Studio</h1>
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">One authoritative HeroStudioPose drives the production viewport and the spectator rig.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Destination</label>
            <select value={destinationId} onChange={(event) => changeDestination(event.target.value)} className="h-9 rounded-lg border border-white/10 bg-black/45 px-3 text-xs text-zinc-100">
              {DESTINATIONS.map((item) => <option key={item.id} value={item.id}>{item.city} · {item.lat < 0 ? 'South' : 'North'}</option>)}
            </select>
            <label className="ml-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Preview</label>
            <select value={aspectId} onChange={(event) => setAspectId(event.target.value)} className="h-9 rounded-lg border border-white/10 bg-black/45 px-3 text-xs text-zinc-100">
              {ASPECTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
        </header>

        <main className="grid min-h-[500px] flex-1 grid-cols-1 gap-4 xl:grid-cols-2">
          <EditorViewport pose={pose} capturedPose={capturedPose} playbackStart={playbackStart} destination={destination} aspect={aspect} showPath={showPath} onPoseChange={authorPoseFromLeft} />
          <ProductionPreview ref={previewRef} profile={profile} destination={destination} aspect={aspect} showGuides={showGuides} pose={pose} progress={progress} captureState={captureState} onPose={acceptProductionPose} onSnapshot={setSnapshot} onStatus={setMessage} onPinClick={handlePinClick} onLabelAnchor={updateLabelAnchor} />
        </main>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_1.15fr_1fr]">
          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">Shared pose & profile</h2><Gauge size={15} className="text-red-300" /></div>
            <div className="space-y-2.5">
              <NumberField label="Camera Distance" value={profile.heroStage.distance} min={3.4} max={12} step={0.01} onChange={(value) => updateStage('distance', value)} />
              <NumberField label="Horizon Tilt" value={profile.heroStage.tiltDegrees} min={-45} max={75} step={0.25} onChange={(value) => updateStage('tiltDegrees', value)} />
              <NumberField label="Orbit Heading" value={profile.heroStage.headingDegrees} min={-180} max={180} step={0.5} onChange={(value) => updateStage('headingDegrees', value)} />
              <NumberField label="Camera Field of View" value={pose?.camera.fov ?? profile.fov} min={25} max={70} step={0.25} onChange={updateFov} />
              <NumberField label="Earth Horizontal Position" value={framing.x} min={0.1} max={0.9} step={0.005} onChange={(value) => updateFraming('x', value)} />
              <NumberField label="Earth Vertical Position" value={framing.y} min={0.1} max={2} step={0.01} onChange={(value) => updateFraming('y', value)} />
              <NumberField label="Label Horizontal Position" value={pose?.labelAnchor.x ?? profile.heroStage.labelAnchorX} min={0.1} max={0.9} step={0.005} onChange={(value) => updateLabelAnchor(value, pose?.labelAnchor.y ?? profile.heroStage.labelAnchorY)} />
              <NumberField label="Label Vertical Position" value={pose?.labelAnchor.y ?? profile.heroStage.labelAnchorY} min={0.1} max={0.9} step={0.005} onChange={(value) => updateLabelAnchor(pose?.labelAnchor.x ?? profile.heroStage.labelAnchorX, value)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">Captured-pose playback</h2><span className="font-mono text-xs text-red-200">{Math.round(progress * 100)}%</span></div>
            <input type="range" min={0} max={1} step={0.001} value={progress} disabled={!capturedEndpointIsActive} onChange={(event) => scrubTo(Number(event.target.value))} className="w-full accent-red-500 disabled:opacity-30" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ToolButton onClick={captureFinal} disabled={!targetIsSelected || captureState === 'previewing'} icon={<Camera size={13} />} className="border-red-400/35 bg-red-500/10 text-red-100">Capture Hero Endpoint</ToolButton>
              <ToolButton onClick={moveToTestStart} disabled={!capturedEndpointIsActive || isPlaying} icon={<Move3d size={13} />}>Move to Test Start</ToolButton>
              <ToolButton onClick={beginPlayback} disabled={!capturedEndpointIsActive || isPlaying} icon={<Play size={13} />}>Play to Captured</ToolButton>
              <ToolButton onClick={pausePlayback} disabled={!isPlaying} icon={<Pause size={13} />}>Pause</ToolButton>
              <ToolButton onClick={restartPlayback} disabled={!capturedEndpointIsActive || isPlaying} icon={<RefreshCcw size={13} />}>Restart</ToolButton>
              <ToolButton onClick={clearCaptured} disabled={!capturedEndpointIsActive} icon={<Trash2 size={13} />}>Clear Captured</ToolButton>
            </div>
            <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-3">
              <NumberField label="Duration ms" value={profile.durationMs} min={400} max={6000} step={25} onChange={(value) => setProfile((current) => ({ ...current, durationMs: value }))} />
              <label className="grid grid-cols-[7.8rem_1fr] items-center gap-2 text-[10px] text-zinc-400"><span>Production ease</span><select value={profile.ease} onChange={(event) => setProfile((current) => ({ ...current, ease: event.target.value as HeroArrivalProfile['ease'] }))} className="h-8 rounded border border-white/10 bg-black/45 px-2 text-zinc-200"><option value="cinematic">cinematic</option><option value="cubic">cubic</option><option value="smooth">smooth</option></select></label>
              <label className="flex items-center justify-between text-[10px] text-zinc-400"><span>Loop captured pose</span><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} className="accent-red-500" /></label>
              <label className="flex items-center justify-between text-[10px] text-zinc-400"><span>Composition guides</span><input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} className="accent-red-500" /></label>
              <label className="flex items-center justify-between text-[10px] text-zinc-400"><span>Camera path</span><input type="checkbox" checked={showPath} onChange={(event) => setShowPath(event.target.checked)} className="accent-red-500" /></label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">Capture & production save</h2><Save size={15} className="text-red-300" /></div>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton onClick={() => void saveProfile()} disabled={!capturedEndpointIsActive} icon={<Save size={13} />} className="border-red-400/35 bg-red-500/10 text-red-100">Save Hero Profile</ToolButton>
              <ToolButton onClick={savePreset} disabled={!capturedEndpointIsActive} icon={<Check size={13} />}>Save as Preset</ToolButton>
              <ToolButton onClick={() => void copyJson()} icon={<Clipboard size={13} />}>Copy JSON</ToolButton>
              <ToolButton onClick={exportJson} icon={<Download size={13} />}>Export JSON</ToolButton>
              <ToolButton onClick={fullReset} icon={<RotateCcw size={13} />} className="col-span-2">Full Studio Reset</ToolButton>
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.08] bg-black/35 p-3">
              <p className="text-[10px] leading-4 text-zinc-400">{message}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-2 font-mono text-[9px] text-zinc-500">
                <span>Pose authority</span><span className="text-right text-zinc-300">{pose ? 'synchronized' : 'waiting'}</span>
                <span>Capture state</span><span className="text-right text-zinc-300">{captureState}</span>
                <span>Captured endpoint</span><span className="text-right text-zinc-300">{capturedPose?.destination?.name ?? '—'}</span>
                <span>Camera distance</span><span className="text-right text-zinc-300">{snapshot?.cameraDistance.toFixed(3) ?? '—'}</span>
                <span>Orbit target</span><span className="text-right text-zinc-300">{pose?.camera.target.map((value) => value.toFixed(2)).join(', ') ?? '—'}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HeroCameraStudioPage;
