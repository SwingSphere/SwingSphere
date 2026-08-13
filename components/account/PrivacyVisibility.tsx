import React, { useEffect, useState } from 'react';
import { Check, Eye, Link2, LockKeyhole, MapPin, Save, UsersRound } from 'lucide-react';
import type { ProfilePrivacySettings, ProfileVisibility } from '../../lib/profile/profileTypes';
import Button from '../Button';

const options: Array<{
  value: ProfileVisibility;
  title: string;
  icon: typeof LockKeyhole;
  description: string;
  consequence: string;
}> = [
  {
    value: 'private',
    title: 'Private',
    icon: LockKeyhole,
    description: 'Your member page is not available to other people.',
    consequence: 'Your display name and @username may still identify approved reviews. The username shows a private-profile lock instead of opening a page.',
  },
  {
    value: 'visible',
    title: 'Visible by link',
    icon: Link2,
    description: 'People can open your member profile from your username or a direct link.',
    consequence: 'People need your exact @username link or direct profile URL. SwingSphere does not surface the profile anywhere else.',
  },
];

const PrivacyVisibility: React.FC<{
  privacy: ProfilePrivacySettings | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  onSave: (profileVisibility: ProfileVisibility) => Promise<unknown>;
  onSaved: (profileVisibility: ProfileVisibility) => void;
}> = ({ privacy, isLoading, isSaving, error, onSave, onSaved }) => {
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('private');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    if (!privacy) return;
    setProfileVisibility(privacy.profileVisibility);
  }, [privacy]);

  const save = async () => {
    try {
      await onSave(profileVisibility);
      setSavedMessage(profileVisibility === 'visible'
        ? 'Saved. Your profile is now visible by link.'
        : 'Saved. Your profile is now private.');
      onSaved(profileVisibility);
    } catch {
      // The hook exposes the actionable error below without crashing the account route.
    }
  };

  const baselineVisibility = privacy?.profileVisibility ?? 'private';
  const hasChanges = baselineVisibility !== profileVisibility;

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Privacy and visibility</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Who can open your profile?</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
          SwingSphere keeps your profile private by default. This setting only controls whether the member page behind your @username can open. It does not publish your saves, attendance, views, associations, email, or precise location.
        </p>

        {!isLoading && error && !privacy ? (
          <div role="alert" className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-4 text-sm leading-6 text-amber-100">
            The privacy controls are available, but this Supabase project has not loaded the profile-privacy record yet. You can choose a setting below; saving will work after the pending profile migration is deployed.
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-black/25 p-5 text-sm text-gray-400">Loading privacy settings…</div>
        ) : (
          <fieldset className="mt-7 grid gap-3 md:grid-cols-2">
            <legend className="sr-only">Profile visibility</legend>
            {options.map((option) => {
              const Icon = option.icon;
              const selected = profileVisibility === option.value;
              return (
                <label
                  key={option.value}
                  className={`relative cursor-pointer rounded-[22px] border p-5 transition ${
                    selected
                      ? 'border-red-400/45 bg-red-500/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]'
                      : 'border-white/[0.08] bg-black/20 hover:border-white/15'
                  }`}
                >
                  <input
                    type="radio"
                    name="profile-visibility"
                    value={option.value}
                    checked={selected}
                    onChange={() => {
                      setProfileVisibility(option.value);
                      setSavedMessage('');
                    }}
                    className="sr-only"
                  />
                  <div className="flex items-start justify-between gap-4">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${selected ? 'border-red-300/25 bg-red-500/12 text-red-200' : 'border-white/10 bg-white/[0.035] text-gray-400'}`}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    {selected ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white"><Check size={14} aria-hidden="true" /></span> : null}
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{option.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-gray-300">{option.description}</p>
                  <p className="mt-3 text-xs leading-5 text-gray-500">{option.consequence}</p>
                </label>
              );
            })}
          </fieldset>
        )}
      </section>

      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Private regardless of profile state</p>
        <h3 className="mt-2 text-xl font-bold text-white">Your discovery activity stays yours</h3>
        <div className="mt-5 divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-black/20 px-4 sm:px-5">
          <PrivacyRow icon={LockKeyhole} title="Saved places and events" value="Only you" copy="Collections remain private unless a future collection is deliberately shared." />
          <PrivacyRow icon={Eye} title="Recently viewed" value="Only you" copy="Not displayed on your member profile." />
          <PrivacyRow icon={MapPin} title="Attendance and location" value="Only you" copy="Precise location and attendance are never inferred as visible profile fields." />
          <PrivacyRow icon={UsersRound} title="Relationships and associations" value="Participants only" copy="Future account links remain private unless every participant explicitly publishes a shared label." />
        </div>
      </section>

      {error && privacy ? <div role="alert" className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className="ss-glass-surface flex items-center gap-3 rounded-2xl p-2.5">
          <span aria-live="polite" className="hidden px-2 text-xs text-gray-500 sm:inline">
            {savedMessage || (hasChanges ? 'Unsaved privacy changes' : 'Current privacy setting is saved')}
          </span>
          <Button variant="primary" onClick={() => void save()} disabled={isLoading || isSaving}>
            <span className="inline-flex items-center gap-2"><Save size={16} aria-hidden="true" />{isSaving ? 'Saving…' : 'Save privacy'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

const PrivacyRow: React.FC<{
  icon: typeof LockKeyhole;
  title: string;
  value: string;
  copy: string;
}> = ({ icon: Icon, title, value, copy }) => (
  <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 shrink-0 text-gray-500" size={17} aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-gray-200">{title}</p>
        <p className="mt-1 text-xs leading-5 text-gray-500">{copy}</p>
      </div>
    </div>
    <span className="justify-self-start rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-gray-300 sm:justify-self-end">{value}</span>
  </div>
);

export default PrivacyVisibility;
