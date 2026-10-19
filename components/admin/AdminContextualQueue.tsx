import React, { useMemo, useState } from 'react';
import type { AdminView } from './AdminPanel';
import type { OperationalQueueItem, OperationalAffectedRecord } from '../../lib/admin/dashboardSummary';

type Target = 'clubs' | 'events' | 'venues' | 'organizations' | 'travel';

const matchesTarget = (record: OperationalAffectedRecord, target: Target) => {
  const view = typeof record.editView === 'string' ? record.editView : record.editView.view;
  switch (target) {
    case 'clubs': return view === 'edit-club' || view === 'edit-club-brand';
    case 'events': return view === 'edit-event' || view === 'edit-event-series';
    case 'venues': return view === 'edit-venue';
    case 'organizations': return view === 'edit-organization';
    case 'travel': return view === 'edit-resort' || view === 'edit-cruise-series' || view === 'edit-cruise-sailing';
  }
};

export default function AdminContextualQueue({ items, target, onOpen }: {
  items: OperationalQueueItem[];
  target: Target;
  onOpen: (view: AdminView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const issues = useMemo(() => items.flatMap(item => item.count > 0 && item.severity !== 'healthy'
    ? item.records.filter(record => matchesTarget(record, target)).map(record => ({
      key: `${item.id}:${record.id}`,
      category: item.title,
      record,
    }))
    : []), [items, target]);
  const visible = expanded ? issues : issues.slice(0, 5);

  return (
    <section aria-label="Listings needing attention" className="mb-6 rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">Needs Attention <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{issues.length}</span></h2>
          <p className="mt-1 text-xs text-gray-500">Open an affected record to review its specific issue. Counts update after catalog data refreshes.</p>
        </div>
      </div>
      {issues.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">No catalog issues detected for this section.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {visible.map(({ key, category, record }) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{record.name}</p>
                <p className="mt-0.5 text-xs font-medium text-amber-800">{category}</p>
                <p className="mt-0.5 text-xs text-gray-600">{record.reason || record.subtitle}</p>
              </div>
              <button type="button" onClick={() => onOpen(record.editView)} className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">Review & edit →</button>
            </div>
          ))}
        </div>
      )}
      {issues.length > 5 && (
        <button type="button" onClick={() => setExpanded(current => !current)} className="mt-3 text-xs font-semibold text-blue-700 hover:underline">
          {expanded ? 'Show fewer' : `Show all ${issues.length} issues`}
        </button>
      )}
    </section>
  );
}
