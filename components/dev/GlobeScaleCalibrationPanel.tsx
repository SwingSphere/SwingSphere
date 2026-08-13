import React, { useState } from 'react';
import { GLOBE_SCALE_FIXTURES } from '../../data/globeScaleCalibrationFixtures';

export type GlobePresentationConfig = {
  globeScale: number;
  camera: {
    fieldOfView: number;
    defaultDistanceWorld: number;
    minDistanceWorld: number;
    maxDistanceWorld: number;
    worldEnterDistanceWorld: number;
    worldExitDistanceWorld: number;
    clusterArrivalDistanceWorld: number;
    listingArrivalDistanceWorld: number;
    listingArrivalFieldOfView: number;
  };
  pins: {
    baseScale: number;
    hoverScale: number;
    selectedScale: number;
    clusterScale: number;
    rippleScale: number;
    hitScale: number;
    surfaceOffsetRadius: number;
    stemHeightRadius: number;
    stemRadiusRadius: number;
    tipRadiusRadius: number;
    glowInnerRadiusRadius: number;
    glowOuterRadiusRadius: number;
    hitRadiusRadius: number;
    hitHeightExtraRadius: number;
    hoverLiftRadius: number;
    selectedLiftRadius: number;
    closeDistanceScale: number;
    worldDistanceScale: number;
    distanceScaleCurvePower: number;
  };
  labels: {
    selectedOffsetPx: number;
    hoverOffsetPx: number;
  };
};

type GlobeScaleCalibrationPanelProps = {
  value: GlobePresentationConfig;
  fixtureId: string;
  presets: Record<'current' | 'radiusOnly' | 'cameraOnly' | 'recommended', GlobePresentationConfig>;
  onChange: (value: GlobePresentationConfig) => void;
  onFixtureChange: (fixtureId: string) => void;
  onFocusFixture: () => void;
};

const GlobeScaleCalibrationPanel: React.FC<GlobeScaleCalibrationPanelProps> = ({
  value,
  fixtureId,
  presets,
  onChange,
  onFixtureChange,
  onFocusFixture,
}) => {
  const [message, setMessage] = useState<string | null>(null);

  const update = (path: string, nextValue: number) => {
    const [section, key] = path.split('.');
    if (!key) {
      onChange({ ...value, [section]: nextValue });
      return;
    }
    onChange({
      ...value,
      [section]: {
        ...(value[section as keyof GlobePresentationConfig] as object),
        [key]: nextValue,
      },
    });
  };

  const copyConfig = async (typescript = false) => {
    const json = JSON.stringify(value, null, 2);
    const payload = typescript
      ? `export const GLOBE_PRESENTATION = ${json} as const;`
      : json;
    await navigator.clipboard?.writeText(payload);
    setMessage(typescript ? 'Copied TypeScript values.' : 'Copied JSON.');
  };

  return (
    <section
      data-testid="globe-scale-calibration-panel"
      className="max-h-[calc(100vh-150px)] overflow-auto rounded-xl border border-red-400/30 bg-[rgba(7,9,13,0.92)] p-4 text-gray-200 shadow-2xl backdrop-blur-xl"
      aria-label="Globe scale calibration"
    >
      <div className="mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">Globe Scale Calibration</h2>
        <p className="mt-1 text-[11px] leading-4 text-gray-400">Dev-only presentation tuning. Clustering semantics are unchanged.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <PresetButton label="Current production" onClick={() => onChange(clone(presets.current))} />
        <PresetButton label="Recommended" onClick={() => onChange(clone(presets.recommended))} accent />
        <PresetButton label="Radius only" onClick={() => onChange(clone(presets.radiusOnly))} />
        <PresetButton label="Camera only" onClick={() => onChange(clone(presets.cameraOnly))} />
      </div>

      <div className="mb-4 rounded-lg border border-white/[0.08] bg-black/30 p-3">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400" htmlFor="globe-scale-fixture">Geographic fixture</label>
        <select
          id="globe-scale-fixture"
          data-testid="globe-scale-fixture-select"
          value={fixtureId}
          onChange={(event) => onFixtureChange(event.target.value)}
          className="mt-2 w-full rounded-md border border-white/10 bg-[#11141a] px-2 py-2 text-xs text-gray-100"
        >
          {GLOBE_SCALE_FIXTURES.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.name}</option>)}
        </select>
        <button type="button" onClick={onFocusFixture} className="mt-2 w-full rounded-md border border-red-400/35 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-red-100 hover:bg-red-500/20">Focus fixture</button>
      </div>

      <div className="space-y-2">
        <Control label="Globe scale" path="globeScale" value={value.globeScale} min={0.9} max={1.3} step={0.01} onChange={update} />
        <Control label="Camera FOV" path="camera.fieldOfView" value={value.camera.fieldOfView} min={35} max={55} step={0.5} onChange={update} />
        <Control label="Default distance" path="camera.defaultDistanceWorld" value={value.camera.defaultDistanceWorld} min={6.8} max={10} step={0.05} onChange={update} />
        <Control label="Pin base scale" path="pins.baseScale" value={value.pins.baseScale} min={0.45} max={1.2} step={0.01} onChange={update} />
        <Control label="Pin hover scale" path="pins.hoverScale" value={value.pins.hoverScale} min={1} max={1.5} step={0.01} onChange={update} />
        <Control label="Pin selected scale" path="pins.selectedScale" value={value.pins.selectedScale} min={1} max={1.7} step={0.01} onChange={update} />
        <Control label="Ripple scale" path="pins.rippleScale" value={value.pins.rippleScale} min={0.35} max={1.4} step={0.01} onChange={update} />
        <Control label="Surface offset / radius" path="pins.surfaceOffsetRadius" value={value.pins.surfaceOffsetRadius} min={0.0005} max={0.006} step={0.0001} digits={4} onChange={update} />
        <Control label="Selected label offset" path="labels.selectedOffsetPx" value={value.labels.selectedOffsetPx} min={28} max={90} step={1} onChange={update} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyConfig(false)} className="rounded-md border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide hover:bg-white/[0.06]">Copy JSON</button>
        <button type="button" onClick={() => void copyConfig(true)} className="rounded-md border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide hover:bg-white/[0.06]">Copy TypeScript</button>
      </div>
      {message ? <p className="mt-2 text-[10px] text-red-200">{message}</p> : null}
    </section>
  );
};

const PresetButton: React.FC<{ label: string; onClick: () => void; accent?: boolean }> = ({ label, onClick, accent = false }) => (
  <button type="button" onClick={onClick} className={`rounded-md border px-2 py-2 text-[10px] font-bold uppercase tracking-wide ${accent ? 'border-red-400/50 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'}`}>{label}</button>
);

const Control: React.FC<{
  label: string;
  path: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  onChange: (path: string, value: number) => void;
}> = ({ label, path, value, min, max, step, digits = 2, onChange }) => (
  <label className="grid grid-cols-[1fr_64px] items-center gap-x-3 gap-y-1 text-[11px] text-gray-300">
    <span>{label}</span>
    <output className="text-right font-mono text-[10px] text-gray-400">{value.toFixed(digits)}</output>
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(path, Number(event.target.value))}
      className="col-span-2 h-1.5 w-full accent-red-500"
    />
  </label>
);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export default GlobeScaleCalibrationPanel;
