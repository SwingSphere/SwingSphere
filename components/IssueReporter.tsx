import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Flag, CheckCircle2 } from 'lucide-react';
import AdminDetailDialog from './admin/AdminDetailDialog';
import { issueCategories, submitSiteIssue, type IssueCategory } from '../lib/issueReports';

const IssueReporter: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [context, setContext] = useState<{ path: string; title: string } | null>(null);
  const [category, setCategory] = useState<IssueCategory>('bug');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const listingPage = /^\/(?:mobile\/|tablet\/)?(?:clubs|events|hosts|venues|resorts|cruises)\/[^/]+/.test(pathname);
  const close = () => { if (!saving) setContext(null); };
  const open = () => {
    setContext({ path: pathname, title: document.title.slice(0, 160) });
    setCategory(listingPage ? 'listing' : 'bug');
    setDescription(''); setWebsite(''); setReceipt(''); setError('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!context || saving || description.trim().length < 12) return;
    setSaving(true); setError('');
    try {
      const id = await submitSiteIssue({ pagePath: context.path, pageTitle: context.title, category, description, website });
      setReceipt(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to submit the report. Please try again.');
    } finally { setSaving(false); }
  };
  const deviceRoute = /^\/(mobile|tablet)(\/|$)/.test(pathname);
  return (
    <>
      <button type="button" onClick={open} aria-haspopup="dialog" className={`fixed left-3 z-40 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/45 px-3 py-1.5 text-[11px] text-gray-400 backdrop-blur-sm transition hover:border-white/20 hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${deviceRoute ? 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]'}`}>
        <Flag size={12} aria-hidden="true" /> Report issue
      </button>
      {context ? (
        <AdminDetailDialog title="Report an issue" tone="dark" compact onClose={close}>
          {receipt ? (
            <div className="space-y-4 py-3">
              <CheckCircle2 className="text-emerald-400" size={28} />
              <h3 className="text-lg font-semibold">Thanks for letting us know.</h3>
              <p role="status" className="text-sm leading-6 text-gray-400">Your report has been sent to SwingSphere for review. Reports are private and do not appear on the listing.</p>
              <p className="text-xs text-gray-500">Reference: {receipt.slice(0, 8)}</p>
              <button type="button" onClick={close} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Done</button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-5">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">About this page</p><p className="mt-1 break-words text-sm text-gray-300">{context.title || 'SwingSphere'}</p><p className="mt-1 break-all text-xs text-gray-500">{context.path}</p></div>
              <label className="block text-sm font-medium text-gray-300">What would you like to report?
                <select value={category} onChange={(event) => setCategory(event.target.value as IssueCategory)} disabled={saving} className="mt-2 w-full rounded-lg border border-white/15 bg-[#1c2027] px-3 py-2.5 text-sm text-gray-100">
                  {issueCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-300">Details
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} required minLength={12} maxLength={2000} rows={5} placeholder={category === 'bug' ? 'What happened, and what were you expecting? Include steps that help us reproduce it.' : 'Describe the issue and any information that would help us check it.'} className="mt-2 w-full resize-y rounded-lg border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500" />
                <span className="mt-1 block text-right text-[11px] text-gray-500">{description.length}/2000</span>
              </label>
              <div className="hidden" aria-hidden="true"><label>Website<input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></label></div>
              <p className="text-xs leading-5 text-gray-500">You can report without an account. Include only what is needed to review the issue; do not include passwords or private contact details.{category === 'content_safety' ? ' This inbox is not monitored for emergencies.' : ''}</p>
              {error ? <div role="alert" className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => { if (!saving) { setContext(null); navigate('/contact'); } }} disabled={saving} className="text-xs text-gray-500 underline hover:text-gray-300">Contact SwingSphere</button>
                <button type="submit" disabled={saving || description.trim().length < 12} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40">{saving ? 'Sending…' : 'Send report'}</button>
              </div>
            </form>
          )}
        </AdminDetailDialog>
      ) : null}
    </>
  );
};
export default IssueReporter;
