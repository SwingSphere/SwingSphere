import React, { useEffect, useMemo, useState } from 'react';
import { AtSign, CalendarDays, Check, LockKeyhole, Pencil, ShieldCheck, UserRound, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Footer from './Footer';
import Button from './Button';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/appStore';
import { useAdminEditMode } from './admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from './admin-edit/usePublicEditAccess';
import { getCloudflareImageUrl } from '../lib/media/getCloudflareImageUrl';
import { getAdminProfileBadgesByHandle, getPublicProfileBadgesByHandle } from '../lib/badges/badgeService';
import type { BadgeAwardView } from '../lib/badges/badgeTypes';
import BadgeShelf from './badges/BadgeShelf';

type ProfileView = {
  id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  profile_visibility: 'private' | 'visible';
  role?: 'user' | 'promoter' | 'admin';
  status?: 'active' | 'suspended' | 'deleted';
};

type PublicProfileMedia = {
  avatarUrl?: string;
  bannerUrl?: string;
};

const initialsFor = (displayName: string) => displayName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'SS';

const PublicProfilePage: React.FC = () => {
  const { handle = '' } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [profileMedia, setProfileMedia] = useState<PublicProfileMedia>({});
  const [badges, setBadges] = useState<BadgeAwardView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quickEditField, setQuickEditField] = useState<'name' | 'bio' | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { currentUser, addToast } = useAppStore();
  const isAdmin = currentUser?.status === 'Active' && currentUser.role === 'Admin';
  const { isEditing, isAdvancedEditorOpen, registerPublicPage, clearPublicPage, markSaved, markUnsaved } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({ profileUserId: profile?.id });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setNotFound(false);
      let resolvedProfile: ProfileView | null = null;

      if (isAdmin) {
        const adminResult = await supabase.rpc('admin_get_profile_by_handle', {
          p_handle: handle,
        });

        if (!adminResult.error) {
          const row = Array.isArray(adminResult.data) ? adminResult.data[0] : adminResult.data;
          resolvedProfile = (row as ProfileView | null) ?? null;
        } else {
          // Compatibility fallback while the admin-preview migration is pending.
          // Database RLS still decides whether the caller is actually allowed to
          // read the row; the client-side Admin role is not the security boundary.
          console.warn('Admin profile preview RPC unavailable; trying RLS-protected profile read.', adminResult.error);
          const fallback = await supabase
            .from('profiles')
            .select('id, display_name, handle, bio, avatar_url, created_at, role, status')
            .ilike('handle', handle.trim())
            .maybeSingle();

          if (!fallback.error && fallback.data) {
            let profileVisibility: ProfileView['profile_visibility'] = 'private';
            const privacy = await supabase
              .from('profile_privacy_settings')
              .select('profile_visibility')
              .eq('user_id', fallback.data.id)
              .maybeSingle();
            if (!privacy.error && privacy.data?.profile_visibility && privacy.data.profile_visibility !== 'private') {
              profileVisibility = 'visible';
            }
            resolvedProfile = {
              ...(fallback.data as Omit<ProfileView, 'profile_visibility'>),
              profile_visibility: profileVisibility,
            };
          } else if (fallback.error) {
            console.error('Failed to load admin profile preview:', fallback.error);
          }
        }
      } else {
        const publicResult = await supabase.rpc('get_public_profile_by_handle', {
          p_handle: handle,
        });
        const row = Array.isArray(publicResult.data) ? publicResult.data[0] : publicResult.data;
        resolvedProfile = (row as ProfileView | null) ?? null;
        if (publicResult.error) {
          console.error('Failed to load public profile:', publicResult.error);
        }
      }

      if (cancelled) return;

      let media: PublicProfileMedia = {};
      let profileBadges: BadgeAwardView[] = [];
      if (resolvedProfile) {
        const { data: mediaRows, error: mediaError } = await supabase
          .from('media_assets')
          .select('role, external_id, created_at')
          .eq('owner_type', 'user')
          .eq('owner_id', resolvedProfile.id)
          .eq('status', 'approved')
          .in('role', ['avatar', 'hero'])
          .order('created_at', { ascending: false });

        if (mediaError) {
          console.warn('Failed to load public profile media:', mediaError);
        } else {
          const avatarAsset = mediaRows?.find((asset) => asset.role === 'avatar');
          const heroAsset = mediaRows?.find((asset) => asset.role === 'hero');
          media = {
            avatarUrl: avatarAsset
              ? getCloudflareImageUrl({ externalId: avatarAsset.external_id, variant: 'avatarsquare' }) ?? undefined
              : undefined,
            bannerUrl: heroAsset
              ? getCloudflareImageUrl({ externalId: heroAsset.external_id, variant: 'heropage' }) ?? undefined
              : undefined,
          };
        }

        try {
          profileBadges = isAdmin
            ? await getAdminProfileBadgesByHandle(handle)
            : await getPublicProfileBadgesByHandle(handle);
        } catch (badgeError) {
          console.warn('Failed to load profile achievements:', badgeError);
          if (isAdmin && resolvedProfile.profile_visibility === 'visible') {
            try {
              profileBadges = await getPublicProfileBadgesByHandle(handle);
            } catch {
              // The profile itself remains useful even when badge migrations are pending.
            }
          }
        }
      }

      if (cancelled) return;
      setProfile(resolvedProfile);
      setProfileMedia(media);
      setBadges(profileBadges);
      setNotFound(!resolvedProfile);
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [handle, isAdmin]);

  useEffect(() => {
    if (!profile) return;
    registerPublicPage({
      entityId: profile.id,
      entityType: 'profile',
      label: profile.display_name,
      canEdit,
      supportsInlineQuickEdit: true,
    });
    return () => clearPublicPage(profile.id);
  }, [canEdit, clearPublicPage, profile, registerPublicPage]);

  const openQuickEdit = (field: 'name' | 'bio') => {
    if (!profile) return;
    setQuickEditField(field);
    setDraftValue(field === 'name' ? profile.display_name : profile.bio ?? '');
  };

  const saveQuickEdit = async () => {
    if (!profile || !quickEditField) return;
    setIsSaving(true);
    try {
      const patch = quickEditField === 'name'
        ? { display_name: draftValue.trim() }
        : { bio: draftValue.trim() || null };
      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', profile.id);
      if (error) throw error;
      setProfile((current) => current ? {
        ...current,
        ...(quickEditField === 'name' ? { display_name: draftValue.trim() } : { bio: draftValue.trim() || null }),
      } : current);
      markSaved();
      setQuickEditField(null);
      addToast({ message: 'Profile updated.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to update profile.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const joined = useMemo(() => profile
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
    : '', [profile]);

  if (isLoading) {
    return <main className="ss-bg-geometric-muted flex min-h-[70vh] items-center justify-center text-gray-400">Loading profile…</main>;
  }

  if (notFound || !profile) {
    return (
      <main className="ss-bg-geometric-muted flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <div className="rounded-3xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
          <UserRound className="mx-auto text-gray-600" size={36} />
          <h1 className="mt-4 text-2xl font-bold text-white">Off the radar</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">This profile isn’t available right now.</p>
          <div className="mt-6"><Button variant="secondary" onClick={() => navigate('/')}>Back to SwingSphere</Button></div>
        </div>
      </main>
    );
  }

  return (
    <main className="ss-bg-geometric-muted min-h-full flex-grow overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
        <section className="overflow-hidden rounded-[30px] border border-white/10 bg-black/45 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="relative h-48 bg-gradient-to-br from-red-950/60 via-zinc-950 to-black sm:h-56">
            {profileMedia.bannerUrl ? <img src={profileMedia.bannerUrl} alt="" className="h-full w-full object-cover opacity-75" /> : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/70 to-transparent" />
            <div className="absolute -bottom-9 left-6 h-24 w-24 sm:-bottom-10 sm:left-8 sm:h-28 sm:w-28">
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] border-4 border-[#090a0f] bg-gradient-to-br from-red-500/30 via-zinc-900 to-black text-3xl font-black text-white shadow-xl">
                {profileMedia.avatarUrl || profile.avatar_url
                  ? <img src={profileMedia.avatarUrl || profile.avatar_url || ''} alt="" className="h-full w-full object-cover" />
                  : initialsFor(profile.display_name)}
              </div>
            </div>
          </div>

          <div className="px-6 pb-7 pt-12 sm:min-h-[8.5rem] sm:px-8 sm:pb-8 sm:pl-44 sm:pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[11px] font-semibold text-gray-300">SwingSphere member</span>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                  <ShieldCheck size={12} aria-hidden="true" /> Admin view
                </span>
              ) : null}
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${profile.profile_visibility === 'private' ? 'border-white/10 bg-black/20 text-gray-400' : 'border-white/10 bg-black/20 text-gray-500'}`}>
                {profile.profile_visibility === 'private' ? <LockKeyhole size={12} aria-hidden="true" /> : null}
                {profile.profile_visibility === 'private' ? 'Private to visitors' : 'Visible by link'}
              </span>
              {isAdmin && profile.status && profile.status !== 'active' ? (
                <span className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-[11px] font-bold capitalize text-red-200">{profile.status}</span>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{profile.display_name}</h1>
              {isEditing && !isAdvancedEditorOpen ? <button type="button" onClick={() => openQuickEdit('name')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/70 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit name</button> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5"><AtSign size={15} />{profile.handle}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} /> Member since {joined}</span>
            </div>
          </div>

          {badges.length ? (
            <div className="border-t border-white/10 px-6 py-5 sm:px-8 sm:py-6">
              <BadgeShelf badges={badges} limit={6} />
            </div>
          ) : null}

          <div className="border-t border-white/10 px-6 py-6 sm:px-8 sm:py-7">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">About</p>
            <div className="mt-3 flex items-start gap-3">
              <p className="max-w-3xl flex-1 text-base leading-7 text-gray-300">{profile.bio || 'This member has chosen not to add public profile details.'}</p>
              {isEditing && !isAdvancedEditorOpen ? <button type="button" onClick={() => openQuickEdit('bio')} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-red-300/35 bg-black/70 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit bio</button> : null}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-5 text-sm leading-6 text-gray-500 backdrop-blur-xl sm:p-6">
          {isAdmin
            ? 'Admin preview: this view can include a private member profile and achievements the member has not published. Their public visibility setting remains unchanged.'
            : 'SwingSphere does not display this member’s saves, attendance, recently viewed places, associations, or private activity. Their approved reviews remain attached to the club or event where they were posted.'}
        </section>
      </div>
      {quickEditField ? (
        <aside className="fixed bottom-24 right-4 z-[1500] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/15 bg-[#111217]/98 p-4 text-white shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-300">Quick edit</p><h2 className="mt-1 text-lg font-black">{quickEditField === 'name' ? 'Display name' : 'Profile bio'}</h2></div>
            <button type="button" onClick={() => setQuickEditField(null)} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
          </div>
          {quickEditField === 'name' ? (
            <input autoFocus value={draftValue} onChange={(event) => { setDraftValue(event.target.value); markUnsaved(); }} className="mt-4 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none focus:border-red-300/60" />
          ) : (
            <textarea autoFocus rows={8} maxLength={280} value={draftValue} onChange={(event) => { setDraftValue(event.target.value); markUnsaved(); }} className="mt-4 w-full resize-y rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-red-300/60" />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setQuickEditField(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10">Cancel</button>
            <button type="button" onClick={() => void saveQuickEdit()} disabled={isSaving || (quickEditField === 'name' && !draftValue.trim())} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Check size={16} />{isSaving ? 'Saving…' : 'Save change'}</button>
          </div>
        </aside>
      ) : null}
      <Footer />
    </main>
  );
};

export default PublicProfilePage;
