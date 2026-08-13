import React from 'react';
import EntityTypePill from '../entity/EntityTypePill';

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

export const TravelChipList: React.FC<{ items: string[]; tone?: 'cyan' | 'violet' }> = ({ items, tone = 'cyan' }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item) => (
      <span
        key={item}
        className={tone === 'violet'
          ? 'rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-100'
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
  badge: string;
  tone?: 'resort' | 'cruise';
}> = ({ typeLabel, title, location, subtitle, imageUrl, badge, tone = 'resort' }) => (
  <section className="relative mt-6 min-h-[25rem] overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#080b10] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
    {imageUrl ? <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" /> : null}
    <div className={tone === 'cruise'
      ? 'absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(64,188,220,0.28),transparent_32%),linear-gradient(115deg,rgba(2,8,16,0.98)_15%,rgba(4,20,30,0.76)_58%,rgba(3,8,14,0.9))]'
      : 'absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(116,76,255,0.28),transparent_32%),linear-gradient(115deg,rgba(8,6,16,0.98)_15%,rgba(26,12,38,0.72)_58%,rgba(5,8,13,0.92))]'}
    />
    <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black via-black/70 to-transparent" />
    <div className="relative flex min-h-[25rem] flex-col justify-end p-6 sm:p-9">
      <div className="flex flex-wrap items-center gap-2">
        <EntityTypePill tone={tone}>{typeLabel}</EntityTypePill>
        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-xl">{badge}</span>
      </div>
      <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.035em] text-white sm:text-6xl">{title}</h1>
      <p className="mt-3 text-sm font-semibold text-cyan-100/85">{location}</p>
      <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300 sm:text-lg">{subtitle}</p>
    </div>
  </section>
);
