import React from 'react';
import EntityTypePill from '../entity/EntityTypePill';
import SharedHeroImage from '../entity/SharedHeroImage';
import type { HeroCropConfig } from '../../lib/media/heroCrop';

export const TravelSection: React.FC<{
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, children, className = '' }) => (
  <section className={`ss-glass ss-glass--liquid overflow-hidden rounded-[24px] p-5 sm:p-6 ${className}`}>
    {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p> : null}
    <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
);

export const TravelFact: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
    <div className="mt-0.5 text-cyan-200">{icon}</div>
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-5 text-gray-100">{value}</div>
    </div>
  </div>
);

export const TravelChipList: React.FC<{ items: string[]; tone?: 'cyan' | 'violet' | 'emerald' }> = ({ items, tone = 'cyan' }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item) => (
      <span
        key={item}
        className={tone === 'violet'
          ? 'rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-100'
          : tone === 'emerald'
            ? 'rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100'
            : 'rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100'}
      >
        {item}
      </span>
    ))}
  </div>
);

export const TravelHero: React.FC<{
  typeLabel: string;
  title: string;
  location: string;
  subtitle: string;
  imageUrl?: string;
  heroCrop?: HeroCropConfig | null;
  logoImageUrl?: string;
  badge: string;
  tone?: 'resort' | 'cruise';
}> = ({ typeLabel, title, location, subtitle, imageUrl, heroCrop, logoImageUrl, badge, tone = 'resort' }) => (
  <section className="relative mt-6 aspect-[4/3] min-h-[280px] sm:aspect-[16/9] sm:min-h-[360px] lg:aspect-[20/9] lg:min-h-[450px] overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#080b10] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
    {imageUrl ? (
      <SharedHeroImage src={imageUrl} alt="" crop={heroCrop} className="absolute inset-0" />
    ) : null}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05060a]/85 via-[#05060a]/25 to-transparent" />
    <div className="absolute left-4 top-4 z-20 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/35 shadow-lg backdrop-blur-sm sm:left-6 sm:top-6 sm:h-24 sm:w-24">
      {logoImageUrl ? (
        <img src={logoImageUrl} alt={`${title} logo`} className="block h-full w-full object-contain" />
      ) : (
        <span className="text-2xl font-black text-white" aria-label={`${title} logo placeholder`}>{title.trim().slice(0, 2).toUpperCase()}</span>
      )}
    </div>
    <div className="relative flex h-full min-h-[280px] sm:min-h-[360px] lg:min-h-[450px] flex-col justify-end p-6 [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,0.9)] sm:p-9">
      <div className="flex flex-wrap items-center gap-2">
        <EntityTypePill tone={tone}>{typeLabel}</EntityTypePill>
        <span className={tone === 'cruise' ? 'rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-100 backdrop-blur-xl' : 'rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 backdrop-blur-xl'}>{badge}</span>
      </div>
      <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">{title}</h1>
      <p className={tone === 'cruise' ? 'mt-3 text-sm font-semibold text-violet-100/85' : 'mt-3 text-sm font-semibold text-emerald-100/85'}>{location}</p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300 sm:text-base sm:leading-7">{subtitle}</p>
    </div>
  </section>
);
