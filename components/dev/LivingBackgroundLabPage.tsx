import React, { useState } from 'react';
import LivingLowPolyBackground, { getLivingBackgroundMeshStats } from '../LivingLowPolyBackground';
import {
  readLivingBackgroundStoredState,
  saveLivingBackgroundStoredState,
  type LivingBackgroundStoredState,
} from '../../lib/livingBackgroundSettings';

const sliderClass = 'w-full accent-red-500';

export default function LivingBackgroundLabPage() {
  const [savedState] = useState(readLivingBackgroundStoredState);
  const [opacity, setOpacity] = useState(savedState.opacity ?? 70);
  const [morph, setMorph] = useState(savedState.morph ?? 100);
  const [morphSpeed, setMorphSpeed] = useState(savedState.morphSpeed ?? 100);
  const [panelSpeed, setPanelSpeed] = useState(savedState.panelSpeed ?? 100);
  const [panelPulse, setPanelPulse] = useState(savedState.panelPulse ?? 100);
  const [panelFlicker, setPanelFlicker] = useState(savedState.panelFlicker ?? 5);
  const [lines, setLines] = useState(savedState.lines ?? 22);
  const [glow, setGlow] = useState(savedState.glow ?? 35);
  const [blur, setBlur] = useState(savedState.blur);
  const [density, setDensity] = useState(savedState.density);
  const [showContent, setShowContent] = useState(savedState.showContent ?? true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const handleSaveState = () => {
    const state: LivingBackgroundStoredState = {
      opacity,
      morph,
      morphSpeed,
      panelSpeed,
      panelPulse,
      panelFlicker,
      lines,
      glow,
      blur,
      density,
      showContent,
    };

    if (saveLivingBackgroundStoredState(state)) {
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 1400);
      return;
    }
    setSaveStatus('idle');
  };

  return (
    <main className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden bg-[#030405] text-white">
      <LivingLowPolyBackground
        opacity={opacity / 100}
        morphStrength={morph / 100}
        morphSpeed={morphSpeed / 100}
        colorSpeed={panelSpeed / 100}
        colorStrength={panelPulse / 100}
        panelFlicker={panelFlicker / 100}
        lineStrength={lines / 100}
        glowStrength={glow / 100}
        blurPx={blur}
        density={density}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,5,0.34)_0%,rgba(3,4,5,0.10)_42%,transparent_72%)]" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-7xl items-center px-6 py-14 lg:px-8">
        {showContent ? (
          <section className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-red-300">Development prototype</p>
            <h1 className="mt-4 text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
              Living low-poly
              <span className="mt-2 block text-red-500">background.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">
              A lightweight SVG interpretation of the current SwingSphere background: angular facets drift slowly,
              dark panels breathe in and out, and the lower field gradually wakes up in crimson.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <div className="ss-glass ss-glass--liquid rounded-2xl px-4 py-3 text-sm text-gray-300">Direct SVG loop</div>
              <div className="ss-glass ss-glass--liquid rounded-2xl px-4 py-3 text-sm text-gray-300">18 FPS cap</div>
              <div className="ss-glass ss-glass--liquid rounded-2xl px-4 py-3 text-sm text-gray-300">Off-screen pause</div>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="absolute right-5 top-5 z-20 max-h-[calc(100vh-2.5rem)] w-[min(92vw,380px)] overflow-y-auto rounded-3xl border border-white/10 bg-black/55 p-5 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Mesh controls</p>
            <p className="mt-1 text-xs leading-5 text-gray-400">Tune the prototype live before we try it behind the real homepage.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleSaveState}
              className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/20"
            >
              {saveStatus === 'saved' ? 'Saved ✓' : 'Save state'}
            </button>
            <button
              type="button"
              onClick={() => setShowContent((value) => !value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10"
            >
              {showContent ? 'Hide copy' : 'Show copy'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs font-semibold text-gray-300">
          <label>
            <span className="mb-2 flex justify-between"><span>Opacity</span><span>{opacity}%</span></span>
            <input className={sliderClass} type="range" min="25" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Morph amount</span><span>{morph}%</span></span>
            <input className={sliderClass} type="range" min="0" max="180" value={morph} onChange={(event) => setMorph(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Morph speed</span><span>{morphSpeed}%</span></span>
            <input className={sliderClass} type="range" min="10" max="300" value={morphSpeed} onChange={(event) => setMorphSpeed(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Panel speed</span><span>{panelSpeed}%</span></span>
            <input className={sliderClass} type="range" min="5" max="300" value={panelSpeed} onChange={(event) => setPanelSpeed(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Panel pulse</span><span>{panelPulse}%</span></span>
            <input className={sliderClass} type="range" min="0" max="180" value={panelPulse} onChange={(event) => setPanelPulse(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Panel flicker</span><span>{panelFlicker}%</span></span>
            <input className={sliderClass} type="range" min="0" max="15" value={panelFlicker} onChange={(event) => setPanelFlicker(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Lines</span><span>{lines}%</span></span>
            <input className={sliderClass} type="range" min="0" max="100" value={lines} onChange={(event) => setLines(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-2 flex justify-between"><span>Line glow</span><span>{glow}%</span></span>
            <input className={sliderClass} type="range" min="0" max="100" value={glow} onChange={(event) => setGlow(Number(event.target.value))} />
          </label>
          <label className="col-span-2">
            <span className="mb-2 flex justify-between">
              <span>Density</span>
              <span>{density}% · {getLivingBackgroundMeshStats(density).triangles} facets</span>
            </span>
            <input className={sliderClass} type="range" min="50" max="200" step="5" value={density} onChange={(event) => setDensity(Number(event.target.value))} />
            <span className="mt-1 block font-normal text-gray-500">100% is the current mesh. Lower values use larger, fewer polygons; higher values create a finer field.</span>
          </label>
          <label className="col-span-2">
            <span className="mb-2 flex justify-between"><span>Blur</span><span>{blur}px</span></span>
            <input className={sliderClass} type="range" min="0" max="8" step="0.5" value={blur} onChange={(event) => setBlur(Number(event.target.value))} />
            <span className="mt-1 block font-normal text-gray-500">0px avoids the full-layer blur filter; use this for a quick performance A/B.</span>
          </label>
        </div>
      </aside>
    </main>
  );
}
