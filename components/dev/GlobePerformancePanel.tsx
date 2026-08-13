import React, { useEffect, useRef, useState } from 'react';
import type { ExplorerPerformanceSnapshot, GlobeQualityTier } from '../../lib/globePerformance';
import { GLOBE_PERFORMANCE_FIXTURE_COUNTS } from '../../data/globePerformanceFixtures';

type BenchmarkAccumulator = {
  startedAt: string;
  startingQualityTier: GlobeQualityTier;
  startingRoundTrips: number;
  startingResources: { geometries: number; textures: number };
  startingHeapBytes: number | null;
  startingContextLossCount: number;
  interactiveFps: number[];
  interactiveLowestFps: number[];
  transitionFps: number[];
  peaks: { drawCalls: number; triangles: number; geometries: number; textures: number };
};

type GlobePerformancePanelProps = {
  snapshot: ExplorerPerformanceSnapshot | null;
  onResetQuality: () => void;
};

const average = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const heapBytes = (): number | null => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return Number.isFinite(memory?.usedJSHeapSize) ? memory?.usedJSHeapSize ?? null : null;
};

const GlobePerformancePanel: React.FC<GlobePerformancePanelProps> = ({ snapshot, onResetQuality }) => {
  const [expanded, setExpanded] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const sessionRef = useRef<BenchmarkAccumulator | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const activeFixture = new URLSearchParams(window.location.search).get('perfFixture');
  const capabilityLabel = snapshot?.graphicsCapability === 'webgl2-hardware'
    ? 'full'
    : snapshot?.graphicsCapability === 'webgl2-degraded'
      ? 'degraded'
      : 'unsupported';

  const startBenchmark = () => {
    const current = snapshotRef.current;
    if (!current) return null;
    sessionRef.current = {
      startedAt: new Date().toISOString(),
      startingQualityTier: current.qualityTier,
      startingRoundTrips: current.roundTrips,
      startingResources: { geometries: current.geometries, textures: current.textures },
      startingHeapBytes: heapBytes(),
      startingContextLossCount: current.contextLossCount,
      interactiveFps: [],
      interactiveLowestFps: [],
      transitionFps: [],
      peaks: {
        drawCalls: current.drawCalls,
        triangles: current.triangles,
        geometries: current.geometries,
        textures: current.textures,
      },
    };
    setReport(null);
    setBenchmarking(true);
    return { started: true, at: sessionRef.current.startedAt };
  };

  const buildReport = (): Record<string, unknown> | null => {
    const session = sessionRef.current;
    const current = snapshotRef.current;
    if (!session || !current) return null;
    const endingHeapBytes = heapBytes();
    const resourceDelta = {
      geometries: current.geometries - session.startingResources.geometries,
      textures: current.textures - session.startingResources.textures,
      heapBytes: endingHeapBytes !== null && session.startingHeapBytes !== null
        ? endingHeapBytes - session.startingHeapBytes
        : null,
    };
    const mapPinSnapshot = (window as Window & {
      SwingSphereMapPinPerformance?: { getSnapshot?: () => unknown };
    }).SwingSphereMapPinPerformance?.getSnapshot?.() ?? null;
    return {
      schemaVersion: 1,
      performanceFixture: activeFixture,
      startedAt: session.startedAt,
      endedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
      globePixelRatio: current.pixelRatio,
      graphicsCapability: current.graphicsCapability,
      startingQualityTier: session.startingQualityTier,
      endingQualityTier: current.qualityTier,
      averageInteractiveFps: average(session.interactiveFps),
      lowestRecordedInteractiveFps: session.interactiveLowestFps.length
        ? Math.min(...session.interactiveLowestFps)
        : null,
      averageTransitionFps: average(session.transitionFps),
      globeToMapTransitionDurationMs: current.lastGlobeToMapDurationMs,
      mapToGlobeTransitionDurationMs: current.lastMapToGlobeDurationMs,
      peakDrawCalls: session.peaks.drawCalls,
      peakTriangleCount: session.peaks.triangles,
      peakGeometryCount: session.peaks.geometries,
      peakTextureCount: session.peaks.textures,
      contextLossEvents: current.contextLossCount - session.startingContextLossCount,
      globeMapRoundTrips: current.roundTrips - session.startingRoundTrips,
      startingResources: session.startingResources,
      endingResources: { geometries: current.geometries, textures: current.textures },
      resourceDelta,
      rendererResourcesIncreased: resourceDelta.geometries > 0 || resourceDelta.textures > 0,
      heapBytesIncreased: resourceDelta.heapBytes !== null && resourceDelta.heapBytes > 0,
      memoryOrRendererResourcesIncreased:
        resourceDelta.geometries > 0
        || resourceDelta.textures > 0
        || (resourceDelta.heapBytes !== null && resourceDelta.heapBytes > 0),
      loopRunning: current.loopRunning,
      mapMounted: current.mapMounted,
      activeListenerCount: current.activeListenerCount,
      mapPinSnapshot,
    };
  };

  const stopBenchmark = () => {
    const nextReport = buildReport();
    setBenchmarking(false);
    setReport(nextReport);
    return nextReport;
  };

  const copyReport = async () => {
    const nextReport = report ?? buildReport();
    if (!nextReport) return false;
    await navigator.clipboard.writeText(JSON.stringify(nextReport, null, 2));
    setReport(nextReport);
    return true;
  };

  useEffect(() => {
    if (!benchmarking || !snapshot || !sessionRef.current) return;
    const session = sessionRef.current;
    if (snapshot.framePolicy === 'interactive' && !snapshot.transitionActive && snapshot.interactiveAverageFps !== null) {
      session.interactiveFps.push(snapshot.interactiveAverageFps);
      if (snapshot.interactiveLowestFps !== null) session.interactiveLowestFps.push(snapshot.interactiveLowestFps);
    }
    if (snapshot.explorerMode.includes('-to-') && snapshot.transitionAverageFps !== null) {
      session.transitionFps.push(snapshot.transitionAverageFps);
    }
    session.peaks.drawCalls = Math.max(session.peaks.drawCalls, snapshot.drawCalls);
    session.peaks.triangles = Math.max(session.peaks.triangles, snapshot.triangles);
    session.peaks.geometries = Math.max(session.peaks.geometries, snapshot.geometries);
    session.peaks.textures = Math.max(session.peaks.textures, snapshot.textures);
  }, [benchmarking, snapshot]);

  useEffect(() => {
    const api = {
      getSnapshot: () => snapshotRef.current,
      startBenchmark,
      stopBenchmark,
      copyBenchmarkReport: copyReport,
      resetAutomaticQuality: onResetQuality,
    };
    (window as Window & { SwingSpherePerformance?: typeof api }).SwingSpherePerformance = api;
    return () => {
      delete (window as Window & { SwingSpherePerformance?: typeof api }).SwingSpherePerformance;
    };
  });

  if (!snapshot) return null;

  return (
    <div className="pointer-events-auto absolute right-6 top-[90px] z-[70] w-[min(360px,calc(100vw-48px))] rounded-xl border border-cyan-300/20 bg-[rgba(4,8,12,0.92)] text-xs text-slate-200 shadow-2xl">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold uppercase tracking-[0.2em] text-cyan-200">Performance</span>
        <span className="font-mono text-[11px] text-slate-400">
          {format(snapshot.averageFps, 0)} FPS · {snapshot.qualityTier}
        </span>
      </button>
      {expanded ? (
        <div className="max-h-[70vh] overflow-y-auto border-t border-white/10 p-4">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label="Mode" value={snapshot.explorerMode} />
            <Stat label="Frame policy" value={`${snapshot.framePolicy} / ${snapshot.targetFps}`} />
            <Stat label="Globe loop" value={snapshot.loopRunning ? 'running' : 'stopped'} />
            <Stat label="MapLibre" value={snapshot.mapMounted ? 'mounted' : 'unmounted'} />
            <Stat label="Capability" value={capabilityLabel} />
            <Stat label="Quality" value={snapshot.qualityTier} />
            <Stat label="Globe DPR" value={format(snapshot.pixelRatio, 2)} />
            <Stat label="Average FPS" value={format(snapshot.averageFps, 1)} />
            <Stat label="Frame time" value={`${format(snapshot.averageFrameTimeMs, 1)} ms`} />
            <Stat label="Worst frame" value={`${format(snapshot.recentWorstFrameTimeMs, 1)} ms`} />
            <Stat label="Approx 1% low" value={format(snapshot.approximateOnePercentLowFps, 1)} />
            <Stat label="Render cost" value={`${format(snapshot.averageRenderCostMs, 1)} ms`} />
            <Stat label="Draw calls" value={String(snapshot.drawCalls)} />
            <Stat label="Triangles" value={snapshot.triangles.toLocaleString()} />
            <Stat label="Points / lines" value={`${snapshot.points} / ${snapshot.lines}`} />
            <Stat label="Geometry / textures" value={`${snapshot.geometries} / ${snapshot.textures}`} />
            <Stat label="Source events" value={String(snapshot.sourceEventCount)} />
            <Stat label="Constructed pins" value={String(snapshot.constructedPinCount)} />
            <Stat label="Retained pin meshes" value={String(snapshot.retainedPinMeshCount)} />
            <Stat label="Retained label nodes" value={String(snapshot.retainedLabelNodeCount)} />
            <Stat label="Surface raycasts" value={String(snapshot.estimatedSurfaceRaycastCount)} />
            <Stat label="Pin build / dispose" value={`${format(snapshot.lastPinBuildDurationMs, 1)} / ${format(snapshot.lastPinDisposeDurationMs, 1)} ms`} />
            <Stat label="Pin rebuilds / disposed" value={`${snapshot.pinRebuildCount} / ${snapshot.disposedPinCount}`} />
            <Stat label="Source regions" value={String(snapshot.sourceRegionCount)} />
            <Stat label="Constructed regions" value={String(snapshot.constructedRegionCount)} />
            <Stat label="Retained region meshes" value={String(snapshot.retainedRegionMeshCount)} />
            <Stat label="Region raycasts" value={String(snapshot.estimatedRegionSurfaceRaycastCount)} />
            <Stat label="Region build / dispose" value={`${format(snapshot.lastRegionBuildDurationMs, 1)} / ${format(snapshot.lastRegionDisposeDurationMs, 1)} ms`} />
            <Stat label="Region rebuilds / disposed" value={`${snapshot.regionRebuildCount} / ${snapshot.disposedRegionCount}`} />
            <Stat label="Visible regions" value={String(snapshot.visibleRegionCount)} />
            <Stat label="Visible pins" value={String(snapshot.visiblePinCount)} />
            <Stat label="Pin meshes" value={String(snapshot.pinMeshCount)} />
            <Stat label="Ripples" value={String(snapshot.animatedRippleCount)} />
            <Stat label="Context losses" value={String(snapshot.contextLossCount)} />
            <Stat label="Globe → map" value={`${format(snapshot.lastGlobeToMapDurationMs, 0)} ms`} />
            <Stat label="Map → globe" value={`${format(snapshot.lastMapToGlobeDurationMs, 0)} ms`} />
            <Stat label="Round trips" value={String(snapshot.roundTrips)} />
            <Stat label="Listeners" value={String(snapshot.activeListenerCount)} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[9px] uppercase tracking-[0.16em] text-slate-500">Deterministic fixture</div>
            <div className="grid grid-cols-4 gap-1.5">
              {GLOBE_PERFORMANCE_FIXTURE_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search);
                    params.set('perf', '1');
                    params.set('perfFixture', String(count));
                    window.location.search = params.toString();
                  }}
                  className={activeFixture === String(count)
                    ? 'rounded-md border border-cyan-300/45 bg-cyan-300/15 px-2 py-1.5 font-semibold text-cyan-100'
                    : 'rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-slate-300'}
                >
                  {count.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={benchmarking ? stopBenchmark : startBenchmark} className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 font-semibold text-cyan-100">
              {benchmarking ? 'Stop benchmark' : 'Start benchmark'}
            </button>
            <button type="button" onClick={() => void copyReport()} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-semibold text-slate-200">
              Copy JSON
            </button>
            <button type="button" onClick={onResetQuality} className="col-span-2 rounded-md border border-white/10 px-3 py-2 text-slate-400">
              Reset automatic quality
            </button>
          </div>
          {report ? <p className="mt-3 text-[11px] text-emerald-300">Benchmark report ready to copy.</p> : null}
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            Console API: window.SwingSpherePerformance
          </p>
        </div>
      ) : null}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
    <div className="truncate font-mono text-[11px] text-slate-200">{value}</div>
  </div>
);

const format = (value: number | null, digits: number): string =>
  value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);

export default GlobePerformancePanel;
