import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Crown,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { adminAssignFounderNumber, adminAwardUserBadge } from '../../lib/badges/badgeService';
import {
  getAdminUserBadges,
  revokeAdminUserBadge,
  type AdminManagedUser,
  type AdminUserBadgeState,
} from '../../lib/admin/userManagement';
import { useAppStore } from '../../store/appStore';

const categoryLabel: Record<AdminUserBadgeState['category'], string> = {
  founder: 'Founder',
  legacy: 'Legacy',
  contribution: 'Contribution',
  community: 'Community',
  host: 'Host',
  seasonal: 'Seasonal',
  staff: 'Staff',
  special: 'Special',
};

const rarityClass: Record<AdminUserBadgeState['rarity'], string> = {
  common: 'border-gray-200 bg-gray-50 text-gray-600',
  uncommon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rare: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  epic: 'border-violet-200 bg-violet-50 text-violet-700',
  legendary: 'border-amber-200 bg-amber-50 text-amber-800',
  unique: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
};

const AdminUserBadgeManager: React.FC<{
  user: AdminManagedUser;
  onClose: () => void;
  onChanged: () => void;
}> = ({ user, onClose, onChanged }) => {
  const [badges, setBadges] = useState<AdminUserBadgeState[]>([]);
  const [founderNumber, setFounderNumber] = useState<number | undefined>(user.founderNumber);
  const [isLoading, setIsLoading] = useState(true);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useAppStore();

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setBadges(await getAdminUserBadges(user.id));
    } catch (loadError) {
      console.error('Failed to load admin user badges:', loadError);
      setError('Badge management is waiting for the pending Supabase badge migrations to be deployed.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const visibleBadges = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return badges
      .filter((badge) => !term || [badge.name, badge.description, badge.badgeSlug, badge.category, badge.rarity]
        .some((value) => value.toLowerCase().includes(term)))
      .sort((a, b) => {
        const aManual = a.awardMode === 'manual' ? 0 : 1;
        const bManual = b.awardMode === 'manual' ? 0 : 1;
        return aManual - bManual || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });
  }, [badges, searchTerm]);

  const awardedCount = badges.filter((badge) => badge.isAwarded).length;

  const assignBadge = async (badge: AdminUserBadgeState) => {
    setBusySlug(badge.badgeSlug);
    try {
      await adminAwardUserBadge(user.id, badge.badgeSlug, reason.trim() || undefined);
      addToast({ message: `${badge.name} awarded to ${user.displayName}.`, type: 'success' });
      setReason('');
      await load();
      onChanged();
    } catch (awardError) {
      addToast({
        message: awardError instanceof Error ? awardError.message : 'Unable to award badge.',
        type: 'error',
      });
    } finally {
      setBusySlug(null);
    }
  };

  const revokeBadge = async (badge: AdminUserBadgeState) => {
    setBusySlug(badge.badgeSlug);
    try {
      await revokeAdminUserBadge(user.id, badge.badgeSlug, reason.trim() || undefined);
      addToast({ message: `${badge.name} removed from ${user.displayName}.`, type: 'success' });
      setReason('');
      await load();
      onChanged();
    } catch (revokeError) {
      addToast({
        message: revokeError instanceof Error ? revokeError.message : 'Unable to remove badge.',
        type: 'error',
      });
    } finally {
      setBusySlug(null);
    }
  };

  const assignFounder = async () => {
    setBusySlug('founding-member');
    try {
      const founderNumber = await adminAssignFounderNumber(user.id);
      if (!founderNumber) throw new Error('This member is not currently eligible for a founder number. Confirm the account is active and email-verified.');
      setFounderNumber(founderNumber);
      addToast({ message: `${user.displayName} is now Founding Member №${String(founderNumber).padStart(3, '0')}.`, type: 'success' });
      await load();
      onChanged();
    } catch (founderError) {
      addToast({
        message: founderError instanceof Error ? founderError.message : 'Unable to assign founder number.',
        type: 'error',
      });
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-600">
              <Award size={15} /> Achievement manager
            </div>
            <h2 className="mt-1 truncate text-2xl font-bold text-gray-900">{user.displayName}</h2>
            <p className="mt-1 text-sm text-gray-500">@{user.handle || 'no-handle'} · {awardedCount} active achievement{awardedCount === 1 ? '' : 's'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Close badge manager">
            <X size={20} />
          </button>
        </header>

        <div className="grid gap-3 border-b border-gray-200 bg-gray-50/80 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)] sm:px-6">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search achievements…"
              className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <span className="mt-1.5 block text-[11px] leading-4 text-gray-500">Manual recognition badges, including Friend of SwingSphere, are listed first and can be assigned directly here.</span>
          </label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Optional award/removal note"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          {founderNumber ? (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <Crown size={22} className="shrink-0 text-amber-600" />
              <div>
                <div className="font-bold">Founding Member №{String(founderNumber).padStart(3, '0')}</div>
                <div className="mt-0.5 text-xs text-amber-800">Founder numbers are permanent historical identifiers and are not removed through ordinary badge management.</div>
              </div>
            </div>
          ) : (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-3">
                <Crown size={22} className="shrink-0 text-amber-600" />
                <div>
                  <div className="font-bold text-amber-950">Founding 100</div>
                  <div className="mt-0.5 text-xs text-amber-800">Manual founder assignment is separate from ordinary achievement awards.</div>
                </div>
              </div>
              <button
                type="button"
                disabled={!user.emailVerifiedAt || user.role === 'Admin' || busySlug !== null}
                onClick={() => void assignFounder()}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busySlug === 'founding-member' ? 'Assigning…' : 'Assign founder number'}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-gray-500"><LoaderCircle className="animate-spin" size={18} /> Loading achievements…</div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">{error}</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleBadges
                .filter((badge) => badge.badgeSlug !== 'founding-member')
                .map((badge) => {
                  const busy = busySlug === badge.badgeSlug;
                  return (
                    <article key={badge.badgeId} className={`rounded-xl border p-4 transition ${badge.isAwarded ? 'border-blue-200 bg-blue-50/45' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${rarityClass[badge.rarity]}`}>
                          {badge.isAwarded ? <CheckCircle2 size={20} /> : <Sparkles size={20} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-gray-900">{badge.name}</h3>
                            {badge.isAwarded ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Awarded</span> : null}
                          </div>
                          <p className="mt-1 text-sm leading-5 text-gray-600">{badge.description}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600">{categoryLabel[badge.category]}</span>
                            <span className={`rounded-full border px-2 py-1 ${rarityClass[badge.rarity]}`}>{badge.rarity}</span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500">{badge.awardMode.replace('_', ' ')}</span>
                          </div>
                          {badge.isAwarded && badge.awardedAt ? (
                            <p className="mt-2 text-xs text-gray-500">Awarded {new Date(badge.awardedAt).toLocaleDateString()}{badge.awardReason ? ` · ${badge.awardReason}` : ''}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        {badge.isAwarded ? (
                          <button
                            type="button"
                            disabled={busySlug !== null}
                            onClick={() => void revokeBadge(badge)}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-45"
                          >
                            {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />} Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busySlug !== null}
                            onClick={() => void assignBadge(badge)}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-45"
                          >
                            {busy ? <LoaderCircle className="animate-spin" size={14} /> : <ShieldCheck size={14} />} Assign
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          )}

          {!isLoading && !error && !visibleBadges.filter((badge) => badge.badgeSlug !== 'founding-member').length ? (
            <div className="py-12 text-center text-sm text-gray-500">No achievements match that search.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AdminUserBadgeManager;
