import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Award,
  Bug,
  CalendarDays,
  Compass,
  Footprints,
  HandHeart,
  Map,
  MessageCircle,
  Radio,
  Rocket,
  Sparkles,
  Star,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { isDevRouteEnabled } from '../../lib/devRoutes';

type BadgeCategory = 'founder' | 'legacy' | 'contribution' | 'community' | 'host';
type SpecialVariant = 'founder-001' | 'founder-010' | 'founder-050' | 'founder-100' | 'friend';
type SurfaceMode = 'dark' | 'light';
type MicroTreatment = 'glyph' | 'numbered-hex';

type BadgeConcept = {
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: LucideIcon;
  accent: string;
  standardText?: string;
  microText?: string;
  microTreatment?: MicroTreatment;
  variant?: SpecialVariant;
  note?: string;
};

// Canonical achievement container. Every standard badge uses this exact geometry.
// No octagons, flat-side alternates, or shield hybrids in the normal system.
const REGULAR_POINT_HEX_POINTS = '50,0 93.301,25 93.301,75 50,100 6.699,75 6.699,25';

const founderConcepts: BadgeConcept[] = [
  {
    slug: 'founder-001',
    name: 'Founder 1',
    description: 'The first SwingSphere member. One of one.',
    category: 'founder',
    icon: Star,
    accent: '#F5B52E',
    microText: '1',
    standardText: '1',
    microTreatment: 'numbered-hex',
    variant: 'founder-001',
    note: 'At 16–18 px this collapses to a centered “1” inside the founder hex. No globe, crown, or secondary detail.',
  },
  {
    slug: 'founder-010',
    name: 'Founder 10',
    description: 'The tenth founding member and first major founder milestone.',
    category: 'founder',
    icon: Star,
    accent: '#A98BFF',
    microText: '10',
    standardText: '10',
    microTreatment: 'numbered-hex',
    variant: 'founder-010',
    note: 'Custom milestone, but still built on the same point-down hex family.',
  },
  {
    slug: 'founder-050',
    name: 'Founder 50',
    description: 'The fiftieth founding member — halfway through the Founding 100.',
    category: 'founder',
    icon: Star,
    accent: '#F06B84',
    microText: '50',
    standardText: '50',
    microTreatment: 'numbered-hex',
    variant: 'founder-050',
    note: 'Custom milestone, with number-first treatment at every size.',
  },
  {
    slug: 'founder-100',
    name: 'Founder 100',
    description: 'The member who completed SwingSphere’s Founding 100.',
    category: 'founder',
    icon: Star,
    accent: '#69C7F6',
    microText: '100',
    standardText: '100',
    microTreatment: 'numbered-hex',
    variant: 'founder-100',
    note: 'Custom milestone. Geometry stays related to the other founder marks instead of becoming a shield.',
  },
  {
    slug: 'founding-member',
    name: 'Founding Member',
    description: 'Recognition for members within SwingSphere’s first 100 eligible accounts.',
    category: 'founder',
    icon: Star,
    accent: '#C3CBD5',
    note: 'Generic Founding 100 badge. Only 1, 10, 50, and 100 display a number on the artwork.',
  },
];

