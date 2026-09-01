import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Gauge,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Sun,
} from 'lucide-react';

type LightKey =
  | 'ambient'
  | 'hemisphere'
  | 'directionalKey'
  | 'softKey'
  | 'fill'
  | 'undersideFill'
  | 'rearFill'
  | 'crimsonRim'
  | 'crimsonBack'
  | 'crimsonBounce';

type LightingSpaceMode = 'geo' | 'studio';

type EffectKey =
  | 'backgroundGradient'
  | 'backgroundHaze'
  | 'backgroundGlow'
  | 'innerAtmosphere'
  | 'outerAtmosphere'
  | 'crimsonRimShell'
  | 'bloom'
  | 'graphiteFacet'
  | 'landEmissive'
  | 'oceanEmissive';

type BloomSettings = {
  strength: number;
  radius: number;
  threshold: number;
  resolutionScale: number;
};

type RuntimeConfig = {
  lights: Record<string, any>;
  renderEffects?: Partial<Record<EffectKey, boolean>>;
  crimsonRim: {
    rimStrength: number;
    rimOpacity: number;
    [key: string]: number;
  };
  materials: {
    land: { emissiveStrength: number; graphiteFacetBoost: number };
    ocean: { emissiveStrength: number; graphiteFacetBoost: number };
  };
  bloom: BloomSettings;
  background: { enabled?: boolean };
};

type AuditRuntime = {
  renderer: any;
  atmosphere: any;
  config: RuntimeConfig;
  lights: Record<LightKey, THREE.Light>;
  productionLights: Record<LightKey, boolean>;
  productionEffects: Record<EffectKey, boolean>;
  productionRimStrength: number;
  productionBloomSettings: BloomSettings;
  backgroundTexture: THREE.Color | THREE.Texture | THREE.CubeTexture | null;
  extraLights: THREE.Light[];
  removeFrameListener?: () => void;
  removePerformanceListener?: () => void;
  removeStudioDragListeners?: () => void;
  setFacetBoost: (material: THREE.Material, strength: number) => void;
};

type PerformanceSnapshot = {
  averageFps?: number | null;
  averageRenderCostMs?: number | null;
  drawCalls?: number | null;
  triangles?: number | null;
  pixelRatio?: number | null;
  framePolicy?: string;
  targetFps?: number | null;
};

type LightOverlayPosition = {
  key: LightKey;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  visible: boolean;
};

type LightMeta = {
  key: LightKey;
  label: string;
  shortLabel: string;
  kind: 'ambient' | 'hemisphere' | 'directional';
  description: string;
};

type EffectMeta = {
  key: EffectKey;
  label: string;
  cost: 'low' | 'medium' | 'high';
  description: string;
};

const LIGHTS: LightMeta[] = [
  {
    key: 'ambient',
    label: 'Ambient floor',
    shortLabel: 'Ambient',
    kind: 'ambient',
    description: 'Directionless base illumination. Keeps every facet from falling fully black, but can flatten contrast when stacked with other fills.',
  },
  {
    key: 'hemisphere',
    label: 'Hemisphere fill',
    shortLabel: 'Hemi',
    kind: 'hemisphere',
    description: 'Broad sky-versus-ground illumination. Gives the top and underside different tonal floors without a single visible light direction.',
  },
  {
    key: 'directionalKey',
    label: 'Directional key',
    shortLabel: 'Key',
    kind: 'directional',
    description: 'Primary neutral sculpting light. Establishes the main readable facet direction across the front of the globe.',
  },
  {
    key: 'softKey',
    label: 'Soft key',
    shortLabel: 'Soft',
    kind: 'directional',
    description: 'Secondary neutral key from the opposite upper side. Configured in the runtime but currently disabled in production.',
  },
  {
    key: 'fill',
    label: 'Front fill',
    shortLabel: 'Fill',
    kind: 'directional',
    description: 'Neutral front/right fill. Opens darker faces that the main key does not reach and reduces contrast between neighboring facets.',
  },
  {
    key: 'undersideFill',
    label: 'Underside fill',
    shortLabel: 'Under',
    kind: 'directional',
    description: 'Neutral light from below. Prevents the southern/lower hemisphere from becoming too dark when the key is above the globe.',
  },
  {
    key: 'rearFill',
    label: 'Rear fill',
    shortLabel: 'Rear',
    kind: 'directional',
    description: 'Neutral back-side separation light. Configured but currently disabled in production.',
  },
  {
    key: 'crimsonRim',
    label: 'Crimson primary',
    shortLabel: 'Red Primary',
    kind: 'directional',
    description: 'Merged production crimson source replacing the former separate rim and back lights. Biased rearward while retaining lateral angle for the sunrise-like edge flare.',
  },
  {
    key: 'crimsonBack',
    label: 'Legacy crimson back',
    shortLabel: 'Red Back',
    kind: 'directional',
    description: 'Former production back light, now disabled after consolidation into Crimson Primary. Kept available here for A/B comparison.',
  },
  {
    key: 'crimsonBounce',
    label: 'Crimson bounce',
    shortLabel: 'Red Bounce',
    kind: 'directional',
    description: 'Additional red lower/back bounce. Configured but currently disabled in production.',
  },
];

