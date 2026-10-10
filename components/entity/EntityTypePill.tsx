import React from 'react';

type EntityTypePillTone = 'club' | 'event' | 'host' | 'resort' | 'cruise';

const toneClass: Record<EntityTypePillTone, string> = {
  club: 'border-red-400/40 bg-[#22080d]/85 text-red-200',
  event: 'border-amber-300/45 bg-[#241605]/85 text-amber-100',
  host: 'border-cyan-300/40 bg-[#061e26]/85 text-cyan-100',
  resort: 'border-emerald-300/40 bg-[#052118]/85 text-emerald-100',
  cruise: 'border-violet-300/40 bg-[#180b29]/85 text-violet-100',
};

const EntityTypePill: React.FC<{
  tone: EntityTypePillTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone, children, className = '' }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClass[tone]} ${className}`}>
    {children}
  </span>
);

export default EntityTypePill;