const memberConcepts: BadgeConcept[] = [
  { slug: 'beta-explorer', name: 'Beta Explorer', description: 'Helped test and shape SwingSphere before broader launch.', category: 'legacy', icon: Rocket, accent: '#9C7BFF', note: 'Micro version is the rocket glyph alone; the frame appears only at standard size.' },
  { slug: 'first-footprint', name: 'First Footprint', description: 'First approved contribution to SwingSphere discovery data.', category: 'contribution', icon: Footprints, accent: '#55CFE8', note: 'Micro version is the footprint glyph alone.' },
  { slug: 'pathfinder', name: 'Pathfinder', description: 'Added five approved places, events, or discovery records.', category: 'contribution', icon: Compass, accent: '#A96CFF' },
  { slug: 'cartographer', name: 'Cartographer', description: 'Built out SwingSphere with substantial approved location contributions.', category: 'contribution', icon: Map, accent: '#5B9CFF' },
  { slug: 'fine-tuner', name: 'Fine Tuner', description: 'Had meaningful corrections to existing information accepted.', category: 'contribution', icon: Wrench, accent: '#5ED0A5' },
  { slug: 'archivist', name: 'Archivist', description: 'Preserved, recovered, or updated historical venue and event information.', category: 'contribution', icon: Archive, accent: '#E6A44E' },
  { slug: 'first-voice', name: 'First Voice', description: 'Published a first approved written review.', category: 'contribution', icon: MessageCircle, accent: '#E76BC4' },
  { slug: 'trusted-voice', name: 'Trusted Voice', description: 'Built a body of reviews the community consistently found useful.', category: 'community', icon: Radio, accent: '#668CFF' },
  { slug: 'bug-hunter', name: 'Bug Hunter', description: 'Reported an issue that was confirmed and fixed.', category: 'contribution', icon: Bug, accent: '#8CCF58' },
  {
    slug: 'friend-of-swingsphere',
    name: 'Friend of SwingSphere',
    description: 'Hand-awarded recognition for meaningful support of the project or community.',
    category: 'community',
    icon: HandHeart,
    accent: '#F06F93',
    variant: 'friend',
    note: 'Custom prestige treatment at standard size. Micro mark stays a clean hand-heart glyph with no floating star.',
  },
  { slug: 'community-builder', name: 'Community Builder', description: 'Recognized for sustained work that made the community more useful or welcoming.', category: 'community', icon: UsersRound, accent: '#F0994D' },
  { slug: 'trailblazer', name: 'Trailblazer', description: 'Helped establish meaningful SwingSphere coverage in a new region.', category: 'community', icon: Star, accent: '#D06AF2' },
  { slug: 'early-supporter', name: 'Early Supporter', description: 'Supported SwingSphere during its early launch period.', category: 'legacy', icon: HandHeart, accent: '#EFC44F' },
];

const hostConcepts: BadgeConcept[] = [
  { slug: 'founding-organizer', name: 'Founding Organizer', description: 'An early host or promoter organization that helped establish SwingSphere.', category: 'host', icon: Sparkles, accent: '#E3A83A' },
  { slug: 'first-event', name: 'First Event', description: 'Published a first approved event through an organizer profile.', category: 'host', icon: CalendarDays, accent: '#55CFE8' },
  { slug: 'event-builder', name: 'Event Builder', description: 'Published five approved events through an organizer profile.', category: 'host', icon: CalendarDays, accent: '#A96CFF' },
  { slug: 'seasoned-host', name: 'Seasoned Host', description: 'Published twenty-five approved events through an organizer profile.', category: 'host', icon: Award, accent: '#F06B84' },
];

const tierColors = {
  bronze: '#B87333',
  silver: '#B9C1CB',
  gold: '#F2B42B',
} as const;

const microGlyphSize = (containerSize: number) => Math.max(12, Math.round(containerSize * 0.88));

const HexShell: React.FC<{
  accent: string;
  inner: string;
}> = ({ accent, inner }) => (
  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <polygon points={REGULAR_POINT_HEX_POINTS} fill={accent} />
    <polygon
      points={REGULAR_POINT_HEX_POINTS}
      fill={inner}
      transform="translate(50 50) scale(.78) translate(-50 -50)"
    />
  </svg>
);

const HexOutline: React.FC<{ color: string; opacity?: number }> = ({ color, opacity = 1 }) => (
  <svg className="h-full w-full" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <polygon points={REGULAR_POINT_HEX_POINTS} fill="none" stroke={color} strokeWidth="4" opacity={opacity} />
  </svg>
);

const NumberedHexMark: React.FC<{
  concept: BadgeConcept;
  size: number;
  surface: SurfaceMode;
}> = ({ concept, size, surface }) => {
  const text = size <= 20 ? concept.microText : concept.standardText;
  const inner = surface === 'dark' ? '#0A0C10' : '#FFFFFF';
  const fontSize = text?.length === 1 ? 57 : text?.length === 2 ? 43 : 33;

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={concept.name} aria-label={concept.name}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <polygon points={REGULAR_POINT_HEX_POINTS} fill={concept.accent} />
        <polygon
          points={REGULAR_POINT_HEX_POINTS}
          fill={inner}
          transform="translate(50 50) scale(.78) translate(-50 -50)"
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={concept.accent}
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize={fontSize}
          fontWeight="900"
          letterSpacing="0"
        >
          {text}
        </text>
      </svg>
    </span>
  );
};

