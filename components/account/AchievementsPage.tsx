import React, { useEffect, useMemo, useState } from 'react';
import { Award, Eye, EyeOff, LoaderCircle, Pin, PinOff, Sparkles } from 'lucide-react';
import {
  getMyBadges,
  getVisibleBadgeCatalog,
  updateMyBadgePresentation,
} from '../../lib/badges/badgeService';
import type { BadgeAwardView, BadgeCatalogItem } from '../../lib/badges/badgeTypes';
import { AchievementBadge } from '../badges/BadgeShelf';

const categoryLabel: Record<string, string> = {
  founder: 'Founders & legacy',
  legacy: 'Founders & legacy',
  contribution: 'Contributions',
  community: 'Community',
  host: 'Organizer achievements',
  seasonal: 'Seasonal',
  staff: 'SwingSphere recognition',
  special: 'Special',
};

const AchievementsPage: React.FC = () => {
  const [awards, setAwards] = useState<BadgeAwardView[]>([]);
  const [catalog, setCatalog] = useState<BadgeCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAwardId, setSavingAwardId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [earned, visibleCatalog] = await Promise.all([
          getMyBadges(),
          getVisibleBadgeCatalog(),
        ]);
        if (cancelled) return;
        setAwards(earned);
        setCatalog(visibleCatalog.filter((badge) => badge.audience !== 'organization'));
      } catch (loadError) {
        if (cancelled) return;
        console.error('Failed to load achievements:', loadError);
        setError('Achievements are not available yet. The badge database migration may still need to be deployed.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const earnedSlugs = useMemo(() => new Set(awards.map((award) => award.badgeSlug)), [awards]);
  const locked = useMemo(() => catalog.filter((badge) => !earnedSlugs.has(badge.slug)), [catalog, earnedSlugs]);
  const featuredSlots = useMemo(
    () => new Set(awards.filter((award) => award.isFeatured && award.featuredOrder).map((award) => award.featuredOrder as number)),
    [awards],
  );

  const savePresentation = async (award: BadgeAwardView, next: { isPublic: boolean; isFeatured: boolean }) => {
    let featuredOrder = award.featuredOrder;
    if (next.isFeatured && !featuredOrder) {
      featuredOrder = [1, 2, 3].find((slot) => !featuredSlots.has(slot));
      if (!featuredOrder) return;
    }

    setSavingAwardId(award.awardId);
    setError(null);
    try {
      await updateMyBadgePresentation(award.awardId, {
        isPublic: next.isPublic,
        isFeatured: next.isFeatured,
        featuredOrder,
      });
      setAwards((current) => current.map((item) => item.awardId === award.awardId
        ? {
            ...item,
            isPublic: next.isPublic,
            isFeatured: next.isPublic && next.isFeatured,
            featuredOrder: next.isPublic && next.isFeatured ? featuredOrder : undefined,
          }
        : item));
    } catch (saveError) {
      console.error('Failed to update achievement presentation:', saveError);
      setError('Could not update that achievement’s profile visibility.');
    } finally {
      setSavingAwardId(null);
    }
  };

  if (isLoading) {
    return (
      <section className="ss-glass-surface flex min-h-72 items-center justify-center rounded-[24px] text-gray-400">
        <LoaderCircle className="mr-2 animate-spin" size={18} /> Loading achievements…
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="ss-glass-surface rounded-[24px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Achievements</p>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">Your badge cabinet</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Earned badges are private by default. You choose which ones may appear on your member profile and which three are featured first.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-right">
            <div className="text-2xl font-black text-white">{awards.length}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">earned</div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-gray-500">
          Making a badge public does not make a private member profile discoverable. It can only appear if your profile is separately set to visible by link.
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div>
      ) : null}

      <section className="ss-glass-surface rounded-[24px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Earned</p>
            <h3 className="mt-1 text-xl font-black text-white">Your achievements</h3>
          </div>
          <Sparkles size={20} className="text-fuchsia-300" aria-hidden="true" />
        </div>

        {awards.length ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {awards.map((award) => {
              const saving = savingAwardId === award.awardId;
              const featureCapacityReached = !award.isFeatured && featuredSlots.size >= 3;
              return (
                <article key={award.awardId} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <AchievementBadge badge={award} />
                  <p className="mt-3 px-1 text-xs leading-5 text-gray-500">{award.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 px-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void savePresentation(award, { isPublic: !award.isPublic, isFeatured: award.isPublic ? award.isFeatured : false })}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-50 ${award.isPublic ? 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-white/[0.035] text-gray-300 hover:text-white'}`}
                    >
                      {award.isPublic ? <Eye size={14} /> : <EyeOff size={14} />}
                      {award.isPublic ? 'Shown on profile' : 'Private'}
                    </button>
                    <button
                      type="button"
                      disabled={saving || !award.isPublic || featureCapacityReached}
                      title={!award.isPublic ? 'Show this badge on your profile before featuring it.' : featureCapacityReached ? 'You can feature up to three badges.' : undefined}
                      onClick={() => void savePresentation(award, { isPublic: award.isPublic, isFeatured: !award.isFeatured })}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${award.isFeatured ? 'border-fuchsia-300/25 bg-fuchsia-500/10 text-fuchsia-100' : 'border-white/10 bg-white/[0.035] text-gray-300 hover:text-white'}`}
                    >
                      {award.isFeatured ? <Pin size={14} /> : <PinOff size={14} />}
                      {award.isFeatured ? `Featured #${award.featuredOrder}` : 'Feature badge'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/15 px-5 py-8 text-center">
            <Award className="mx-auto text-gray-600" size={28} />
            <p className="mt-3 font-bold text-gray-300">No achievements yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500">Your first earned badges will appear here automatically or when the SwingSphere team recognizes a contribution.</p>
          </div>
        )}
      </section>

      {locked.length ? (
        <section className="ss-glass-surface rounded-[24px] p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Badge catalog</p>
          <h3 className="mt-1 text-xl font-black text-white">Achievements to discover</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">This is the visible achievement catalog. Some awards are automatic, while others are recognition from the SwingSphere team.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {locked.map((badge) => (
              <div key={badge.id} className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 opacity-65">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-gray-500" />
                  <p className="font-bold text-gray-300">{badge.name}</p>
                </div>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-gray-600">{categoryLabel[badge.category] ?? badge.category} · {badge.rarity}</p>
                <p className="mt-2 text-xs leading-5 text-gray-600">{badge.description}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AchievementsPage;
