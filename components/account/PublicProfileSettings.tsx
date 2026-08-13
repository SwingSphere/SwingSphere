import React, { useEffect, useMemo, useState } from 'react';
import { AtSign, ExternalLink, Link2, LockKeyhole, Pencil, Save } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import type { MediaAsset } from '../../lib/media/types';
import type { ProfilePrivacySettings } from '../../lib/profile/profileTypes';
import { useAppStore } from '../../store/appStore';
import Button from '../Button';
import MediaUploader from '../media/MediaUploader';

const normalizeHandle = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

const visibilityMeta = {
  private: { icon: LockKeyhole, label: 'Private', copy: 'Only your review attribution is visible; the member page stays unavailable.' },
  visible: { icon: Link2, label: 'Visible by link', copy: 'People can open your member page from your username or an exact link.' },
} as const;

const PublicProfileSettings: React.FC<{
  currentUser: User;
  privacy: ProfilePrivacySettings | null;
  isPrivacyLoading: boolean;
}> = ({ currentUser, privacy, isPrivacyLoading }) => {
  const location = useLocation();
  const { updateUserProfile, addToast } = useAppStore();
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [handle, setHandle] = useState(currentUser.handle ?? '');
  const [bio, setBio] = useState(currentUser.bio ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isIdentityDirty, setIsIdentityDirty] = useState(false);

  useEffect(() => {
    if (isIdentityDirty) return;
    setDisplayName(currentUser.displayName);
    setHandle(currentUser.handle ?? '');
    setBio(currentUser.bio ?? '');
  }, [currentUser, isIdentityDirty]);

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, [location.hash]);

  const visibility = privacy?.profileVisibility ?? 'private';
  const meta = visibilityMeta[visibility];
  const VisibilityIcon = meta.icon;
  const publicProfilePath = useMemo(
    () => visibility !== 'private' && currentUser.handle ? `/users/${currentUser.handle}` : null,
    [currentUser.handle, visibility],
  );

  const saveIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextDisplayName = displayName.trim();
    const nextHandle = normalizeHandle(handle);
    const nextBio = bio.trim();

    if (!nextDisplayName) {
      addToast({ message: 'Display name is required.', type: 'error' });
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(nextHandle)) {
      addToast({ message: 'Username must be 3–40 characters using letters, numbers, or hyphens.', type: 'error' });
      return;
    }
    if (nextBio.length > 280) {
      addToast({ message: 'Bio must be 280 characters or fewer.', type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      await updateUserProfile(currentUser.id, {
        displayName: nextDisplayName,
        email: currentUser.email,
        handle: nextHandle,
        bio: nextBio,
      });
      setHandle(nextHandle);
      setIsIdentityDirty(false);
      addToast({ message: 'Profile details saved.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to save profile details.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUploaded = async (asset: MediaAsset) => {
    const avatarUrl = getCloudflareImageUrl({ externalId: asset.external_id, variant: 'avatarsquare' });
    if (!avatarUrl) {
      addToast({ message: 'The image uploaded, but SwingSphere could not create its delivery URL.', type: 'error' });
      return;
    }

    try {
      await updateUserProfile(currentUser.id, {
        displayName: currentUser.displayName,
        email: currentUser.email,
        handle: currentUser.handle ?? '',
        bio: currentUser.bio ?? '',
        avatarUrl,
      });
      addToast({ message: 'Profile picture updated.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'The image uploaded, but could not be attached to your profile.', type: 'error' });
    }
  };

  const handleBannerUploaded = async (asset: MediaAsset) => {
    const bannerUrl = getCloudflareImageUrl({ externalId: asset.external_id, variant: 'heropage' });
    if (!bannerUrl) {
      addToast({ message: 'The banner uploaded, but SwingSphere could not create its delivery URL.', type: 'error' });
      return;
    }

    try {
      await updateUserProfile(currentUser.id, {
        displayName: currentUser.displayName,
        email: currentUser.email,
        handle: currentUser.handle ?? '',
        bio: currentUser.bio ?? '',
      });
      addToast({ message: 'Profile banner updated.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'The banner uploaded, but your profile could not be refreshed.', type: 'error' });
    }
  };

  const reportMediaError = (message: string) => addToast({ message, type: 'error' });

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Profile</p>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">Your member profile</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Your display name, username, and profile picture identify approved reviews. Your full member page remains private unless you make it visible by link.
            </p>
          </div>
          <span className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-gray-200">
            <VisibilityIcon size={15} aria-hidden="true" />
            {isPrivacyLoading ? 'Checking…' : meta.label}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.07] pt-4">
          <p className="mr-auto text-xs leading-5 text-gray-500">{meta.copy}</p>
          {publicProfilePath ? (
            <Link to={publicProfilePath} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-gray-200 transition hover:border-red-400/35 hover:text-white">
              <ExternalLink size={14} aria-hidden="true" /> Preview
            </Link>
          ) : null}
          <Link to="/account/privacy" className="inline-flex min-h-9 items-center rounded-xl px-2 text-xs font-bold text-red-300 transition hover:text-red-200">
            Change visibility
          </Link>
        </div>
      </section>

      <section className="ss-glass-surface overflow-hidden rounded-[26px]">
        <MediaUploader
          triggerOnly
          inputId="member-banner-upload"
          ownerType="user"
          ownerId={currentUser.id}
          role="hero"
          label="profile banner"
          onUploaded={(asset) => void handleBannerUploaded(asset)}
          onError={reportMediaError}
        />
        <MediaUploader
          triggerOnly
          inputId="member-avatar-upload"
          ownerType="user"
          ownerId={currentUser.id}
          role="avatar"
          label="profile picture"
          onUploaded={(asset) => void handleAvatarUploaded(asset)}
          onError={reportMediaError}
        />

        <div id="profile-banner" className="relative h-44 bg-gradient-to-br from-red-950/60 via-zinc-950 to-black sm:h-52">
          {currentUser.bannerUrl ? <img src={currentUser.bannerUrl} alt="" className="h-full w-full object-cover" /> : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
          <button
            type="button"
            onClick={() => document.getElementById('member-banner-upload')?.click()}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-lg backdrop-blur-md transition hover:border-red-300/55 hover:bg-red-500/20"
            aria-label="Change profile banner"
            title="Change profile banner"
          >
            <Pencil size={16} aria-hidden="true" />
          </button>

          <div id="profile-photo" className="absolute -bottom-8 left-5 h-24 w-24 scroll-mt-24 sm:-bottom-10 sm:left-7 sm:h-28 sm:w-28">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[26px] border-4 border-[#090a0f] bg-gradient-to-br from-red-500/25 via-zinc-900 to-black text-2xl font-black text-white shadow-xl">
              {currentUser.avatarUrl
                ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                : currentUser.displayName.slice(0, 2).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('member-avatar-upload')?.click()}
              className="absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[#111218] text-white shadow-lg transition hover:border-red-300/55 hover:bg-red-500/20"
              aria-label="Change profile picture"
              title="Change profile picture"
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 pt-12 sm:min-h-[7.5rem] sm:px-7 sm:pb-7 sm:pl-40 sm:pt-5">
          <h3 className="text-xl font-black text-white">{currentUser.displayName}</h3>
          <p className="mt-0.5 text-sm text-gray-500">@{currentUser.handle}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            {currentUser.bio || 'No bio yet. Add one below if you want visitors to see more when your profile is visible by link.'}
          </p>
        </div>
      </section>

      <form onSubmit={saveIdentity} className="ss-glass-surface rounded-[26px] p-5 sm:p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Profile details</p>
          <h3 className="mt-1.5 text-xl font-bold text-white">Identity & bio</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
            Your display name and @username appear on authored reviews. Your profile picture may appear with those reviews. Your bio appears only when your member page is visible by link.
          </p>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <ProfileInput label="Display name" value={displayName} onChange={(value) => { setDisplayName(value); setIsIdentityDirty(true); }} maxLength={80} helper="Shown as your author name on reviews." />
          <ProfileInput label="Username" value={handle} onChange={(value) => { setHandle(normalizeHandle(value)); setIsIdentityDirty(true); }} maxLength={40} prefix="@" helper="Used for contribution links and your member-profile URL." />
        </div>

        <div className="mt-5">
          <label htmlFor="member-profile-bio" className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Bio</label>
          <textarea
            id="member-profile-bio"
            value={bio}
            onChange={(event) => { setBio(event.target.value); setIsIdentityDirty(true); }}
            maxLength={280}
            rows={4}
            placeholder="Optional. Share only what you are comfortable making visible."
            className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-gray-600 focus:border-red-400/55 focus:ring-2 focus:ring-red-500/10"
          />
          <div className="mt-2 flex items-center justify-between gap-4 text-xs text-gray-500">
            <span>Visible only when your profile is visible by link.</span>
            <span className="tabular-nums">{bio.length}/280</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-white/[0.07] pt-4">
          <Button type="submit" variant="primary" disabled={isSaving}>
            <span className="inline-flex items-center gap-2"><Save size={16} aria-hidden="true" />{isSaving ? 'Saving…' : 'Save profile'}</span>
          </Button>
        </div>
      </form>

      <section className="rounded-[22px] border border-white/[0.08] bg-black/25 p-4 sm:p-5">
        <div className="flex gap-3">
          <AtSign className="mt-0.5 shrink-0 text-gray-500" size={18} aria-hidden="true" />
          <p className="text-sm leading-6 text-gray-400">
            A private profile does not make an authored review anonymous. Your display name, @username, and review attribution remain visible while the member page itself stays unavailable.
          </p>
        </div>
      </section>
    </div>
  );
};

const ProfileInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  helper: string;
  prefix?: string;
}> = ({ label, value, onChange, maxLength, helper, prefix }) => {
  const inputId = `profile-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{label}</label>
      <div className="relative mt-2">
        {prefix ? <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">{prefix}</span> : null}
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          required
          className={`w-full rounded-2xl border border-white/10 bg-black/25 py-3 pr-4 text-sm text-white outline-none transition focus:border-red-400/55 focus:ring-2 focus:ring-red-500/10 ${prefix ? 'pl-8' : 'pl-4'}`}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">{helper}</p>
    </div>
  );
};

export default PublicProfileSettings;
