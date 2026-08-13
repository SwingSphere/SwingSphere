import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import { useAppStore } from '../../store/appStore';
import { supabase } from '../../lib/supabase';
import { deleteMyAccount, getAccountDeletionPreview, type AccountDeletionPreview } from '../../lib/accountDeletion';

const AccountDeletionCard: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const { addToast } = useAppStore();
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAccountDeletionPreview()
      .then((result) => { if (mounted) setPreview(result); })
      .catch((error) => console.error('Unable to load account deletion preview:', error))
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const canSubmit = Boolean(
    preview?.canDelete
    && password
    && confirmation.trim().toUpperCase() === 'DELETE'
    && !isDeleting,
  );

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsDeleting(true);
    try {
      const receipt = await deleteMyAccount(currentUser.email, password);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      addToast({ message: `Account deleted. Receipt ${receipt.receiptCode || receipt.requestId}.`, type: 'success' });
      navigate('/', { replace: true });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Account deletion failed.', type: 'error' });
      try { setPreview(await getAccountDeletionPreview()); } catch { /* keep current preview */ }
      setIsDeleting(false);
    }
  };

  return (
    <section className="rounded-[26px] border border-red-400/15 bg-red-950/10 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.08] text-red-200"><Trash2 size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold text-white">Delete account</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-400">Permanently remove your SwingSphere login/profile and private account data. Limited moderation, safety, fraud-prevention, and published contribution records may remain only in anonymized form where SwingSphere needs to preserve the record.</p>

          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Checking deletion requirements…</div>
          ) : preview?.blockers?.length ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
              <div className="flex items-center gap-2 font-bold"><AlertTriangle size={17} /> Deletion is currently blocked</div>
              <ul className="mt-2 list-inside list-disc space-y-1 text-amber-100/80">
                {preview.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}
              </ul>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-500/[0.06] px-2.5 py-1 text-emerald-200"><CheckCircle2 size={13} /> Eligible for self-service deletion</span>
              {preview?.mediaCount ? <span>{preview.mediaCount} profile image{preview.mediaCount === 1 ? '' : 's'} will be deleted from Cloudflare Images first.</span> : <span>No profile media requires external cleanup.</span>}
            </div>
          )}

          {!preview?.blockers?.length ? (
            isOpen ? (
              <form onSubmit={handleDelete} className="mt-5 max-w-xl rounded-2xl border border-red-400/20 bg-black/20 p-4">
                <div className="text-sm font-bold text-red-100">This cannot be undone.</div>
                <p className="mt-1 text-xs leading-5 text-gray-500">For security, enter your current password. SwingSphere reauthenticates directly with Supabase before the deletion request can proceed.</p>
                <label className="mt-4 block text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Current password</label>
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-red-400/50" required />
                <label className="mt-4 block text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Type DELETE to confirm</label>
                <input type="text" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-bold tracking-wider text-white outline-none focus:border-red-400/50" required />
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="submit" disabled={!canSubmit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">
                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} {isDeleting ? 'Deleting account…' : 'Permanently delete account'}
                  </button>
                  <button type="button" disabled={isDeleting} onClick={() => { setIsOpen(false); setPassword(''); setConfirmation(''); }} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-bold text-gray-300 hover:bg-white/[0.04]">Cancel</button>
                </div>
              </form>
            ) : (
              <button type="button" disabled={isLoading || !preview?.canDelete} onClick={() => setIsOpen(true)} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-red-400/25 bg-red-500/[0.08] px-4 text-sm font-bold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40">Start account deletion</button>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default AccountDeletionCard;
