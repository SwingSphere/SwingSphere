import React, { useState } from 'react';
import GlassSurface from '../ui/GlassSurface';

const controlClass = 'w-full accent-red-500';

export default function GlassMaterialLabPage() {
  const [blur, setBlur] = useState(12);
  const [opacity, setOpacity] = useState(46);
  const [saturation, setSaturation] = useState(132);
  const [rim, setRim] = useState(18);
  const [specular, setSpecular] = useState(16);
  const [lowEffects, setLowEffects] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const vars = {
    '--glass-blur': `${blur}px`,
    '--glass-opacity': opacity / 100,
    '--glass-saturation': `${saturation}%`,
    '--glass-border-light': `rgba(255,255,255,${rim / 100})`,
    '--glass-specular-opacity': specular / 100,
  } as React.CSSProperties;

  return (
    <main
      className={`min-h-screen ss-bg-geometric p-6 text-white ${lowEffects ? 'ss-effects-low' : ''} ${reducedMotion ? 'motion-reduce' : ''}`}
      style={vars}
    >
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <filter id="ss-glass-refraction" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="1" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-300">Development material lab</p>
            <h1 className="mt-2 text-4xl font-black">SwingSphere Liquid Glass</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-300">Production CSS tiers with a Chromium-only refractive enhancement and graceful liquid fallback.</p>
          </div>
          <div className="flex gap-2">
            <button className="ss-glass ss-glass--liquid ss-glass--interactive rounded-xl px-4 py-2 text-sm font-bold" onClick={() => setLowEffects((v) => !v)}>Low effects: {lowEffects ? 'on' : 'off'}</button>
            <button className="ss-glass ss-glass--liquid ss-glass--interactive rounded-xl px-4 py-2 text-sm font-bold" onClick={() => setReducedMotion((v) => !v)}>Reduced motion: {reducedMotion ? 'on' : 'off'}</button>
          </div>
        </header>

        <GlassSurface tier="ambient" className="mb-6 grid gap-4 rounded-3xl p-5 sm:grid-cols-5">
          {([
            { label: 'Blur', value: blur, setValue: setBlur, min: 4, max: 20 },
            { label: 'Opacity', value: opacity, setValue: setOpacity, min: 28, max: 88 },
            { label: 'Saturation', value: saturation, setValue: setSaturation, min: 100, max: 160 },
            { label: 'Rim', value: rim, setValue: setRim, min: 4, max: 40 },
            { label: 'Specular', value: specular, setValue: setSpecular, min: 0, max: 35 },
          ]).map(({ label, value, setValue, min, max }) => (
            <label key={label} className="text-xs font-semibold text-gray-300">
              <span className="mb-2 flex justify-between"><span>{label}</span><span>{value}</span></span>
              <input className={controlClass} type="range" min={min} max={max} value={value} onChange={(e) => setValue(Number(e.target.value))} />
            </label>
          ))}
        </GlassSurface>

        <div className="grid gap-5 lg:grid-cols-3">
          {(['ambient', 'liquid', 'refractive'] as const).map((tier) => (
            <section key={tier} className="space-y-4">
              <GlassSurface tier={tier} className="min-h-52 rounded-[28px] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Neutral</p>
                <h2 className="mt-3 text-2xl font-black capitalize">{tier} glass</h2>
                <p className="mt-3 text-sm leading-6 text-gray-300">Dimensional perimeter, directional highlight, readable dark fill, and a restrained lower contour.</p>
              </GlassSurface>
              <GlassSurface tier={tier} tone="crimson" interactive className="min-h-44 rounded-[28px] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">Selected</p>
                <h3 className="mt-3 text-xl font-black">Crimson reflection</h3>
                <button className="mt-6 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-300">Active action</button>
              </GlassSurface>
            </section>
          ))}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl bg-[#e9edf3] p-6 text-black"><GlassSurface tier="liquid" className="rounded-2xl p-5 text-white">Light background</GlassSurface></div>
          <div className="rounded-3xl bg-[radial-gradient(circle_at_20%_20%,#ef4444,transparent_30%),linear-gradient(135deg,#111827,#312e81,#0f172a)] p-6"><GlassSurface tier="liquid" className="rounded-2xl p-5">Complex background</GlassSurface></div>
          <div className="rounded-3xl bg-black p-6"><GlassSurface tier="ambient" className="rounded-2xl p-5">Dark background</GlassSurface></div>
        </div>
      </div>
    </main>
  );
}