const EFFECTS: EffectMeta[] = [
  {
    key: 'backgroundGradient',
    label: 'Environment gradient',
    cost: 'low',
    description: 'Static canvas texture behind the scene. Adds the dark graphite/blue vignette but is not a light source.',
  },
  {
    key: 'backgroundHaze',
    label: 'Background haze plane',
    cost: 'low',
    description: 'Large camera-facing translucent plane behind the globe. Softens the silhouette and keeps the background from feeling empty.',
  },
  {
    key: 'backgroundGlow',
    label: 'Background crimson glow',
    cost: 'low',
    description: 'Camera-facing radial glow plane with a subtle crimson mix behind the globe.',
  },
  {
    key: 'innerAtmosphere',
    label: 'Inner atmosphere shell',
    cost: 'medium',
    description: '96×48 additive Fresnel sphere wrapped around the globe. Provides the close graphite/crimson atmospheric edge.',
  },
  {
    key: 'outerAtmosphere',
    label: 'Outer atmosphere shell',
    cost: 'medium',
    description: 'Second 96×48 additive Fresnel sphere. Extends the atmospheric falloff and softens the limb.',
  },
  {
    key: 'crimsonRimShell',
    label: 'Crimson rim shell',
    cost: 'medium',
    description: 'Third 96×48 additive shell dedicated to the red edge/rim treatment. Separate from the crimson directional lights.',
  },
  {
    key: 'bloom',
    label: 'Unreal bloom pass',
    cost: 'high',
    description: 'Full-screen post-processing pass. Spreads bright pixels into a glow and is one of the most expensive effects in the current renderer.',
  },
  {
    key: 'graphiteFacet',
    label: 'Graphite facet boost',
    cost: 'low',
    description: 'Small custom fragment-shader boost that brightens grazing-angle facets so the low-poly planes read more clearly.',
  },
  {
    key: 'landEmissive',
    label: 'Land emissive floor',
    cost: 'low',
    description: 'Adds a small self-lit floor to the land material so facets remain legible independent of direct lighting.',
  },
  {
    key: 'oceanEmissive',
    label: 'Ocean emissive floor',
    cost: 'low',
    description: 'Adds a larger self-lit floor to the ocean material, keeping the globe body readable when directional lighting falls away.',
  },
];

const EMPTY_LIGHT_STATE = LIGHTS.reduce<Record<LightKey, boolean>>((state, light) => {
  state[light.key] = false;
  return state;
}, {} as Record<LightKey, boolean>);

const EMPTY_EFFECT_STATE = EFFECTS.reduce<Record<EffectKey, boolean>>((state, effect) => {
  state[effect.key] = false;
  return state;
}, {} as Record<EffectKey, boolean>);

const COST_CLASS: Record<EffectMeta['cost'], string> = {
  low: 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200',
  medium: 'border-amber-400/20 bg-amber-500/[0.06] text-amber-200',
  high: 'border-red-400/25 bg-red-500/[0.08] text-red-200',
};

function configuredLightEnabled(key: LightKey, config: RuntimeConfig): boolean {
  const light = config.lights[key];
  if (!light) return false;
  return light.enabled !== false && Number(light.intensity ?? 0) > 0;
}

function sourcePhrase(config: any): string {
  if (!config || !Number.isFinite(config.x)) return 'Global / directionless';
  const horizontal = config.x > 1 ? 'right' : config.x < -1 ? 'left' : 'center';
  const vertical = config.y > 1 ? 'upper' : config.y < -1 ? 'lower' : 'mid';
  const depth = config.z > 1 ? 'front' : config.z < -1 ? 'back' : 'side';
  return `${vertical}-${horizontal} / ${depth}`;
}

function formatVector(config: any): string {
  if (!config || !Number.isFinite(config.x)) return '—';
  return `${Number(config.x).toFixed(2)}, ${Number(config.y).toFixed(2)}, ${Number(config.z).toFixed(2)}`;
}

const Toggle: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`inline-flex h-7 min-w-[4.2rem] items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition ${checked
      ? 'border-red-400/35 bg-red-500/12 text-red-100'
      : 'border-white/10 bg-black/25 text-zinc-500 hover:text-zinc-300'}`}
    aria-pressed={checked}
    aria-label={`${checked ? 'Disable' : 'Enable'} ${label}`}
  >
    {checked ? <Eye size={12} /> : <EyeOff size={12} />}
    {checked ? 'On' : 'Off'}
  </button>
);

function projectLightOverlays(renderer: any, config: RuntimeConfig): LightOverlayPosition[] {
  if (!renderer?.camera || !renderer?.globe) return [];
  const center = renderer.globe.getWorldPosition(new THREE.Vector3());
  const centerNdc = center.clone().project(renderer.camera);
  const radius = Number(renderer.presentationRadius ?? renderer.globeRadius ?? 2.5) * 1.34;
  return LIGHTS.filter((light) => light.kind === 'directional').map((light) => {
    const cfg = config.lights?.[light.key];
    const direction = new THREE.Vector3(Number(cfg?.x ?? 0), Number(cfg?.y ?? 0), Number(cfg?.z ?? 1));
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
    direction.normalize();
    const anchor = center.clone().addScaledVector(direction, radius);
    const projected = anchor.project(renderer.camera);
    return {
      key: light.key,
      x: THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * 100, 7, 93),
      y: THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * 100, 10, 90),
      centerX: THREE.MathUtils.clamp((centerNdc.x * 0.5 + 0.5) * 100, 0, 100),
      centerY: THREE.MathUtils.clamp((-centerNdc.y * 0.5 + 0.5) * 100, 0, 100),
      visible: projected.z > -1.3 && projected.z < 1.3,
    };
  });
}

