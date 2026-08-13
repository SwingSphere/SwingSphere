import React from 'react';

type EntityTypePillTone = 'club' | 'event' | 'host' | 'resort' | 'cruise';

const toneClass: Record<EntityTypePillTone, string> = {
  club: 'border-red-400/35 bg-red-500/12 text-red-200',
  event: 'border-amber-300/40 bg-amber-400/12 text-amber-100',
  host: 'border-cyan-300/35 bg-cyan-400/12 text-cyan-100',
  resort: 'border-violet-300/35 bg-violet-400/12 text-violet-100',
  cruise: 'border-cyan-300/35 bg-cyan-400/12 text-cyan-100',
};

const EntityTypePill: React.FC<{
  tone: EntityTypePillTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone, children, className = '' }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md ${toneClass[tone]} ${className}`}>
    {children}
  </span>
);

export default EntityTypePill;
