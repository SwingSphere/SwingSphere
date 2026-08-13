import React, { useEffect, useState } from 'react';
import { KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import { useAppStore } from '../../store/appStore';
import Button from '../Button';
import AccountDeletionCard from './AccountDeletionCard';

const AccountSettingsPage: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const { updateUserProfile, requestPasswordReset, logout, addToast } = useAppStore();
  const [email, setEmail] = useState(currentUser.email);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => setEmail(currentUser.email), [currentUser.email]);

  const saveEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail || nextEmail === currentUser.email) return;
    setIsSavingEmail(true);
    try {
      await updateUserProfile(currentUser.id, {
        displayName: currentUser.displayName,
        email: nextEmail,
        handle: currentUser.handle ?? '',
        bio: currentUser.bio ?? '',
      });
      addToast({ message: 'Check both email addresses to confirm the change.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to update email.', type: 'error' });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const sendPasswordReset = async () => {
    setIsSendingReset(true);
    try {
      await requestPasswordReset(currentUser.email);
      addToast({ message: 'Password reset email sent.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to send password reset email.', type: 'error' });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to log out.', type: 'error' });
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Account settings</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Security and account</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Manage private login information separately from the identity shown with your reviews.</p>
      </section>

      <form onSubmit={saveEmail} className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-red-200"><Mail size={20} aria-hidden="true" /></span>
          <div>
            <h3 className="text-xl font-bold text-white">Login email</h3>
            <p className="mt-1 text-sm leading-6 text-gray-400">Private. This is not displayed on reviews, your member profile, or organizer pages.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="account-email" className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Email address</label>
            <input id="account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-red-400/55 focus:ring-2 focus:ring-red-500/10" />
          </div>
          <Button type="submit" variant="primary" disabled={isSavingEmail || email.trim() === currentUser.email}>{isSavingEmail ? 'Saving…' : 'Update email'}</Button>
        </div>
      </form>

      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-red-200"><KeyRound size={20} aria-hidden="true" /></span>
            <div>
              <h3 className="text-xl font-bold text-white">Password</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-gray-400">SwingSphere will send a secure reset link to your private login email.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => void sendPasswordReset()} disabled={isSendingReset}>{isSendingReset ? 'Sending…' : 'Send reset email'}</Button>
        </div>
      </section>

      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-gray-300"><LogOut size={20} aria-hidden="true" /></span>
            <div>
              <h3 className="text-xl font-bold text-white">Current session</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-gray-400">Log out of SwingSphere on this browser.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => void handleLogout()} disabled={isLoggingOut}>{isLoggingOut ? 'Logging out…' : 'Log out'}</Button>
        </div>
      </section>

      <AccountDeletionCard currentUser={currentUser} />

      <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-black/25 p-5 text-sm leading-6 text-gray-500">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        Organizer permissions, administrator capabilities, and verification status are managed separately from public member-profile identity.
      </div>
    </div>
  );
};

export default AccountSettingsPage;
