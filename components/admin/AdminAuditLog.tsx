import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileClock, Search, ShieldCheck, UserRoundCog } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { exportToCsv } from '../../lib/utils';
import { getAdminAuditLog, type AdminAuditLogEntry } from '../../lib/admin/auditLog';

const ACTION_CATEGORIES = ['All', 'User Management', 'Content Management', 'System'] as const;
type ActionCategory = typeof ACTION_CATEGORIES[number];

const actionCategory = (action: string): Exclude<ActionCategory, 'All'> => {
  if (action.startsWith('user.') || action.startsWith('badge.')) return 'User Management';
  if (
    action.startsWith('listing.')
    || action.startsWith('organization.')
    || action.startsWith('venue.')
    || action.startsWith('event.')
    || action.startsWith('club.')
    || action.startsWith('travel.')
  ) return 'Content Management';
  return 'System';
};

const actionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    'user.role_changed': 'Role changed',
    'user.suspended': 'User suspended',
    'user.reactivated': 'User reactivated',
    'user.marked_deleted': 'Marked deleted',
    'user.restored': 'User restored',
    'user.account_updated': 'Account updated',
    'badge.user_awarded': 'Badge awarded',
    'badge.user_revoked': 'Badge revoked',
    'badge.founder_assigned': 'Founder number assigned',
  };
  return labels[action] ?? action.split('.').map((part) => part.replace(/_/g, ' ')).join(' · ');
};

const actionClass = (action: string): string => {
  if (action.includes('suspended') || action.includes('deleted') || action.includes('revoked')) return 'border-red-200 bg-red-50 text-red-700';
  if (action.includes('reactivated') || action.includes('restored') || action.includes('awarded') || action.includes('assigned')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (action.includes('role')) return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
};

const stateSummary = (log: AdminAuditLogEntry): string | undefined => {
  const keys = Array.from(new Set([...Object.keys(log.beforeState), ...Object.keys(log.afterState)]));
  const changes = keys.flatMap((key) => {
    const before = log.beforeState[key];
    const after = log.afterState[key];
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    const beforeText = before === null || before === undefined ? '—' : String(before);
    const afterText = after === null || after === undefined ? '—' : String(after);
    return [`${key}: ${beforeText} → ${afterText}`];
  });
  return changes.length ? changes.join(' · ') : undefined;
};

const AdminAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionCategoryFilter, setActionCategoryFilter] = useState<ActionCategory>('All');
  const [adminFilter, setAdminFilter] = useState('All');
  const { addToast } = useAppStore();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        setLogs(await getAdminAuditLog());
      } catch (error) {
        console.error('Failed to load production audit log:', error);
        addToast({ message: 'Failed to load production audit history.', type: 'error' });
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [addToast]);

  const adminUsers = useMemo(() => {
    const unique = new Map<string, string>();
    logs.forEach((log) => {
      if (log.adminId) unique.set(log.adminId, log.adminName);
    });
    return Array.from(unique.entries()).map(([id, displayName]) => ({ id, displayName }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return logs
      .filter((log) => actionCategoryFilter === 'All' || actionCategory(log.action) === actionCategoryFilter)
      .filter((log) => adminFilter === 'All' || log.adminId === adminFilter)
      .filter((log) => !term || [
        log.adminName,
        log.action,
        actionLabel(log.action),
        log.targetName,
        log.targetType,
        log.targetId,
        log.reason,
        stateSummary(log),
      ].filter(Boolean).some((value) => value!.toLowerCase().includes(term)));
  }, [actionCategoryFilter, adminFilter, logs, searchTerm]);

  const handleExport = () => {
    exportToCsv(filteredLogs.map((log) => ({
      timestamp: log.timestamp,
      admin: log.adminName,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      targetName: log.targetName,
      reason: log.reason ?? '',
      changes: stateSummary(log) ?? '',
    })), `swingsphere-audit-log-${new Date().toISOString().split('T')[0]}.csv`);
    addToast({ message: `${filteredLogs.length} audit record${filteredLogs.length === 1 ? '' : 's'} exported.`, type: 'info' });
  };

  if (isLoading) return <div className="text-gray-500">Loading production audit history…</div>;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><FileClock size={18} /> Security & accountability</div>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-gray-900">Audit Log</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">Append-only production history for privileged SwingSphere actions. Browser clients cannot insert, edit, or delete these records directly.</p>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(280px,1fr)_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input type="search" placeholder="Search admin, action, member, reason, or ID…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
        </label>
        <select value={actionCategoryFilter} onChange={(event) => setActionCategoryFilter(event.target.value as ActionCategory)} className="h-11 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
          {ACTION_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={adminFilter} onChange={(event) => setAdminFilter(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
          <option value="All">All admins</option>
          {adminUsers.map((admin) => <option key={admin.id} value={admin.id}>{admin.displayName}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[1000px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>{['Timestamp', 'Administrator', 'Action', 'Target', 'Reason / changes'].map((label) => <th key={label} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredLogs.map((log) => {
              const changes = stateSummary(log);
              return (
                <tr key={log.id} className="align-top hover:bg-blue-50/30">
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900"><ShieldCheck size={16} className="text-blue-600" />{log.adminName}</div>
                    {log.adminId ? <div className="mt-1 max-w-[210px] truncate font-mono text-[10px] text-gray-400">{log.adminId}</div> : null}
                  </td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${actionClass(log.action)}`}>{actionLabel(log.action)}</span><div className="mt-1 text-[10px] text-gray-400">{actionCategory(log.action)}</div></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><UserRoundCog size={15} className="text-gray-400" />{log.targetName}</div>
                    <div className="mt-1 text-xs text-gray-400">{log.targetType} · {log.targetId}</div>
                  </td>
                  <td className="max-w-xl px-5 py-4 text-sm leading-5 text-gray-600">
                    {log.reason ? <div><span className="font-semibold text-gray-800">Reason:</span> {log.reason}</div> : null}
                    {changes ? <div className={log.reason ? 'mt-1.5 text-xs text-gray-500' : 'text-xs text-gray-500'}>{changes}</div> : null}
                    {!log.reason && !changes ? <span className="text-gray-400">No additional detail.</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!filteredLogs.length ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-gray-700">No audit records match these filters.</p>
            <p className="mt-2 text-sm text-gray-500">New protected account and badge actions will appear here automatically.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AdminAuditLog;