const LightViewportOverlay: React.FC<{
  positions: LightOverlayPosition[];
  config: RuntimeConfig | null;
  lightState: Record<LightKey, boolean>;
  onToggle: (key: LightKey, enabled: boolean) => void;
}> = ({ positions, config, lightState, onToggle }) => (
  <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {positions.filter((position) => position.visible).map((position) => {
        const cfg = config?.lights?.[position.key];
        const enabled = lightState[position.key];
        return (
          <line
            key={position.key}
            x1={position.x}
            y1={position.y}
            x2={position.centerX}
            y2={position.centerY}
            stroke={cfg?.color ?? '#d0d0d0'}
            strokeWidth={enabled ? 0.26 : 0.12}
            strokeDasharray={enabled ? undefined : '1.1 1.4'}
            opacity={enabled ? 0.58 : 0.2}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
    {positions.filter((position) => position.visible).map((position) => {
      const meta = LIGHTS.find((light) => light.key === position.key);
      const cfg = config?.lights?.[position.key];
      if (!meta) return null;
      const enabled = lightState[position.key];
      return (
        <button
          key={position.key}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(position.key, !enabled);
          }}
          className={`pointer-events-auto absolute min-w-[92px] -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-1.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.38)] backdrop-blur-xl transition ${enabled
            ? 'border-white/20 bg-black/75 text-white hover:border-white/35'
            : 'border-white/[0.08] bg-black/55 text-zinc-500 opacity-65 hover:opacity-100'}`}
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
          aria-pressed={enabled}
          title={`${enabled ? 'Disable' : 'Enable'} ${meta.label}`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cfg?.color ?? '#d0d0d0' }} />
              <span className="truncate text-[9px] font-bold uppercase tracking-[0.11em]">{meta.shortLabel}</span>
            </span>
            <span className={`text-[8px] font-bold uppercase ${enabled ? 'text-red-200' : 'text-zinc-600'}`}>{enabled ? 'on' : 'off'}</span>
          </span>
          <span className="mt-0.5 block truncate text-[8px] text-zinc-500">{sourcePhrase(cfg)}</span>
        </button>
      );
    })}
  </div>
);

const InspectorPanel: React.FC<{
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, eyebrow, icon, summary, open, onToggle, children }) => (
  <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.025]">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-white/[0.025]">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="text-red-300">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-white">{title}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {summary}
        {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
      </span>
    </button>
    {open && <div className="border-t border-white/[0.07] p-2.5">{children}</div>}
  </section>
);

