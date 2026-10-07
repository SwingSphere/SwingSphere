import React, { useEffect, useState } from 'react';
import { getAdminMemberActivity, type MemberActivityReport } from '../../lib/analytics/memberActivity';
import type { AdminManagedUser } from '../../lib/admin/userManagement';
import AdminDetailDialog from './AdminDetailDialog';

const labels = { page_view: 'Viewed page', outbound: 'Opened outbound link', save: 'Saved item', unsave: 'Removed save' };
const AdminMemberActivity: React.FC<{ user: AdminManagedUser; onClose: () => void }> = ({ user, onClose }) => {
  const [report, setReport] = useState<MemberActivityReport | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pages' | 'timeline' | 'saved'>('pages');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setReport(null); setError('');
    getAdminMemberActivity(user.id).then((value) => { if (active) setReport(value); })
      .catch(() => { if (active) setError('Unable to load activity. Check that the member-activity migration is deployed and you have administrator access.'); });
    return () => { active = false; };
  }, [user.id, revision]);
  return (
    <AdminDetailDialog title={user.displayName + ' — Activity'} onClose={onClose}>
      {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => setRevision((value) => value + 1)} className="ml-3 font-semibold underline">Retry</button></div> : !report ? <p role="status" className="p-6 text-gray-500">Loading activity…</p> : !report.sharingEnabled ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6"><h3 className="font-bold">Activity sharing is off</h3><p className="mt-2 text-sm leading-6 text-gray-600">This member has not enabled activity sharing. Their browsing history and saved library are unavailable here. Members control sharing in Account → Privacy.</p></div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-gray-600">Shared since {report.since ? new Date(report.since).toLocaleString() : '—'}. History covers the last {report.retentionDays ?? 30} days. Visits and clicks indicate interaction; they do not establish attendance or purchases.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Page views', report.pageViews], ['Outbound actions', report.outboundClicks], ['Save actions', report.saveActions], ['Currently saved', report.savedCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold">{value ?? 0}</p></div>)}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Activity sections">
            {(['pages','timeline','saved'] as const).map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (tab === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700')}>{value === 'pages' ? 'Top pages' : value === 'timeline' ? 'Recent activity' : 'Saved items'}</button>)}
          </div>
          {tab === 'pages' ? <div className="divide-y divide-gray-100">{!report.topPages?.length ? <p className="py-5 text-sm text-gray-500">No recorded page visits yet.</p> : report.topPages.map((page) => <div key={page.path} className="flex items-center justify-between gap-4 py-3"><span className="min-w-0 break-all text-sm font-semibold">{page.path}</span><span className="shrink-0 text-sm text-gray-500">{page.views} views</span></div>)}<p className="mt-3 text-xs text-gray-500">Up to 20 most visited public discovery paths. Search queries and utility pages are excluded.</p></div> : null}
          {tab === 'timeline' ? <div className="divide-y divide-gray-100">{!report.recent?.length ? <p className="py-5 text-sm text-gray-500">No recorded activity yet.</p> : report.recent.map((event) => <div key={event.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="text-sm font-semibold">{labels[event.kind]}</p><p className="break-all text-sm text-gray-600">{event.destination || (event.entityId ? event.entityType + ' · ' + event.entityId : event.path)}</p>{event.entityId ? <p className="break-all text-xs text-gray-500">{event.path}</p> : null}</div><time className="text-xs text-gray-500">{new Date(event.occurredAt).toLocaleString()}</time></div>)}<p className="mt-3 text-xs text-gray-500">Latest 100 recorded actions. Opening globe/map detail panels without navigating does not count as a page view.</p></div> : null}
          {tab === 'saved' ? <div className="divide-y divide-gray-100">{!report.saved?.length ? <p className="py-5 text-sm text-gray-500">No currently saved items.</p> : report.saved.map((item) => <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.name}</p><p className="break-all text-xs text-gray-500">{item.entityType.replaceAll('_', ' ')} · {item.entityId}</p></div><time className="text-xs text-gray-500">{new Date(item.savedAt).toLocaleString()}</time></div>)}<p className="mt-3 text-xs text-gray-500">Up to 100 current saves, including saves made before sharing was enabled. Private notes and collections are excluded.</p></div> : null}
        </div>
      )}
    </AdminDetailDialog>
  );
};
export default AdminMemberActivity;