const MicroMark: React.FC<{
  concept: BadgeConcept;
  size: number;
  surface: SurfaceMode;
  accentOverride?: string;
}> = ({ concept, size, surface, accentOverride }) => {
  if (concept.microTreatment === 'numbered-hex') {
    const overridden = accentOverride ? { ...concept, accent: accentOverride } : concept;
    return <NumberedHexMark concept={overridden} size={size} surface={surface} />;
  }

  const Icon = concept.icon;
  const accent = accentOverride ?? concept.accent;
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={concept.name} aria-label={concept.name}>
      <Icon size={microGlyphSize(size)} color={accent} strokeWidth={2.6} aria-hidden="true" />
    </span>
  );
};

const StandardBadge: React.FC<{
  concept: BadgeConcept;
  size: number;
  surface: SurfaceMode;
  accentOverride?: string;
}> = ({ concept, size, surface, accentOverride }) => {
  const accent = accentOverride ?? concept.accent;
  const Icon = concept.icon;
  const inner = surface === 'dark' ? '#0A0C10' : '#FFFFFF';
  const ink = surface === 'dark' ? '#F7F8FA' : '#111318';
  const text = concept.standardText;

  if (text) {
    const numberedConcept = accentOverride ? { ...concept, accent } : concept;
    return <NumberedHexMark concept={numberedConcept} size={size} surface={surface} />;
  }

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={concept.name} aria-label={concept.name}>
      <HexShell accent={accent} inner={inner} />
      <Icon size={Math.round(size * 0.47)} color={surface === 'dark' ? accent : ink} strokeWidth={2.35} aria-hidden="true" />

      {concept.variant === 'friend' && size >= 32 ? (
        <span className="pointer-events-none absolute inset-[15%]">
          <HexOutline color={accent} opacity={0.35} />
        </span>
      ) : null}
    </span>
  );
};

const ScaleSample: React.FC<{
  concept: BadgeConcept;
  size: number;
  surface: SurfaceMode;
}> = ({ concept, size, surface }) => (
  <div className="flex min-w-[78px] flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-3">
    <div className="flex h-12 items-center justify-center">
      {size <= 20
        ? <MicroMark concept={concept} size={size} surface={surface} />
        : <StandardBadge concept={concept} size={size} surface={surface} />}
    </div>
    <span className="text-[10px] font-bold text-zinc-500">{size}px</span>
  </div>
);

