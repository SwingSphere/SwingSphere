import React, { useEffect, useState } from 'react';
import AdminDetailDialog from './AdminDetailDialog';
import { getAdminSiteIssues, updateAdminSiteIssue, issueCategories, issueStatusLabels, type IssueStatus, type SiteIssue } from '../../lib/issueReports';
import { getPendingWrittenReviews, moderateWrittenReview, type PendingWrittenReview } from '../../lib/feedback/adminFeedbackModeration';
import { resolveBrandLogo, type BrandMediaCatalog } from '../../lib/entityBrandMedia';

type AdminModerationQueueProps = { onDataChange: () => void; mediaCatalog: BrandMediaCatalog };
type QueueTab = 'reviews' | 'reports';

const categoryLabel = (value: string) => issueCategories.find((item) => item.value === value)?.label || value;

const AdminModerationQueue: React.FC<AdminModerationQueueProps> = ({ onDataChange, mediaCatalog }) => {
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
      {tab === 'reviews' ? <WrittenReviewQueue onDataChange={onDataChange} mediaCatalog={mediaCatalog} /> : <SiteReportQueue onDataChange={onDataChange} />}
    </div>
  );
};

const WrittenReviewQueue: React.FC<{ onDataChange: () => void; mediaCatalog: BrandMediaCatalog }> = ({ onDataChange, mediaCatalog }) => {
  const [items, setItems] = useState<PendingWrittenReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [revisionRequest, setRevisionRequest] = useState<{ id: string; message: string } | null>(null);

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

  const moderate = async (item: PendingWrittenReview, decision: 'approved' | 'rejected' | 'needs_revision', message?: string) => {
    setSavingIds((current) => new Set(current).add(item.revisionId));
    setError('');
    try {
      await moderateWrittenReview(item.revisionId, decision, undefined, message);
      setItems((current) => current.filter((entry) => entry.revisionId !== item.revisionId));
      if (revisionRequest?.id === item.revisionId) setRevisionRequest(null);
      onDataChange();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to moderate review.');
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(item.revisionId);
        return next;
      });
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-gray-900">Written reviews awaiting moderation</h2><p className="mt-1 text-sm text-gray-500">Fast queue: approve or reject in one click; request a revision only when you need to send the member a note.</p></div>
        <div className="flex items-center gap-3">
          {!loading && !error ? <span className="text-sm font-semibold text-gray-500">{items.length} pending</span> : null}
          <button type="button" onClick={() => setRevision((value) => value + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700">Refresh</button>
        </div>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load written review moderation. {error}</div> : null}
      {loading ? <p role="status" className="p-6 text-gray-500">Loading reviews…</p> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {!items.length ? <div className="p-8 text-center text-gray-500">No written reviews are awaiting moderation.</div> : <div className="divide-y divide-gray-100">
            {items.map((item) => {
              const media = resolveBrandLogo(item.targetType, item.targetId, mediaCatalog);
              const isSaving = savingIds.has(item.revisionId);
              const isRevisionOpen = revisionRequest?.id === item.revisionId;
              return (
                <div key={item.revisionId} className="px-4 py-3 sm:px-5">
                  <div className="grid items-center gap-3 lg:grid-cols-[56px_minmax(150px,220px)_minmax(0,1fr)_auto]">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-lg font-bold text-gray-400">
                      {media.url ? <img src={media.url} alt="" className="h-full w-full object-cover" /> : item.targetName.slice(0,1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">{item.targetType}</span>{item.targetState ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{item.targetState}</span> : null}</div>
                      <p className="mt-1 truncate text-sm font-bold text-gray-900">{item.targetName}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{new Date(item.submittedAt).toLocaleString()}</p>
                    </div>
                    <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{item.text}</p>
                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                      <button type="button" disabled={isSaving} onClick={() => void moderate(item, 'approved')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40">Approve</button>
                      <button type="button" disabled={isSaving} onClick={() => setRevisionRequest(isRevisionOpen ? null : { id: item.revisionId, message: '' })} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40">Needs revision</button>
                      <button type="button" disabled={isSaving} onClick={() => void moderate(item, 'rejected')} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-40">Reject</button>
                    </div>
                  </div>
                  {isRevisionOpen ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:flex-row sm:items-center">
                      <input
                        autoFocus
                        type="text"
                        value={revisionRequest.message}
                        onChange={(event) => setRevisionRequest({ id: item.revisionId, message: event.target.value })}
                        maxLength={500}
                        placeholder="Tell the member what needs to change…"
                        className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-amber-300"
                      />
                      <button type="button" disabled={isSaving || !revisionRequest.message.trim()} onClick={() => void moderate(item, 'needs_revision', revisionRequest.message.trim())} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Send revision request</button>
                      <button type="button" disabled={isSaving} onClick={() => setRevisionRequest(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-white">Cancel</button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>}
        </div>
      )}
    </section>
  );
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

