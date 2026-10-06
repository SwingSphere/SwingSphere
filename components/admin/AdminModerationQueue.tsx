import React, { useEffect, useState } from 'react';
import AdminDetailDialog from './AdminDetailDialog';
import { getAdminSiteIssues, updateAdminSiteIssue, issueCategories, issueStatusLabels, type IssueStatus, type SiteIssue } from '../../lib/issueReports';
import { getPendingWrittenReviews, moderateWrittenReview, type PendingWrittenReview } from '../../lib/feedback/adminFeedbackModeration';

type AdminModerationQueueProps = { onDataChange: () => void };
type QueueTab = 'reviews' | 'reports';

const categoryLabel = (value: string) => issueCategories.find((item) => item.value === value)?.label || value;

const AdminModerationQueue: React.FC<AdminModerationQueueProps> = ({ onDataChange }) => {
  const [tab, setTab] = useState<QueueTab>('reviews');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Moderation Queue</h1>
        <p className="mt-2 text-sm text-gray-500">Review member-submitted written reviews and private site reports from one place.</p>
      </div>
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <button type="button" onClick={() => setTab('reviews')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'reviews' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Written reviews</button>
        <button type="button" onClick={() => setTab('reports')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'reports' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Site reports</button>
      </div>
      {tab === 'reviews' ? <WrittenReviewQueue onDataChange={onDataChange} /> : <SiteReportQueue onDataChange={onDataChange} />}
    </div>
  );
};

const WrittenReviewQueue: React.FC<{ onDataChange: () => void }> = ({ onDataChange }) => {
  const [items, setItems] = useState<PendingWrittenReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<PendingWrittenReview | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getPendingWrittenReviews()
      .then((result) => { if (active) setItems(result); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load written reviews.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-gray-900">Written reviews awaiting moderation</h2><p className="mt-1 text-sm text-gray-500">Approve, reject, or request a revision before written review text becomes public.</p></div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700">Refresh</button>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load written review moderation. {error}</div> : loading ? <p role="status" className="p-6 text-gray-500">Loading reviews…</p> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {!items.length ? <div className="p-8 text-center text-gray-500">No written reviews are awaiting moderation.</div> : <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <button key={item.revisionId} type="button" onClick={() => setSelected(item)} className="grid w-full gap-3 p-5 text-left hover:bg-blue-50/40 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-blue-700">{item.targetType}</span>{item.targetState ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">{item.targetState}</span> : null}</div>
                  <p className="mt-1 font-semibold text-gray-900">{item.targetName}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">{item.text}</p>
                </div>
                <div className="text-xs text-gray-500">{new Date(item.submittedAt).toLocaleString()}<p className="mt-2 font-semibold text-blue-600">Moderate →</p></div>
              </button>
            ))}
          </div>}
        </div>
      )}
      {selected ? <WrittenReviewDialog review={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setRevision((value) => value + 1); onDataChange(); }} /> : null}
    </section>
  );
};