const LightingAuditPage: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<AuditRuntime | null>(null);
  const overlayUpdateAtRef = useRef(0);
  const lightingSpaceRef = useRef<LightingSpaceMode>('geo');
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [lightState, setLightState] = useState<Record<LightKey, boolean>>({ ...EMPTY_LIGHT_STATE });
  const [effectState, setEffectState] = useState<Record<EffectKey, boolean>>({ ...EMPTY_EFFECT_STATE });
  const [metrics, setMetrics] = useState<PerformanceSnapshot>({});
  const [status, setStatus] = useState('Loading production globe materials…');
  const [spinning, setSpinning] = useState(false);
  const [lightingSpace, setLightingSpace] = useState<LightingSpaceMode>('geo');
  const [lightOverlayPositions, setLightOverlayPositions] = useState<LightOverlayPosition[]>([]);
  const [openPanels, setOpenPanels] = useState({ lights: true, effects: false, diagnostics: false });
  const [expandedLights, setExpandedLights] = useState<Set<LightKey>>(() => new Set());
  const [expandedEffects, setExpandedEffects] = useState<Set<EffectKey>>(() => new Set());
  const [crimsonRimStrength, setCrimsonRimStrength] = useState(1.05);
  const [bloomSettings, setBloomSettings] = useState<BloomSettings>({
    strength: 1.512,
    radius: 0.397,
    threshold: 0.3,
    resolutionScale: 0.75,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = viewportRef.current;
    if (!container) return undefined;

    const mount = async () => {
      try {
        const [configModule, loaderModule, rendererModule, atmosphereModule, facetModule, backgroundModule] = await Promise.all([
          import('../../src/features/globe/runtime/GlobeRuntimeConfig.js'),
          import('../../src/features/globe/runtime/GlobeAssetLoader.js'),
          import('../../src/features/globe/runtime/GlobeRenderer.js'),
          import('../../src/features/globe/runtime/AtmosphereRenderer.js'),
          import('../../src/features/globe/runtime/shaders/graphiteFacetBoost.js'),
          import('../../src/features/globe/runtime/shaders/backgroundGlowShader.js'),
        ]);
        if (cancelled) return;

        const config = configModule.createGlobeRuntimeConfig({}) as RuntimeConfig & any;
        const loader = new loaderModule.GlobeAssetLoader(config);
        const assets = await loader.load();
        if (cancelled) return;

        const renderer = new rendererModule.GlobeRenderer({ container, assets, config });
        const atmosphere = new atmosphereModule.AtmosphereRenderer({
          scene: renderer.scene,
          globe: renderer.globe,
          camera: renderer.camera,
          globeRadius: renderer.globeRadius,
          config,
        });

        const extraLights: THREE.Light[] = [];
        const allLights = {} as Record<LightKey, THREE.Light>;
        for (const meta of LIGHTS) {
          let light = renderer.lights?.[meta.key] as THREE.Light | undefined;
          const entry = config.lights[meta.key];
          if (!light && meta.kind === 'directional' && entry) {
            const directional = new THREE.DirectionalLight(entry.color, entry.intensity);
            directional.position.set(entry.x, entry.y, entry.z);
            directional.visible = false;
            directional.name = `lighting-audit-${meta.key}`;
            renderer.scene.add(directional);
            extraLights.push(directional);
            light = directional;
          }
          if (light) allLights[meta.key] = light;
        }

        const productionLights = LIGHTS.reduce<Record<LightKey, boolean>>((state, light) => {
          state[light.key] = configuredLightEnabled(light.key, config);
          return state;
        }, {} as Record<LightKey, boolean>);

        const savedEffects = config.renderEffects ?? {};
        const productionEffects: Record<EffectKey, boolean> = {
          backgroundGradient: config.background?.enabled !== false && savedEffects.backgroundGradient !== false,
          backgroundHaze: Boolean(atmosphere.backgroundHazeMesh) && savedEffects.backgroundHaze !== false,
          backgroundGlow: Boolean(atmosphere.backgroundGlowMesh) && savedEffects.backgroundGlow !== false,
          innerAtmosphere: Boolean(atmosphere.innerMesh) && savedEffects.innerAtmosphere !== false,
          outerAtmosphere: Boolean(atmosphere.outerMesh) && savedEffects.outerAtmosphere !== false,
          crimsonRimShell: Boolean(atmosphere.rimMesh) && savedEffects.crimsonRimShell !== false,
          bloom: savedEffects.bloom !== false && Boolean(renderer.bloomPass?.enabled),
          graphiteFacet: savedEffects.graphiteFacet !== false && Number(config.materials.land.graphiteFacetBoost ?? 0) > 0,
          landEmissive: savedEffects.landEmissive !== false && Number(config.materials.land.emissiveStrength ?? 0) > 0,
          oceanEmissive: savedEffects.oceanEmissive !== false && Number(config.materials.ocean.emissiveStrength ?? 0) > 0,
        };

        const auditBackgroundTexture = renderer.scene.background
          ?? (config.background?.enabled !== false ? backgroundModule.createEnvironmentBackgroundTexture(config) : null);

        const runtime: AuditRuntime = {
          renderer,
          atmosphere,
          config,
          lights: allLights,
          productionLights,
          productionEffects,
          productionRimStrength: Number(config.crimsonRim.rimStrength ?? 1.05),
          productionBloomSettings: {
            strength: Number(config.bloom.strength ?? 1.512),
            radius: Number(config.bloom.radius ?? 0.397),
            threshold: Number(config.bloom.threshold ?? 0.3),
            resolutionScale: Number(config.bloom.resolutionScale ?? 1),
          },
          backgroundTexture: auditBackgroundTexture,
          extraLights,
          setFacetBoost: facetModule.setGraphiteFacetBoost,
        };

        const canvas = renderer.renderer?.domElement as HTMLCanvasElement | undefined;
        if (canvas) {
          const dragState = { active: false, pointerId: -1, x: 0, y: 0 };
          const cameraRight = new THREE.Vector3();
          const cameraUp = new THREE.Vector3();
          const yaw = new THREE.Quaternion();
          const pitch = new THREE.Quaternion();
          const radiansPerPixel = 0.0052;

          const endStudioDrag = (event?: PointerEvent) => {
            if (!dragState.active) return;
            if (event && dragState.pointerId !== event.pointerId) return;
            if (event && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            dragState.active = false;
            dragState.pointerId = -1;
            canvas.style.cursor = lightingSpaceRef.current === 'studio' ? 'grab' : '';
          };

          const onStudioPointerDown = (event: PointerEvent) => {
            if (lightingSpaceRef.current !== 'studio' || event.button !== 0) return;
            dragState.active = true;
            dragState.pointerId = event.pointerId;
            dragState.x = event.clientX;
            dragState.y = event.clientY;
            canvas.setPointerCapture?.(event.pointerId);
            canvas.style.cursor = 'grabbing';
            renderer.noteInteraction?.();
            event.preventDefault();
          };

          const onStudioPointerMove = (event: PointerEvent) => {
            if (lightingSpaceRef.current !== 'studio' || !dragState.active || dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - dragState.x;
            const dy = event.clientY - dragState.y;
            dragState.x = event.clientX;
            dragState.y = event.clientY;
            if (Math.abs(dx) + Math.abs(dy) < 0.01) return;

            cameraUp.set(0, 1, 0).applyQuaternion(renderer.camera.quaternion).normalize();
            cameraRight.set(1, 0, 0).applyQuaternion(renderer.camera.quaternion).normalize();
            yaw.setFromAxisAngle(cameraUp, dx * radiansPerPixel);
            pitch.setFromAxisAngle(cameraRight, dy * radiansPerPixel);
            renderer.globe.quaternion.premultiply(yaw).premultiply(pitch).normalize();
            renderer.noteInteraction?.();
            event.preventDefault();
          };

          const onStudioPointerUp = (event: PointerEvent) => endStudioDrag(event);
          const onStudioPointerCancel = (event: PointerEvent) => endStudioDrag(event);
          canvas.addEventListener('pointerdown', onStudioPointerDown);
          canvas.addEventListener('pointermove', onStudioPointerMove);
          canvas.addEventListener('pointerup', onStudioPointerUp);
          canvas.addEventListener('pointercancel', onStudioPointerCancel);
          renderer.controls.enableRotate = lightingSpaceRef.current === 'geo';
          canvas.style.cursor = lightingSpaceRef.current === 'studio' ? 'grab' : '';

          runtime.removeStudioDragListeners = () => {
            canvas.removeEventListener('pointerdown', onStudioPointerDown);
            canvas.removeEventListener('pointermove', onStudioPointerMove);
            canvas.removeEventListener('pointerup', onStudioPointerUp);
            canvas.removeEventListener('pointercancel', onStudioPointerCancel);
            canvas.style.cursor = '';
          };
        }

        runtime.removeFrameListener = renderer.addFrameListener(() => {
          atmosphere.update();
          const now = performance.now();
          if (now - overlayUpdateAtRef.current >= 80) {
            overlayUpdateAtRef.current = now;
            setLightOverlayPositions(projectLightOverlays(renderer, config));
          }
        });
        runtime.removePerformanceListener = renderer.addPerformanceListener((snapshot: PerformanceSnapshot) => setMetrics(snapshot));
        renderer.setIdleMotionSuppressed(true);
        renderer.setIdleMotionSpeedMultiplier(0);
        renderer.visualIdleMotion.landSpeed = 0;
        renderer.visualIdleMotion.oceanSpeed = 0;
        renderer.start();
        runtimeRef.current = runtime;
        setRuntimeConfig(config);
        setLightState({ ...productionLights });
        setEffectState({ ...productionEffects });
        setCrimsonRimStrength(Number(config.crimsonRim.rimStrength ?? 1.05));
        setBloomSettings({
          strength: Number(config.bloom.strength ?? 1.512),
          radius: Number(config.bloom.radius ?? 0.397),
          threshold: Number(config.bloom.threshold ?? 0.3),
          resolutionScale: Number(config.bloom.resolutionScale ?? 1),
        });
        setDirty(false);
        setStatus('Production lighting baseline loaded. Globe motion is paused for A/B inspection.');
      } catch (error) {
        console.error('Lighting Audit failed to mount', error);
        setStatus(error instanceof Error ? error.message : 'Lighting Audit failed to load.');
      }
    };

    void mount();
    return () => {
      cancelled = true;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.removePerformanceListener?.();
      runtime.removeFrameListener?.();
      runtime.removeStudioDragListeners?.();
      runtime.extraLights.forEach((light) => runtime.renderer.scene.remove(light));
      runtime.atmosphere?.dispose?.();
      runtime.renderer.scene.background = runtime.backgroundTexture;
      runtime.renderer?.dispose?.();
      runtimeRef.current = null;
    };
  }, []);

  const setLight = (key: LightKey, enabled: boolean, markDirty = true) => {
    const runtime = runtimeRef.current;
    const light = runtime?.lights[key];
    if (light) light.visible = enabled;
    runtime?.renderer?.noteInteraction?.();
    setLightState((current) => ({ ...current, [key]: enabled }));
    if (markDirty) setDirty(true);
  };

  const setEffect = (key: EffectKey, enabled: boolean, markDirty = true) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { renderer, atmosphere, config } = runtime;
    switch (key) {
      case 'backgroundGradient':
        renderer.scene.background = enabled ? runtime.backgroundTexture : null;
        break;
      case 'backgroundHaze':
        if (atmosphere.backgroundHazeMesh) atmosphere.backgroundHazeMesh.visible = enabled;
        if (atmosphere.backgroundGroup) atmosphere.backgroundGroup.visible = enabled || effectState.backgroundGlow;
        break;
      case 'backgroundGlow':
        if (atmosphere.backgroundGlowMesh) atmosphere.backgroundGlowMesh.visible = enabled;
        if (atmosphere.backgroundGroup) atmosphere.backgroundGroup.visible = enabled || effectState.backgroundHaze;
        break;
      case 'innerAtmosphere':
        if (atmosphere.innerMesh) atmosphere.innerMesh.visible = enabled;
        break;
      case 'outerAtmosphere':
        if (atmosphere.outerMesh) atmosphere.outerMesh.visible = enabled;
        break;
      case 'crimsonRimShell':
        if (atmosphere.rimMesh) atmosphere.rimMesh.visible = enabled;
        break;
      case 'bloom':
        if (renderer.bloomPass) renderer.bloomPass.enabled = enabled;
        break;
      case 'graphiteFacet':
        runtime.setFacetBoost(renderer.landMaterial, enabled ? config.materials.land.graphiteFacetBoost : 0);
        break;
      case 'landEmissive':
        renderer.landMaterial.emissiveIntensity = enabled ? config.materials.land.emissiveStrength : 0;
        break;
      case 'oceanEmissive':
        renderer.oceanMesh.material.emissiveIntensity = enabled ? config.materials.ocean.emissiveStrength : 0;
        break;
      default:
        break;
    }
    renderer.noteInteraction?.();
    setEffectState((current) => ({ ...current, [key]: enabled }));
    if (markDirty) setDirty(true);
  };

  const setRimStrengthLive = (value: number, markDirty = true) => {
    const next = THREE.MathUtils.clamp(Number(value), 0, 3);
    const runtime = runtimeRef.current;
    if (runtime?.atmosphere?.rimMaterial?.uniforms?.rimStrength) {
      runtime.atmosphere.rimMaterial.uniforms.rimStrength.value = next;
    }
    runtime?.renderer?.noteInteraction?.();
    setCrimsonRimStrength(next);
    if (markDirty) setDirty(true);
  };

  const setBloomSettingsLive = (patch: Partial<BloomSettings>, markDirty = true) => {
    setBloomSettings((current) => {
      const next: BloomSettings = {
        strength: THREE.MathUtils.clamp(Number(patch.strength ?? current.strength), 0, 4),
        radius: THREE.MathUtils.clamp(Number(patch.radius ?? current.radius), 0, 1),
        threshold: THREE.MathUtils.clamp(Number(patch.threshold ?? current.threshold), 0, 1),
        resolutionScale: THREE.MathUtils.clamp(Number(patch.resolutionScale ?? current.resolutionScale), 0.35, 1),
      };
      const runtime = runtimeRef.current;
      runtime?.renderer?.setBloomSettings?.(next);
      if (runtime) runtime.config.bloom = { ...next };
      return next;
    });
    if (markDirty) setDirty(true);
  };

  const saveProductionState = async () => {
    const runtime = runtimeRef.current;
    if (!runtime || saving) return;
    setSaving(true);
    setStatus('Saving lighting and effects to the production globe config…');
    try {
      const response = await fetch('/api/admin/globe/lighting-audit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: {
            lights: lightState,
            effects: effectState,
            crimsonRimStrength,
            bloomSettings,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());

      runtime.productionLights = { ...lightState };
      runtime.productionEffects = { ...effectState };
      runtime.productionRimStrength = crimsonRimStrength;
      runtime.productionBloomSettings = { ...bloomSettings };
      runtime.config.renderEffects = { ...effectState };
      runtime.config.crimsonRim.rimStrength = crimsonRimStrength;
      runtime.config.bloom = { ...bloomSettings };
      LIGHTS.forEach((light) => {
        if (runtime.config.lights[light.key]) runtime.config.lights[light.key].enabled = lightState[light.key];
      });
      setRuntimeConfig({
        ...runtime.config,
        lights: { ...runtime.config.lights },
        renderEffects: { ...effectState },
        crimsonRim: { ...runtime.config.crimsonRim },
        bloom: { ...bloomSettings },
      });
      setDirty(false);
      setStatus('Saved. This lighting/effects state is now the production globe baseline in GlobeRuntimeConfig.js.');
    } catch (error) {
      console.error('Failed to save lighting audit state', error);
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const restoreProduction = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    LIGHTS.forEach((light) => setLight(light.key, runtime.productionLights[light.key], false));
    EFFECTS.forEach((effect) => setEffect(effect.key, runtime.productionEffects[effect.key], false));
    setRimStrengthLive(runtime.productionRimStrength, false);
    setBloomSettingsLive(runtime.productionBloomSettings, false);
    setDirty(false);
    setStatus('Restored the production lighting/effects baseline.');
  };

  const disableAllLights = () => {
    LIGHTS.forEach((light) => setLight(light.key, false));
    setStatus('All light sources disabled. Material emissive/effects are unchanged.');
  };

  const enableAllLights = () => {
    LIGHTS.forEach((light) => setLight(light.key, true));
    setStatus('All configured light sources enabled for comparison.');
  };

  const soloLight = (key: LightKey) => {
    LIGHTS.forEach((light) => setLight(light.key, light.key === key));
    setStatus(`Soloing ${LIGHTS.find((light) => light.key === key)?.label ?? key}. Effects remain unchanged.`);
  };

  const changeLightingSpace = (mode: LightingSpaceMode) => {
    lightingSpaceRef.current = mode;
    setLightingSpace(mode);
    const renderer = runtimeRef.current?.renderer;
    if (renderer?.controls) renderer.controls.enableRotate = mode === 'geo';
    const canvas = renderer?.renderer?.domElement as HTMLCanvasElement | undefined;
    if (canvas) canvas.style.cursor = mode === 'studio' ? 'grab' : '';
    renderer?.noteInteraction?.();
    setStatus(mode === 'studio'
      ? 'Studio-fixed lighting: drag rotates the globe beneath the stationary light rig. Wheel zoom remains active.'
      : 'Geo-locked comparison: drag orbits the camera around the globe as before.');
  };

  const toggleSpin = () => {
    const next = !spinning;
    setSpinning(next);
    const renderer = runtimeRef.current?.renderer;
    renderer?.setIdleMotionSuppressed?.(!next);
    renderer?.setIdleMotionSpeedMultiplier?.(next ? 1 : 0);
    if (!next && renderer?.visualIdleMotion) {
      renderer.visualIdleMotion.landSpeed = 0;
      renderer.visualIdleMotion.oceanSpeed = 0;
    }
    renderer?.noteInteraction?.();
  };

  const productionActiveCount = useMemo(
    () => LIGHTS.filter((light) => runtimeConfig && configuredLightEnabled(light.key, runtimeConfig)).length,
    [runtimeConfig],
  );
  const activeCount = LIGHTS.filter((light) => lightState[light.key]).length;
  const activeEffects = EFFECTS.filter((effect) => effectState[effect.key]).length;

  return (
    <div className="h-full min-h-0 overflow-auto bg-[#050608] text-zinc-100 xl:overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1900px] flex-col gap-3 p-3 lg:p-4">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-[rgba(12,14,18,0.82)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-red-300"><Lightbulb size={14} /><span className="text-[9px] font-bold uppercase tracking-[0.2em]">Production renderer inspection</span></div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-white">Globe Lighting Audit</h1>
              <p className="max-w-3xl text-[10px] text-zinc-500">Live production materials and effects. Click the light boxes around the globe or use the inspector.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center rounded-lg border border-white/10 bg-black/35 p-0.5">
              <span className="px-2 text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-600">Lighting space</span>
              <button
                type="button"
                onClick={() => changeLightingSpace('geo')}
                aria-pressed={lightingSpace === 'geo'}
                className={`h-7 rounded-md px-2 text-[9px] font-semibold transition ${lightingSpace === 'geo' ? 'bg-white/[0.09] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Geo-locked
              </button>
              <button
                type="button"
                onClick={() => changeLightingSpace('studio')}
                aria-pressed={lightingSpace === 'studio'}
                className={`h-7 rounded-md px-2 text-[9px] font-semibold transition ${lightingSpace === 'studio' ? 'bg-red-500/15 text-red-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Studio-fixed
              </button>
            </div>
            <button type="button" onClick={toggleSpin} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white">
              {spinning ? <Pause size={12} /> : <Play size={12} />}{spinning ? 'Pause' : 'Spin'}
            </button>
            <button type="button" onClick={disableAllLights} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white">
              <EyeOff size={12} />Lights off
            </button>
            <button type="button" onClick={restoreProduction} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white">
              <RotateCcw size={12} />Restore
            </button>
            <button
              type="button"
              onClick={() => void saveProductionState()}
              disabled={!runtimeConfig || saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-400/35 bg-red-500/12 px-2.5 text-[10px] font-semibold text-red-100 hover:border-red-300/55 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save size={12} />{saving ? 'Saving…' : dirty ? 'Save state*' : 'Save state'}
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.58fr)_minmax(360px,0.62fr)]">
          <section className="relative min-h-[540px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#020305] shadow-[0_30px_90px_rgba(0,0,0,0.42)] xl:min-h-0">
            <div ref={viewportRef} className="absolute inset-0" aria-label="SwingSphere production globe lighting preview" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_35%,rgba(0,0,0,0.18)_100%)]" />
            <LightViewportOverlay positions={lightOverlayPositions} config={runtimeConfig} lightState={lightState} onToggle={setLight} />

            <div className="pointer-events-none absolute left-3 top-3 z-30 max-w-[300px] rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.17em] text-red-300">Live renderer</span>
                <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-zinc-500">light boxes toggle live</span>
              </div>
              <p className="mt-1 text-[10px] text-zinc-400">{lightingSpace === 'studio' ? 'Drag globe under fixed lights · wheel to zoom' : 'Drag to orbit · wheel to zoom'}</p>
              <p className="mt-0.5 line-clamp-2 text-[9px] leading-3.5 text-zinc-600">{status}</p>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              <Metric label="Active lights" value={`${activeCount}/${LIGHTS.length}`} />
              <Metric label="Production" value={runtimeConfig ? `${productionActiveCount}/${LIGHTS.length}` : '—'} />
              <Metric label="Draw calls" value={metrics.drawCalls != null ? String(metrics.drawCalls) : '—'} />
              <Metric label="Render cost" value={metrics.averageRenderCostMs != null ? `${metrics.averageRenderCostMs.toFixed(2)} ms` : '—'} />
              <Metric label="Frame" value={metrics.framePolicy ? `${metrics.framePolicy}${metrics.targetFps ? ` · ${metrics.targetFps}fps` : ''}` : '—'} />
            </div>
          </section>

          <aside className="min-h-0 space-y-2 xl:overflow-y-auto xl:pr-1">
            <InspectorPanel
              title="Light Sources"
              eyebrow="Primary controls"
              icon={<Sun size={14} />}
              open={openPanels.lights}
              onToggle={() => setOpenPanels((current) => ({ ...current, lights: !current.lights }))}
              summary={<span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[9px] font-mono text-zinc-300">{activeCount}/{LIGHTS.length}</span>}
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={enableAllLights} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white">All on</button>
                <button type="button" onClick={disableAllLights} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white">All off</button>
                <button type="button" onClick={restoreProduction} className="rounded-md border border-red-400/20 bg-red-500/[0.07] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-red-200">Production</button>
                <span className="ml-auto text-[8px] uppercase tracking-wider text-zinc-600">click viewport boxes too</span>
              </div>
              <div className="space-y-1.5">
                {LIGHTS.map((light) => {
                  const cfg = runtimeConfig?.lights?.[light.key];
                  const productionEnabled = runtimeConfig ? configuredLightEnabled(light.key, runtimeConfig) : false;
                  const expanded = expandedLights.has(light.key);
                  return (
                    <article key={light.key} className={`overflow-hidden rounded-lg border transition ${lightState[light.key] ? 'border-white/15 bg-white/[0.04]' : 'border-white/[0.06] bg-black/20'}`}>
                      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedLights((current) => {
                            const next = new Set(current);
                            if (next.has(light.key)) next.delete(light.key); else next.add(light.key);
                            return next;
                          })}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {expanded ? <ChevronDown size={12} className="shrink-0 text-zinc-600" /> : <ChevronRight size={12} className="shrink-0 text-zinc-600" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[10px] font-semibold text-zinc-100">{light.label}</span>
                              <span className={`shrink-0 rounded border px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider ${productionEnabled ? 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200' : 'border-zinc-600/30 bg-zinc-500/[0.06] text-zinc-600'}`}>
                                {productionEnabled ? 'prod' : 'off-prod'}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[8px] text-zinc-600">{sourcePhrase(cfg)} · {cfg?.intensity != null ? Number(cfg.intensity).toFixed(2) : '—'}</span>
                          </span>
                        </button>
                        <button type="button" onClick={() => soloLight(light.key)} className="rounded border border-white/[0.08] bg-black/30 px-1.5 py-1 text-[7px] font-bold uppercase tracking-wider text-zinc-500 hover:border-red-400/30 hover:text-red-200">Solo</button>
                        <Toggle checked={lightState[light.key]} onChange={(enabled) => setLight(light.key, enabled)} label={light.label} />
                      </div>
                      {expanded && (
                        <div className="border-t border-white/[0.06] px-3 py-2">
                          <p className="text-[9px] leading-3.5 text-zinc-500">{light.description}</p>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[8px] text-zinc-600">
                            <span>Type <b className="font-normal text-zinc-400">{light.kind}</b></span>
                            <span>Intensity <b className="font-normal text-zinc-400">{cfg?.intensity != null ? Number(cfg.intensity).toFixed(2) : '—'}</b></span>
                            <span className="col-span-2">XYZ <b className="font-normal text-zinc-400">{formatVector(cfg)}</b></span>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </InspectorPanel>

            <InspectorPanel
              title="Atmosphere & Effects"
              eyebrow="Non-light contributors"
              icon={<Sparkles size={14} />}
              open={openPanels.effects}
              onToggle={() => setOpenPanels((current) => ({ ...current, effects: !current.effects }))}
              summary={<span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[9px] font-mono text-zinc-300">{activeEffects}/{EFFECTS.length}</span>}
            >
              <div className="space-y-1.5">
                {EFFECTS.map((effect) => {
                  const expanded = expandedEffects.has(effect.key);
                  return (
                    <article key={effect.key} className={`overflow-hidden rounded-lg border ${effectState[effect.key] ? 'border-white/12 bg-white/[0.035]' : 'border-white/[0.06] bg-black/20 opacity-70'}`}>
                      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedEffects((current) => {
                            const next = new Set(current);
                            if (next.has(effect.key)) next.delete(effect.key); else next.add(effect.key);
                            return next;
                          })}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {expanded ? <ChevronDown size={12} className="shrink-0 text-zinc-600" /> : <ChevronRight size={12} className="shrink-0 text-zinc-600" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[10px] font-semibold text-zinc-100">{effect.label}</span>
                              <span className={`shrink-0 rounded border px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider ${COST_CLASS[effect.cost]}`}>{effect.cost}</span>
                            </span>
                          </span>
                        </button>
                        <Toggle checked={effectState[effect.key]} onChange={(enabled) => setEffect(effect.key, enabled)} label={effect.label} />
                      </div>
                      {expanded && (
                        <div className="border-t border-white/[0.06] px-3 py-2">
                          <p className="text-[9px] leading-3.5 text-zinc-500">{effect.description}</p>
                          {effect.key === 'crimsonRimShell' && (
                            <label className="mt-2 block rounded-md border border-red-400/15 bg-red-500/[0.045] p-2">
                              <span className="flex items-center justify-between gap-3 text-[8px] font-bold uppercase tracking-wider text-zinc-500">
                                <span>Rim intensity</span>
                                <span className="font-mono text-red-200">{crimsonRimStrength.toFixed(2)}</span>
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={2}
                                step={0.01}
                                value={crimsonRimStrength}
                                onChange={(event) => setRimStrengthLive(Number(event.target.value))}
                                className="mt-1.5 w-full accent-red-500"
                              />
                            </label>
                          )}
                          {effect.key === 'bloom' && (
                            <div className="mt-2 space-y-2 rounded-md border border-white/[0.06] bg-black/25 p-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-auto text-[8px] font-bold uppercase tracking-wider text-zinc-500">Bloom tuning</span>
                                {[1, 0.75, 0.6].map((scale) => (
                                  <button
                                    key={scale}
                                    type="button"
                                    onClick={() => setBloomSettingsLive({ resolutionScale: scale })}
                                    className={`rounded border px-1.5 py-1 text-[7px] font-bold uppercase tracking-wider ${Math.abs(bloomSettings.resolutionScale - scale) < 0.005
                                      ? 'border-red-400/30 bg-red-500/10 text-red-200'
                                      : 'border-white/[0.08] bg-black/30 text-zinc-500 hover:text-zinc-300'}`}
                                  >
                                    {Math.round(scale * 100)}%
                                  </button>
                                ))}
                              </div>
                              <label className="block">
                                <span className="flex justify-between text-[8px] text-zinc-500"><span>Resolution</span><span className="font-mono text-zinc-300">{Math.round(bloomSettings.resolutionScale * 100)}% · {Math.round(bloomSettings.resolutionScale * bloomSettings.resolutionScale * 100)}% pixel area</span></span>
                                <input type="range" min={0.35} max={1} step={0.05} value={bloomSettings.resolutionScale} onChange={(event) => setBloomSettingsLive({ resolutionScale: Number(event.target.value) })} className="mt-1 w-full accent-red-500" />
                              </label>
                              <label className="block">
                                <span className="flex justify-between text-[8px] text-zinc-500"><span>Strength</span><span className="font-mono text-zinc-300">{bloomSettings.strength.toFixed(3)}</span></span>
                                <input type="range" min={0} max={3} step={0.01} value={bloomSettings.strength} onChange={(event) => setBloomSettingsLive({ strength: Number(event.target.value) })} className="mt-1 w-full accent-red-500" />
                              </label>
                              <label className="block">
                                <span className="flex justify-between text-[8px] text-zinc-500"><span>Radius</span><span className="font-mono text-zinc-300">{bloomSettings.radius.toFixed(3)}</span></span>
                                <input type="range" min={0} max={1} step={0.01} value={bloomSettings.radius} onChange={(event) => setBloomSettingsLive({ radius: Number(event.target.value) })} className="mt-1 w-full accent-red-500" />
                              </label>
                              <label className="block">
                                <span className="flex justify-between text-[8px] text-zinc-500"><span>Threshold</span><span className="font-mono text-zinc-300">{bloomSettings.threshold.toFixed(3)}</span></span>
                                <input type="range" min={0} max={1} step={0.01} value={bloomSettings.threshold} onChange={(event) => setBloomSettingsLive({ threshold: Number(event.target.value) })} className="mt-1 w-full accent-red-500" />
                              </label>
                              <p className="text-[8px] leading-3.5 text-zinc-600">Resolution is the primary performance knob. Lowering it reduces the pixels processed by the bloom chain without lowering the saved visual strength.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </InspectorPanel>

            <InspectorPanel
              title="Renderer Stats & Notes"
              eyebrow="Reference"
              icon={<Gauge size={14} />}
              open={openPanels.diagnostics}
              onToggle={() => setOpenPanels((current) => ({ ...current, diagnostics: !current.diagnostics }))}
              summary={<span className="text-[8px] uppercase tracking-wider text-zinc-600">optional</span>}
            >
              <div className="grid grid-cols-2 gap-1.5">
                <Metric label="FPS" value={metrics.averageFps != null ? metrics.averageFps.toFixed(1) : '—'} />
                <Metric label="Triangles" value={metrics.triangles != null ? String(metrics.triangles) : '—'} />
                <Metric label="Pixel ratio" value={metrics.pixelRatio != null ? metrics.pixelRatio.toFixed(2) : '—'} />
                <Metric label="Render cost" value={metrics.averageRenderCostMs != null ? `${metrics.averageRenderCostMs.toFixed(2)} ms` : '—'} />
              </div>
              <div className="mt-2 space-y-1.5">
                <InfoCard icon={<Lightbulb size={12} />} title="Production baseline" body={runtimeConfig ? `${productionActiveCount} of ${LIGHTS.length} configured entries are active in production. The four-light rig is Hemisphere, Key, Front Fill and Crimson Primary; Ambient, Under, Soft Key, Rear Fill, Legacy Crimson Back and Crimson Bounce are off.` : 'Loading production configuration…'} />
                <InfoCard icon={<Gauge size={12} />} title="Solo testing" body="Solo leaves atmosphere and render effects intact while disabling every other light, making overlapping fills easy to identify." />
                <InfoCard icon={<Sparkles size={12} />} title="Separate effects" body="Atmosphere shells, crimson rim, emissive floors and bloom can look like lighting even with every actual light disabled." />
              </div>
            </InspectorPanel>
          </aside>
        </main>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-xl">
    <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-200">{value}</p>
  </div>
);

const InfoCard: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({ icon, title, body }) => (
  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
    <div className="flex items-center gap-2 text-red-300">{icon}<h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-300">{title}</h3></div>
    <p className="mt-2 text-[10px] leading-4 text-zinc-500">{body}</p>
  </div>
);

export default LightingAuditPage;
