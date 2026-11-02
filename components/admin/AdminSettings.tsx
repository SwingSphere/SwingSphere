import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  GitBranch,
  GitCommit,
  Layers,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { getListings } from '../../lib/api';
import { adminFetchJson } from '../../lib/adminApi';
import {
  getPlatformHealth,
  type PlatformHealthItem,
  type PlatformHealthSnapshot,
  type PlatformStatus,
} from '../../lib/admin/platformHealth';
import {
  type ClassifiedReleaseError,
  type ReleaseExecutionPlan,
  type ReleasePreflightReport,
} from '../../lib/admin/releaseManagement';
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
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[item.status]}`}>
        {item.status}
      </span>
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

  // Release manager state
  const [releaseActionState, setReleaseActionState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [releaseActionMessage, setReleaseActionMessage] = useState('');
  const [activePlan, setActivePlan] = useState<ReleaseExecutionPlan | null>(null);
  const [classifiedError, setClassifiedError] = useState<ClassifiedReleaseError | null>(null);
  const [showPreflightDetails, setShowPreflightDetails] = useState(false);
  const [showErrorTechnicalDetails, setShowErrorTechnicalDetails] = useState(false);
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [selectedFilesToStage, setSelectedFilesToStage] = useState<string[]>([]);
  const [approveOutOfOrderMigrations, setApproveOutOfOrderMigrations] = useState(false);
  const [simulateDryRun, setSimulateDryRun] = useState(false);

  const refreshHealth = useCallback(async () => {
    setHealthState('loading');
    setHealthError('');
    try {
      const snapshot = await getPlatformHealth();
      setHealth(snapshot);
      if (snapshot.preflight?.staging) {
        setSelectedFilesToStage(snapshot.preflight.staging.defaultSelectedFiles ?? []);
      }
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

  const preflight = health?.preflight;
  const migrationSync = health?.migrationSync;
  const canApplyMigrationsEffective = Boolean(
    preflight?.actions.canApplyMigrations ||
      (approveOutOfOrderMigrations && preflight?.actions.canApplyMigrationsWithIncludeAll),
  );
  const canFullReleaseEffective = Boolean(
    preflight?.actions.canFullRelease ||
      (approveOutOfOrderMigrations && preflight?.actions.canFullReleaseWithIncludeAll),
  );

  const toggleFileToStage = (filePath: string) => {
    setSelectedFilesToStage((prev) =>
      prev.includes(filePath) ? prev.filter((f) => f !== filePath) : [...prev, filePath].sort(),
    );
  };

  // Operation A: Verify Release
  const handleVerifyRelease = async () => {
    setReleaseActionState('running');
    setReleaseActionMessage('Verifying release preflight…');
    setActivePlan(null);
    setClassifiedError(null);
    try {
      const result = await adminFetchJson<ReleasePreflightReport>('/api/admin/release/verify', { method: 'POST' });
      await refreshHealth();
      setReleaseActionState('success');
      setReleaseActionMessage(
        result.ok
          ? `Preflight verified: branch ${result.git.branch} (${result.git.commit}) · DB ${result.migration.statusLabel}`
          : `Preflight completed with ${result.blockReasons.length} blocker(s): ${result.blockReasons.join(' · ')}`,
      );
      setShowPreflightDetails(true);
    } catch (err: any) {
      setReleaseActionState('error');
      setReleaseActionMessage(err?.message || 'Verification failed.');
    }
  };

  // Operation B: Commit & Deploy Frontend
  const handleDeployFrontend = async () => {
    if (releaseActionState === 'running') return;
    const modePrefix = simulateDryRun ? '[SIMULATED DRY RUN] ' : '';
    const confirmed = window.confirm(
      `${modePrefix}Build Cloudflare bundle, commit ${selectedFilesToStage.length} selected file(s), push origin/main, and deploy Cloudflare Pages?\n\nSelected files (${selectedFilesToStage.length}):\n${selectedFilesToStage.slice(0, 12).join('\n') || '(none — deploy current HEAD)'}${selectedFilesToStage.length > 12 ? `\n…and ${selectedFilesToStage.length - 12} more` : ''}\n\nThis will NOT apply database migrations.`,
    );
    if (!confirmed) return;

    setReleaseActionState('running');
    setReleaseActionMessage(simulateDryRun ? 'Simulating frontend release…' : 'Deploying frontend…');
    setActivePlan(null);
    setClassifiedError(null);
    try {
      const plan = await adminFetchJson<ReleaseExecutionPlan>('/api/admin/release/deploy-frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filesToStage: selectedFilesToStage,
          dryRun: simulateDryRun,
        }),
      });
      setActivePlan(plan);
      if (plan.success) {
        setReleaseActionState('success');
        setReleaseActionMessage(
          plan.dryRun
            ? 'Simulated frontend release completed with all stages verified.'
            : 'Frontend deployed successfully to Cloudflare Pages.',
        );
      } else {
        setReleaseActionState('error');
        setClassifiedError(plan.error || null);
        setReleaseActionMessage(plan.error?.userMessage || 'Frontend deployment failed.');
      }
      await refreshHealth();
    } catch (err: any) {
      setReleaseActionState('error');
      setReleaseActionMessage(err?.message || 'Frontend deployment failed.');
    }
  };

  // Operation C: Apply Database Migrations
  const handleApplyMigrations = async () => {
    if (releaseActionState === 'running') return;
    const pendingList = migrationSync?.pendingDetails?.length
      ? migrationSync.pendingDetails.map((d) => `${d.filename || d.version}${d.isOutOfOrder ? ' (out-of-order)' : ''}`)
      : migrationSync?.pendingLocal ?? [];
    const modePrefix = simulateDryRun ? '[SIMULATED DRY RUN] ' : '';
    const includeAllNote = migrationSync?.requiresIncludeAll
      ? '\n\nNote: Includes "--include-all" for out-of-order migration(s) before remote head.'
      : '';
    const confirmed = window.confirm(
      `${modePrefix}Apply ${pendingList.length} pending Supabase migration(s) to the production database?\n\nMigrations to apply:\n${pendingList.join('\n')}${includeAllNote}`,
    );
    if (!confirmed) return;

    setReleaseActionState('running');
    setReleaseActionMessage(simulateDryRun ? 'Simulating database migration apply…' : 'Applying database migrations…');
    setActivePlan(null);
    setClassifiedError(null);
    try {
      const plan = await adminFetchJson<ReleaseExecutionPlan>('/api/admin/release/apply-migrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          includeAll: approveOutOfOrderMigrations,
          dryRun: simulateDryRun,
        }),
      });
      setActivePlan(plan);
      if (plan.success) {
        setReleaseActionState('success');
        setReleaseActionMessage(
          plan.dryRun
            ? 'Simulated database migration apply completed successfully.'
            : 'Database migrations applied successfully.',
        );
      } else {
        setReleaseActionState('error');
        setClassifiedError(plan.error || null);
        setReleaseActionMessage(plan.error?.userMessage || 'Database migration failed.');
      }
      await refreshHealth();
    } catch (err: any) {
      setReleaseActionState('error');
      setReleaseActionMessage(err?.message || 'Database migration failed.');
    }
  };

  // Operation D: Full Release
  const handleFullRelease = async () => {
    if (releaseActionState === 'running') return;
    const pendingMigrations = migrationSync?.pendingLocal.length ?? 0;
    const modePrefix = simulateDryRun ? '[SIMULATED DRY RUN] ' : '';
    const confirmed = window.confirm(
      `${modePrefix}Execute Full Release?\n\n- Selected files to stage/commit: ${selectedFilesToStage.length}\n- Pending database migrations: ${pendingMigrations}${approveOutOfOrderMigrations && migrationSync?.requiresIncludeAll ? ' (with --include-all)' : ''}\n- Cloudflare Pages deployment: Yes\n\nBuild runs before Git commit and database migration so build failures abort cleanly.`,
    );
    if (!confirmed) return;

    setReleaseActionState('running');
    setReleaseActionMessage(simulateDryRun ? 'Running simulated full release sequence…' : 'Running full release sequence…');
    setActivePlan(null);
    setClassifiedError(null);
    try {
      const plan = await adminFetchJson<ReleaseExecutionPlan>('/api/admin/release/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          filesToStage: selectedFilesToStage,
          includeAll: approveOutOfOrderMigrations,
          dryRun: simulateDryRun,
        }),
      });
      setActivePlan(plan);
      if (plan.success) {
        setReleaseActionState('success');
        setReleaseActionMessage(
          plan.dryRun
            ? 'Simulated full release completed with all 9 stages verified!'
            : 'Full release completed successfully!',
        );
      } else {
        setReleaseActionState('error');
        setClassifiedError(plan.error || null);
        setReleaseActionMessage(plan.error?.userMessage || 'Release failed.');
      }
      await refreshHealth();
    } catch (err: any) {
      setReleaseActionState('error');
      setReleaseActionMessage(err?.message || 'Full release failed.');
    }
  };

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
  const localProductionSyncAvailable =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const syncStatusTone =
    migrationSync?.status === 'synchronized'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : migrationSync?.status === 'local_pending'
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-rose-300 bg-rose-50 text-rose-950';

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Database size={18} /> Runtime health & Deployment
          </div>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-gray-900">Platform Status</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Live capability checks from production Supabase plus build-time migration drift detection. Statuses are
            derived from what is actually deployed rather than handwritten labels.
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
              <p className="mt-2 text-sm text-red-700">
                This itself is treated as a degraded state rather than falling back to hard-coded “green” statuses.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {health ? (
        <>
          {/* Main Deployment Status Card */}
          <section className={`mb-6 rounded-xl border p-5 ${syncStatusTone}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {migrationSync?.status === 'synchronized' ? (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={24} />
                ) : (
                  <AlertTriangle className="mt-0.5 shrink-0 text-rose-700" size={24} />
                )}
                <div>
                  <div className="text-base font-bold">
                    {migrationSync?.status === 'synchronized'
                      ? 'Production schema matches this checkout'
                      : migrationSync?.status === 'local_pending'
                        ? 'Pending local database migrations'
                        : migrationSync?.status === 'remote_missing'
                          ? 'Production contains migrations missing locally'
                          : migrationSync?.status === 'divergent'
                            ? 'Migration histories have diverged'
                            : 'Migration status pending verification'}
                  </div>
                  <p className="mt-1 text-sm leading-6 opacity-90">{migrationSync?.explanation}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-75">
                    <span>
                      Local head: <code>{migrationSync?.localHead || health.localMigration.version || 'none'}</code>
                    </span>
                    <span>
                      Production head: <code>{migrationSync?.remoteHead || health.remoteMigration || 'none'}</code>
                    </span>
                    {migrationSync?.pendingLocal.length ? (
                      <span className="font-semibold text-amber-800">
                        Pending local migration(s): <code>{migrationSync.pendingLocal.join(', ')}</code>
                        {migrationSync.requiresIncludeAll ? ' (out-of-order before head)' : ''}
                      </span>
                    ) : null}
                    {migrationSync?.missingRemote.length ? (
                      <span className="font-semibold text-rose-800">
                        {migrationSync.missingRemote.length} missing locally
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                <div className="text-xs text-gray-500">
                  <div>Last verified</div>
                  <div className="mt-0.5 font-semibold text-gray-700">
                    {new Date(health.checkedAt).toLocaleTimeString()}
                  </div>
                </div>
                {localProductionSyncAvailable ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {health.auditLog?.length ? (
                      <button
                        type="button"
                        onClick={() => setShowAuditHistory((prev) => !prev)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                      >
                        <span>{showAuditHistory ? 'Hide release history' : `Release history (${health.auditLog.length})`}</span>
                        {showAuditHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowPreflightDetails((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                      <span>{showPreflightDetails ? 'Hide preflight inspection' : 'Inspect release preflight'}</span>
                      {showPreflightDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Preflight Inspection Drawer */}
            {showPreflightDetails && preflight ? (
              <div className="mt-5 border-t border-gray-200/60 pt-4 text-xs text-gray-700">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-white/70 p-3 shadow-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                      <GitBranch size={14} /> Git Environment
                    </div>
                    <div className="mt-2 space-y-1">
                      <div>
                        Branch: <code className="font-bold">{preflight.git.branch}</code>
                      </div>
                      <div>
                        HEAD: <code>{preflight.git.commit}</code>
                      </div>
                      {preflight.git.upstream ? (
                        <div>
                          Upstream: <code>{preflight.git.upstream}</code> (+{preflight.git.aheadCount ?? 0} / -{preflight.git.behindCount ?? 0})
                        </div>
                      ) : null}
                      <div className="truncate text-gray-500">{preflight.git.commitMessage}</div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 p-3 shadow-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                      <Layers size={14} /> Working Tree Staging
                    </div>
                    <div className="mt-2 space-y-1">
                      <div>
                        Selected to stage: <strong className="text-emerald-700">{selectedFilesToStage.length}</strong> / {preflight.staging.safeToStage.length} safe
                      </div>
                      <div>Tracked modified: {preflight.staging.modifiedTracked?.length ?? 0} files</div>
                      <div>Untracked: {preflight.staging.untracked.length} files</div>
                      <div>Excluded experimental/local: {preflight.staging.flaggedExperimentalOrLocal?.length ?? 0} files</div>
                      {preflight.staging.excludedSecrets.length ? (
                        <div className="font-bold text-rose-700">
                          Excluded secrets: {preflight.staging.excludedSecrets.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 p-3 shadow-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                      <Server size={14} /> Supabase Migrations
                    </div>
                    <div className="mt-2 space-y-1">
                      <div>Status: <strong>{preflight.migration.statusLabel}</strong></div>
                      <div>Matched: {preflight.migration.matchedCount} / {preflight.migration.localCount}</div>
                      <div>Pending: {preflight.migration.pendingLocal.length}</div>
                      <div>Missing locally: {preflight.migration.missingRemote.length}</div>
                      <div>
                        Dry-run: {preflight.migrationDryRun.passed
                          ? '✓ Succeeded'
                          : preflight.migrationDryRun.includeAllDryRunPassed
                            ? '⚠ Needs --include-all (SQL valid)'
                            : '✗ Failed'}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 p-3 shadow-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                      <ShieldCheck size={14} /> Release Capabilities
                    </div>
                    <div className="mt-2 space-y-1">
                      <div>Frontend deploy: {preflight.actions.canDeployFrontend ? '✓ Ready' : '✗ Blocked'}</div>
                      <div>DB migrations: {canApplyMigrationsEffective ? '✓ Ready' : '✗ Blocked'}</div>
                      <div>Full release: {canFullReleaseEffective ? '✓ Ready' : '✗ Blocked'}</div>
                      <div>Cloudflare project: <code>{preflight.cloudflare.projectName || 'swingsphere'}</code></div>
                    </div>
                  </div>
                </div>

                {/* Out-of-order migration inspection & opt-in confirmation */}
                {preflight.migration.requiresIncludeAll && preflight.migration.pendingDetails?.length ? (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-amber-950">
                    <div className="font-bold">
                      Out-of-Order Pending Migration Detected ({preflight.migration.pendingLocal.join(', ')})
                    </div>
                    <p className="mt-1 leading-5">
                      Local head (<code>{preflight.migration.localHead}</code>) and production head (<code>{preflight.migration.remoteHead}</code>) match because later migrations were applied first, leaving{' '}
                      <code>{preflight.migration.pendingDetails.map((d) => d.filename || d.version).join(', ')}</code> unapplied in <code>supabase_migrations.schema_migrations</code>.
                    </p>
                    {preflight.migrationDryRun.includeAllPreview ? (
                      <pre className="mt-2 overflow-x-auto rounded bg-amber-950/10 p-2 font-mono text-[11px] whitespace-pre-wrap">
                        {preflight.migrationDryRun.includeAllPreview}
                      </pre>
                    ) : null}
                    {preflight.migrationDryRun.includeAllDryRunPassed ? (
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 font-semibold text-amber-900">
                        <input
                          type="checkbox"
                          checked={approveOutOfOrderMigrations}
                          onChange={(e) => setApproveOutOfOrderMigrations(e.target.checked)}
                          className="rounded border-amber-400"
                        />
                        <span>
                          I have reviewed the out-of-order migration SQL and approve applying with <code>--include-all</code>
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {/* Explicit File Selection for Git Staging */}
                {preflight.staging.safeToStage.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-gray-900">
                        Files to Stage & Commit ({selectedFilesToStage.length} of {preflight.staging.safeToStage.length} selected)
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedFilesToStage(preflight.staging.defaultSelectedFiles ?? [])}
                          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Select default safe ({preflight.staging.defaultSelectedFiles?.length ?? 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFilesToStage([])}
                          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Clear all (deploy HEAD only)
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 max-h-44 overflow-y-auto divide-y divide-gray-100 rounded border border-gray-100 bg-white p-1.5">
                      {preflight.staging.safeToStage.map((filePath) => {
                        const isChecked = selectedFilesToStage.includes(filePath);
                        const isExperimental = preflight.staging.flaggedExperimentalOrLocal?.includes(filePath);
                        const isUntracked = preflight.staging.untracked.includes(filePath);
                        return (
                          <label
                            key={filePath}
                            className="flex cursor-pointer items-center justify-between gap-2 py-1 px-1.5 hover:bg-gray-50"
                          >
                            <span className="flex items-center gap-2 truncate">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleFileToStage(filePath)}
                                className="rounded border-gray-300"
                              />
                              <code className="truncate text-[11px]">{filePath}</code>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {isExperimental ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Experimental / Local Data
                                </span>
                              ) : null}
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  isUntracked ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {isUntracked ? 'Untracked' : 'Modified'}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {preflight.blockReasons.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
                    <div className="font-bold">Blocking Issues:</div>
                    <ul className="mt-1 list-disc pl-5 space-y-0.5">
                      {preflight.blockReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {preflight.warnings.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <div className="font-bold">Release Warnings:</div>
                    <ul className="mt-1 list-disc pl-5 space-y-0.5">
                      {preflight.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Recent Release Audit Log Drawer */}
            {showAuditHistory && health.auditLog?.length ? (
              <div className="mt-4 border-t border-gray-200/60 pt-3 text-xs text-gray-700">
                <div className="font-bold text-gray-900">Recent Release Audit History</div>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {health.auditLog.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2"
                    >
                      <div>
                        <span className="font-semibold text-gray-900">{entry.operation}</span>
                        {entry.dryRun ? (
                          <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                            DRY RUN
                          </span>
                        ) : null}
                        <span className="ml-2 text-gray-500">
                          {new Date(entry.startedAt).toLocaleString()}
                        </span>
                        {entry.error ? (
                          <div className="mt-0.5 text-[11px] text-red-700">
                            {entry.error.categoryLabel}: {entry.error.userMessage}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          entry.success ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {entry.success ? 'Succeeded' : 'Failed'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Action Bar (Operations A, B, C, D) */}
            {localProductionSyncAvailable ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200/60 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Action A: Verify Release */}
                  <button
                    type="button"
                    onClick={handleVerifyRelease}
                    disabled={releaseActionState === 'running'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={releaseActionState === 'running' ? 'animate-spin' : ''} />
                    A. Verify release
                  </button>

                  {/* Action B: Commit & Deploy Frontend */}
                  <button
                    type="button"
                    onClick={handleDeployFrontend}
                    disabled={releaseActionState === 'running' || !preflight?.actions.canDeployFrontend}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 shadow-xs transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title={preflight?.actions.canDeployFrontend ? 'Deploy frontend to Cloudflare Pages' : 'Frontend deploy blocked by preflight'}
                  >
                    <GitCommit size={14} />
                    B. Commit & deploy frontend ({selectedFilesToStage.length})
                  </button>

                  {/* Action C: Apply Database Migrations */}
                  <button
                    type="button"
                    onClick={handleApplyMigrations}
                    disabled={
                      releaseActionState === 'running' ||
                      !canApplyMigrationsEffective ||
                      migrationSync?.status !== 'local_pending'
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3.5 py-2 text-xs font-semibold text-purple-800 shadow-xs transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      canApplyMigrationsEffective
                        ? 'Apply pending database migrations'
                        : migrationSync?.requiresIncludeAll
                          ? 'Inspect release preflight and approve out-of-order migration (--include-all) first'
                          : 'No pending migrations or migration history diverged'
                    }
                  >
                    <Database size={14} />
                    C. Apply database migrations
                  </button>

                  {/* Action D: Full Release */}
                  <button
                    type="button"
                    onClick={handleFullRelease}
                    disabled={releaseActionState === 'running' || !canFullReleaseEffective}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      canFullReleaseEffective
                        ? 'Execute full release'
                        : migrationSync?.requiresIncludeAll && !approveOutOfOrderMigrations
                          ? 'Inspect release preflight and approve out-of-order migration (--include-all) first'
                          : 'Full release blocked by preflight'
                    }
                  >
                    <Rocket size={14} />
                    {releaseActionState === 'running' ? 'Executing release…' : 'D. Full release'}
                  </button>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={simulateDryRun}
                    onChange={(e) => setSimulateDryRun(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span>Simulate dry-run (no production writes)</span>
                </label>
              </div>
            ) : (
              <p className="mt-4 border-t border-gray-200/60 pt-3 text-xs text-gray-500">
                To run authenticated release and migration deployment operations, access this page from the local development server (localhost).
              </p>
            )}
          </section>

          {/* Release Execution Status & Progress */}
          {releaseActionMessage ? (
            <div
              className={`mb-6 rounded-xl border p-4 text-sm ${
                releaseActionState === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : releaseActionState === 'running'
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
              role="status"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {releaseActionState === 'running' ? (
                    <RefreshCw size={18} className="mt-0.5 shrink-0 animate-spin text-blue-700" />
                  ) : releaseActionState === 'error' ? (
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" />
                  ) : (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
                  )}
                  <div>
                    <div className="font-semibold">{releaseActionMessage}</div>
                    {classifiedError ? (
                      <div className="mt-2 text-xs leading-5">
                        <div className="font-bold text-red-800">
                          Category: {classifiedError.categoryLabel}
                        </div>
                        <div className="mt-1 text-red-700">
                          Next step: {classifiedError.actionableNextStep}
                        </div>
                        {classifiedError.recoveryGuidance ? (
                          <div className="mt-1 font-medium text-red-800">
                            Recovery state: {classifiedError.recoveryGuidance}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setShowErrorTechnicalDetails((prev) => !prev)}
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-red-800 underline hover:text-red-950"
                        >
                          {showErrorTechnicalDetails ? 'Hide technical details' : 'Show technical details'}
                        </button>
                        {showErrorTechnicalDetails ? (
                          <pre className="mt-2 max-h-48 overflow-x-auto rounded bg-red-950/10 p-2 text-[11px] font-mono whitespace-pre-wrap">
                            {classifiedError.sanitizedDetail}
                          </pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Stage Progress Tracker */}
              {activePlan?.stages ? (
                <div className="mt-4 border-t border-gray-200/50 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Stage Progress {activePlan.dryRun ? '(Simulated Dry Run)' : ''}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {activePlan.stages.map((stage) => (
                      <div
                        key={stage.name}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          stage.status === 'success'
                            ? 'border-emerald-200 bg-emerald-100/60 text-emerald-900'
                            : stage.status === 'running'
                              ? 'border-blue-300 bg-blue-100/60 text-blue-900 font-semibold'
                              : stage.status === 'failed'
                                ? 'border-red-300 bg-red-100/60 text-red-900 font-semibold'
                                : 'border-gray-200 bg-gray-100/50 text-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 truncate">
                            {stage.status === 'success' ? (
                              <Check size={14} className="shrink-0 text-emerald-700" />
                            ) : stage.status === 'running' ? (
                              <RefreshCw size={14} className="shrink-0 animate-spin text-blue-700" />
                            ) : stage.status === 'failed' ? (
                              <XCircle size={14} className="shrink-0 text-red-700" />
                            ) : (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                            )}
                            <span className="truncate">{stage.label}</span>
                          </span>
                          {typeof stage.durationMs === 'number' ? (
                            <span className="shrink-0 text-[10px] opacity-70">{stage.durationMs}ms</span>
                          ) : null}
                        </div>
                        {stage.detail ? (
                          <div className="mt-1 truncate text-[11px] opacity-80" title={stage.detail}>
                            {stage.detail}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Platform Capability Summary */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Operational</div>
              <div className="mt-2 text-2xl font-bold text-emerald-700">{summary?.Operational ?? 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Partial / local</div>
              <div className="mt-2 text-2xl font-bold text-amber-700">
                {(summary?.Partial ?? 0) +
                  (summary?.['Local only'] ?? 0) +
                  (summary?.['Schema only'] ?? 0) +
                  (summary?.['Operational · Action needed'] ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Not connected</div>
              <div className="mt-2 text-2xl font-bold text-gray-700">{summary?.['Not connected'] ?? 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Needs attention</div>
              <div className="mt-2 text-2xl font-bold text-rose-700">
                {(summary?.['Pending deploy'] ?? 0) + (summary?.Degraded ?? 0)}
              </div>
            </div>
          </div>

          {/* Platform Health Detail Cards */}
          <div className="grid gap-5 lg:grid-cols-2">
            {health.items.map((item) => (
              <StatusCard
                key={item.key}
                item={item}
                action={
                  item.key === 'feedback' && feedbackItem ? (
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
                        <p
                          className={`mt-3 text-sm ${
                            feedbackSyncState === 'error' ? 'text-red-700' : 'text-green-700'
                          }`}
                          role="status"
                        >
                          {feedbackSyncMessage}
                        </p>
                      ) : null}
                    </>
                  ) : undefined
                }
              />
            ))}
          </div>
        </>
      ) : healthState === 'loading' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm">
          Running live platform checks…
        </div>
      ) : null}
    </div>
  );
};

export default AdminSettings;