const WrittenReviewDialog: React.FC<{ review: PendingWrittenReview; onClose: () => void; onSaved: () => void }> = ({ review, onClose, onSaved }) => {
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'needs_revision'>('approved');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try { await moderateWrittenReview(review.revisionId, decision, undefined, note); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to moderate review.'); }
    finally { setSaving(false); }
  };
  return <AdminDetailDialog title="Moderate written review" compact onClose={() => { if (!saving) onClose(); }}>
    <div className="space-y-5">
      <div><p className="text-xs font-bold uppercase tracking-wide text-blue-600">{review.targetType}</p><h3 className="mt-1 text-lg font-bold">{review.targetName}</h3><p className="mt-1 break-all text-xs text-gray-400">{review.targetId}</p></div>
      <p className="whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{review.text}</p>
      <label className="block text-sm font-semibold">Decision<select value={decision} disabled={saving} onChange={(event) => setDecision(event.target.value as typeof decision)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"><option value="approved">Approve</option><option value="needs_revision">Needs revision</option><option value="rejected">Reject</option></select></label>
      <label className="block text-sm font-semibold">Private moderation note <span className="font-normal text-gray-400">(optional)</span><textarea value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save decision'}</button></div>
    </div>
  </AdminDetailDialog>;
};

const SiteReportQueue: React.FC<{ onDataChange: () => void }> = ({ onDataChange }) => {
  const [items, setItems] = useState<SiteIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('open');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SiteIssue | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getAdminSiteIssues(status, offset).then((result) => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load reports.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, offset, revision]);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-xl font-bold text-gray-900">Site reports</h2><p className="mt-1 text-sm text-gray-500">Private reports from visitors: listing corrections, broken links, bugs, and content or safety concerns.</p></div>
        <div className="flex gap-2">
          <select aria-label="Report status" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800">
            <option value="open">Open reports</option><option value="all">All reports</option>
            {Object.entries(issueStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" onClick={() => setRevision((value) => value + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700">Refresh</button>
        </div>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load the issue inbox. {error}</div> : loading ? <p role="status" className="p-6 text-gray-500">Loading reports…</p> : (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {!items.length ? <div className="p-8 text-center text-gray-500">No reports match this filter.</div> : <div className="divide-y divide-gray-100">
            {items.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className="grid w-full gap-3 p-5 text-left hover:bg-blue-50/40 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="text-xs font-bold text-blue-700">{categoryLabel(item.category)}</span><span className="text-xs text-gray-500">· {issueStatusLabels[item.status]}</span></div><p className="mt-1 truncate font-semibold text-gray-900">{item.pageTitle || item.pagePath}</p><p className="mt-1 break-all text-xs text-gray-400">{item.pagePath}</p><p className="mt-2 line-clamp-2 text-sm text-gray-600">{item.description}</p></div>
              <div className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}<p className="mt-2 font-semibold text-blue-600">Review report →</p></div>
            </button>)}
          </div>}
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>{total ? offset + 1 : 0}–{Math.min(offset + items.length, total)} of {total}</span>
            <div className="flex gap-3"><button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0,value-50))} className="font-semibold text-blue-600 disabled:text-gray-300">Previous</button><button type="button" disabled={offset + 50 >= total} onClick={() => setOffset((value) => value+50)} className="font-semibold text-blue-600 disabled:text-gray-300">Next</button></div>
          </div>
        </section>
      )}
      {selected ? <IssueReview key={selected.id} issue={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setRevision((value) => value+1); onDataChange(); }} /> : null}
    </section>
  );
};

const IssueReview: React.FC<{ issue: SiteIssue; onClose: () => void; onSaved: () => void }> = ({ issue, onClose, onSaved }) => {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try { await updateAdminSiteIssue(issue.id, status, note); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update report.'); }
    finally { setSaving(false); }
  };
  return <AdminDetailDialog title="Review report" compact onClose={() => { if (!saving) onClose(); }}>
    <div className="space-y-5">
      <div><p className="text-xs font-bold text-blue-600">{categoryLabel(issue.category)}</p><h3 className="mt-1 break-words text-lg font-bold">{issue.pageTitle || issue.pagePath}</h3><a href={issue.pagePath} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-blue-600 underline">Open reported page: {issue.pagePath}</a><p className="mt-2 text-xs text-gray-500">{new Date(issue.createdAt).toLocaleString()} · {issue.fromMember ? 'Signed-in member' : 'Guest'} · {issue.id.slice(0,8)}</p></div>
      <p className="whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{issue.description}</p>
      <label className="block text-sm font-semibold">Status<select value={status} disabled={saving} onChange={(event) => setStatus(event.target.value as IssueStatus)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm">{Object.entries(issueStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-semibold">Private admin note <span className="font-normal text-gray-400">(optional)</span><textarea value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label>
      {issue.actions.length ? <div><h4 className="text-sm font-bold">Review history</h4><div className="mt-2 space-y-2">{issue.actions.map((action,index) => <div key={index} className="rounded-lg border border-gray-100 p-3 text-xs text-gray-500"><p>{issueStatusLabels[action.previousStatus]} → {issueStatusLabels[action.nextStatus]} · {new Date(action.createdAt).toLocaleString()}</p>{action.note ? <p className="mt-1 whitespace-pre-wrap break-words text-gray-700">{action.note}</p> : null}</div>)}</div></div> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end"><button type="button" disabled={saving || (status === issue.status && !note.trim())} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save review'}</button></div>
    </div>
  </AdminDetailDialog>;
};

export default AdminModerationQueue;