const InlineIdentityPreview: React.FC<{ concept: BadgeConcept; surface: SurfaceMode }> = ({ concept, surface }) => (
  <div className={`rounded-xl border p-3 ${surface === 'dark' ? 'border-white/10 bg-black/25' : 'border-zinc-200 bg-white'}`}>
    <div className="flex items-center gap-1.5">
      <span className={`text-base font-semibold ${surface === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>Ryoga</span>
      <MicroMark concept={concept} size={18} surface={surface} />
    </div>
    <div className={`mt-0.5 text-[11px] font-medium ${surface === 'dark' ? 'text-red-300' : 'text-red-600'}`}>@ryoga</div>
  </div>
);

const ConceptCard: React.FC<{ concept: BadgeConcept; surface: SurfaceMode }> = ({ concept, surface }) => (
  <article className={`rounded-2xl border p-4 ${surface === 'dark' ? 'border-white/10 bg-[#101216]' : 'border-zinc-200 bg-white shadow-sm'}`}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className={`text-sm font-black ${surface === 'dark' ? 'text-white' : 'text-zinc-950'}`}>{concept.name}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: concept.accent }}>{concept.category}</p>
      </div>
      <div className="flex items-end gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <MicroMark concept={concept} size={18} surface={surface} />
          <span className="text-[9px] text-zinc-600">micro 18</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <StandardBadge concept={concept} size={36} surface={surface} />
          <span className="text-[9px] text-zinc-600">badge 36</span>
        </div>
      </div>
    </div>

    <div className={`mt-4 rounded-xl border p-3 ${surface === 'dark' ? 'border-white/10 bg-black/20' : 'border-zinc-100 bg-zinc-50'}`}>
      <p className={`text-xs leading-5 ${surface === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{concept.description}</p>
    </div>

    {concept.note ? <p className="mt-3 text-[11px] leading-5 text-zinc-500">{concept.note}</p> : null}
  </article>
);

const TierStudy: React.FC<{ surface: SurfaceMode }> = ({ surface }) => {
  const pathfinder = memberConcepts.find((item) => item.slug === 'pathfinder')!;
  const tiers = [
    { label: 'Base', color: '#68717C' },
    { label: 'Bronze', color: tierColors.bronze },
    { label: 'Silver', color: tierColors.silver },
    { label: 'Gold', color: tierColors.gold },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Modifier study</p>
      <h2 className="mt-1 text-2xl font-black text-white">Bronze · Silver · Gold</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
        At micro size the glyph stays unframed and simply inherits the tier color. At standard size the canonical hex frame carries the tier.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => (
          <div key={tier.label} className="rounded-2xl border border-white/10 bg-[#101216] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">{tier.label}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: tier.color }} />
            </div>
            <div className="mt-5 flex items-end justify-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <MicroMark concept={pathfinder} size={18} surface={surface} accentOverride={tier.color} />
                <span className="text-[10px] text-zinc-600">18 px glyph</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <StandardBadge concept={pathfinder} size={36} surface={surface} accentOverride={tier.color} />
                <span className="text-[10px] text-zinc-600">36 px badge</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const MicroViabilityStrip: React.FC<{ concepts: BadgeConcept[]; surface: SurfaceMode }> = ({ concepts, surface }) => (
  <section className="rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Micro viability</p>
    <h2 className="mt-1 text-2xl font-black text-white">18 px is a glyph system, not a tiny badge system</h2>
    <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
      This row intentionally removes the hex from standard achievements. If an icon cannot survive here by itself, the core illustration needs simplifying before final SVG production.
    </p>
    <div className={`mt-5 flex flex-wrap gap-x-6 gap-y-5 rounded-2xl border p-5 ${surface === 'dark' ? 'border-white/10 bg-[#0B0D10]' : 'border-zinc-200 bg-white'}`}>
      {concepts.map((concept) => (
        <div key={concept.slug} className="flex w-[92px] flex-col items-center gap-2 text-center">
          <MicroMark concept={concept} size={18} surface={surface} />
          <span className={`text-[10px] font-semibold leading-4 ${surface === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{concept.name}</span>
        </div>
      ))}
    </div>
  </section>
);

const BadgeAchievementLabPage: React.FC = () => {
  const [surface, setSurface] = useState<SurfaceMode>('dark');
  const [category, setCategory] = useState<'all' | BadgeCategory>('all');
  const [query, setQuery] = useState('');

  const allConcepts = useMemo(() => [...founderConcepts, ...memberConcepts, ...hostConcepts], []);
  const visibleConcepts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allConcepts.filter((concept) => {
      if (category !== 'all' && concept.category !== category) return false;
      if (!normalized) return true;
      return `${concept.name} ${concept.description} ${concept.category}`.toLowerCase().includes(normalized);
    });
  }, [allConcepts, category, query]);

  if (!isDevRouteEnabled()) return <Navigate to="/" replace />;

  const founder001 = founderConcepts[0];
  const foundingMember = founderConcepts[4];

  return (
    <main className="min-h-screen bg-[#07090c] text-white">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <header className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,181,46,.10),transparent_32%),linear-gradient(145deg,#11141a,#090b0f)] p-6 sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">Dev design lab · refinement pass</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">SwingSphere badges & achievements</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
                Two deliberately different optical systems: 16–18 px identity glyphs and 32–36 px point-down hex badges. The micro mark is never forced into a frame unless the number itself is the identity.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSurface('dark')} className={`rounded-xl border px-4 py-2 text-xs font-black ${surface === 'dark' ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-white/10 text-zinc-500'}`}>Dark surface</button>
              <button type="button" onClick={() => setSurface('light')} className={`rounded-xl border px-4 py-2 text-xs font-black ${surface === 'light' ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-white/10 text-zinc-500'}`}>White stress test</button>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xl font-black">16–18 px</p><p className="mt-1 text-xs font-bold text-zinc-300">Micro glyph</p><p className="mt-1 text-[11px] text-zinc-600">Inline beside a 16 px username</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xl font-black">32–36 px</p><p className="mt-1 text-xs font-bold text-zinc-300">Standard badge</p><p className="mt-1 text-[11px] text-zinc-600">Profile, shelf, cabinet, admin</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xl font-black">64 px</p><p className="mt-1 text-xs font-bold text-zinc-300">Optional only</p><p className="mt-1 text-[11px] text-zinc-600">No design depends on this size</p></div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <div className={`rounded-3xl border p-5 sm:p-6 ${surface === 'dark' ? 'border-white/10 bg-[#101216]' : 'border-zinc-200 bg-zinc-50'}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Founder 1 stress test</p>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              {[16, 18, 32, 36, 64].map((size) => <ScaleSample key={size} concept={founder001} size={size} surface={surface} />)}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InlineIdentityPreview concept={founder001} surface={surface} />
              <div className={`rounded-xl border p-3 ${surface === 'dark' ? 'border-white/10 bg-black/25' : 'border-zinc-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-zinc-700" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className={`text-base font-semibold ${surface === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Ryoga</span><MicroMark concept={founder001} size={18} surface={surface} /><span className="text-[10px] text-zinc-600">2h</span></div>
                    <p className="text-[11px] text-zinc-500">@ryoga</p>
                  </div>
                </div>
                <p className={`mt-3 text-sm leading-5 ${surface === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>Found a new event in Santa Cruz and added the missing venue details.</p>
              </div>
            </div>
          </div>

          <div className={`rounded-3xl border p-5 sm:p-6 ${surface === 'dark' ? 'border-white/10 bg-[#101216]' : 'border-zinc-200 bg-zinc-50'}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Founding 100 distinction</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className={`text-sm font-black ${surface === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Milestone founder</p>
                <div className="mt-3 flex items-center gap-4"><MicroMark concept={founder001} size={18} surface={surface} /><StandardBadge concept={founder001} size={36} surface={surface} /></div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">Only 1, 10, 50, and 100 carry numbers.</p>
              </div>
              <div>
                <p className={`text-sm font-black ${surface === 'dark' ? 'text-white' : 'text-zinc-900'}`}>General founding member</p>
                <div className="mt-3 flex items-center gap-4"><MicroMark concept={foundingMember} size={18} surface={surface} /><StandardBadge concept={foundingMember} size={36} surface={surface} /></div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">Everyone else in the first 100 gets the shared silver-star founder mark.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6"><MicroViabilityStrip concepts={[...memberConcepts, ...hostConcepts]} surface={surface} /></div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Custom founder milestones</p>
          <h2 className="mt-1 text-2xl font-black">1 · 10 · 50 · 100</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">They can gain bespoke internal details later, but the outer geometry remains visibly related instead of changing orientation or polygon family.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {founderConcepts.slice(0, 4).map((concept) => <ConceptCard key={concept.slug} concept={concept} surface={surface} />)}
          </div>
        </section>

        <div className="mt-6"><TierStudy surface={surface} /></div>

        <section className="mt-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0D1014] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">Concept catalog</p>
              <p className="mt-1 text-sm text-zinc-400">{visibleConcepts.length} visible concepts · {allConcepts.length} total</p>
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-3xl lg:justify-end">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search badge concepts…" className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-amber-300/40" />
              <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-10 rounded-xl border border-white/10 bg-[#111419] px-3 text-sm text-zinc-300 outline-none focus:border-amber-300/40">
                <option value="all">All categories</option><option value="founder">Founder</option><option value="legacy">Legacy</option><option value="contribution">Contribution</option><option value="community">Community</option><option value="host">Host</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleConcepts.map((concept) => <ConceptCard key={concept.slug} concept={concept} surface={surface} />)}
          </div>
        </section>

        <footer className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 text-xs leading-6 text-zinc-600">
          Design rule for this lab: micro marks are optical-size glyphs, not miniaturized badges. Standard achievements share one point-down hex container. Only the numbered founder milestones and other deliberately bespoke honors may add internal prestige details.
        </footer>
      </div>
    </main>
  );
};

export default BadgeAchievementLabPage;
