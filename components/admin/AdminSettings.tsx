import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from 'lucide-react';
import { getListings } from '../../lib/api';
import { getPlatformHealth, type PlatformHealthItem, type PlatformHealthSnapshot, type PlatformStatus } from '../../lib/admin/platformHealth';
import { syncApprovedListingFeedbackTargets } from '../../lib/feedback';

const statusTone: Record<PlatformStatus, string> = {
  Operational: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Operational · Action needed': 'border-amber-200 bg-amber-50 text-amber-900',
  Partial: 'border-amber-200 bg-amber-50 text-amber-900',
  'Schema only': 'border-blue-200 bg-blue-50 text-blue-800',
  'Pending deploy': 'border-rose-200 bg-rose-50 text-rose-800',
  'Local only': 'border-slate-200 bg-slate-100 text-slate-700',
  'Not connected': 'border-gray-200 bg-gray-100 text-gray-700',
  Degraded: 'border-red-200 bg-red-50 text-red-800',
};

const StatusCard: React.FC<{
  item: PlatformHealthItem;
  action?: React.ReactNode;
}> = ({ item, action }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[item.status]}`}>{item.status}</span>
    </div>
    <p className="mt-3 text-sm leading-6 text-gray-600">{item.description}</p>
    {item.detail ? <p className="mt-3 text-xs font-medium text-gray-400">{item.detail}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
    {item.nextStep ? (
      <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-500">
        <strong className="text-gray-700">Next:</strong> {item.nextStep}
      </p>
    ) : null}
  </section>
);

const AdminSettings: React.FC = () => {
  const [health, setHealth] = useState<PlatformHealthSnapshot | null>(null);
  const [healthState, setHealthState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [healthError, setHealthError] = useState('');
  const [feedbackSyncState, setFeedbackSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [feedbackSyncMessage, setFeedbackSyncMessage] = useState('');

  const refreshHealth = useCallback(async () => {
    setHealthState('loading');
    setHealthError('');
    try {
      const snapshot = await getPlatformHealth();
      setHealth(snapshot);
      setHealthState('ready');
    } catch (error) {
      console.error('Platform health check failed:', error);
      setHealth(null);
      setHealthState('error');
      setHealthError(error instanceof Error ? error.message : 'Platform health check failed.');
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const syncFeedbackTargets = async () => {
    setFeedbackSyncState('syncing');
    setFeedbackSyncMessage('');
    try {
      const listings = await getListings();
      const result = await syncApprovedListingFeedbackTargets(listings);
      setFeedbackSyncState('success');
      setFeedbackSyncMessage(`Registered or refreshed ${result.registered} approved event and club feedback targets.`);
      await refreshHealth();
    } catch (error) {
      setFeedbackSyncState('error');
      setFeedbackSyncMessage(error instanceof Error ? error.message : 'Feedback target synchronization failed.');
    }
  };

  const summary = useMemo(() => {
    if (!health) return null;
    return health.items.reduce<Record<string, number>>((counts, item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      return counts;
    }, {});
  }, [health]);

  const feedbackItem = health?.items.find((item) => item.key === 'feedback');

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><Database size={18} /> Runtime health</div>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-gray-900">Platform Status</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Live capability checks from production Supabase plus build-time migration drift detection. Statuses are derived from what is actually deployed rather than handwritten labels.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshHealth()}
          disabled={healthState === 'loading'}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw size={16} className={healthState === 'loading' ? 'animate-spin' : ''} />
          {healthState === 'loading' ? 'Checking…' : 'Refresh status'}
        </button>
      </div>

      {healthState === 'error' ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={20} />
            <div>
              <div className="font-bold">Live platform health is unavailable</div>
              <p className="mt-1 text-sm leading-6">{healthError}</p>
              <p className="mt-2 text-sm text-red-700">This itself is treated as a degraded state rather than falling back to hard-coded “green” statuses.</p>
            </div>
          </div>
        </div>
      ) : null}

      {health ? (
        <>
          <section className={`mb-6 rounded-xl border p-5 ${health.migrationMatches ? 'border-emerald-200 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                {health.migrationMatches
                  ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={21} />
                  : <AlertTriangle className="mt-0.5 shrink-0 text-rose-700" size={21} />}
                <div>
                  <div className={`font-bold ${health.migrationMatches ? 'text-emerald-950' : 'text-rose-950'}`}>
                    {health.migrationMatches ? 'Production schema matches this checkout' : 'Migration drift detected'}
                  </div>
                  <p className={`mt-1 text-sm ${health.migrationMatches ? 'text-emerald-800' : 'text-rose-800'}`}>
                    Local <code>{health.localMigration.version || 'unknown'}</code> · Production <code>{health.remoteMigration || 'unknown'}</code>
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <div>Last verified</div>
                <div className="mt-0.5 font-semibold text-gray-700">{new Date(health.checkedAt).toLocaleString()}</div>
              </div>
            </div>
          </section>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Operational</div><div className="mt-2 text-2xl font-bold text-emerald-700">{summary?.Operational ?? 0}</div></div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Partial / local</div><div className="mt-2 text-2xl font-bold text-amber-700">{(summary?.Partial ?? 0) + (summary?.['Local only'] ?? 0) + (summary?.['Schema only'] ?? 0) + (summary?.['Operational · Action needed'] ?? 0)}</div></div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Not connected</div><div className="mt-2 text-2xl font-bold text-gray-700">{summary?.['Not connected'] ?? 0}</div></div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Needs attention</div><div className="mt-2 text-2xl font-bold text-rose-700">{(summary?.['Pending deploy'] ?? 0) + (summary?.Degraded ?? 0)}</div></div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {health.items.map((item) => (
              <StatusCard
                key={item.key}
                item={item}
                action={item.key === 'feedback' && feedbackItem ? (
                  <>
                    <button
                      type="button"
                      onClick={syncFeedbackTargets}
                      disabled={feedbackSyncState === 'syncing'}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:opacity-60"
                    >
                      {feedbackSyncState === 'syncing' ? 'Syncing feedback targets…' : 'Sync approved listings'}
                    </button>
                    {feedbackSyncMessage ? (
                      <p className={`mt-3 text-sm ${feedbackSyncState === 'error' ? 'text-red-700' : 'text-green-700'}`} role="status">
                        {feedbackSyncMessage}
                      </p>
                    ) : null}
                  </>
                ) : undefined}
              />
            ))}
          </div>
        </>
      ) : healthState === 'loading' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm">Running live platform checks…</div>
      ) : null}
    </div>
  );
};

export default AdminSettings;
