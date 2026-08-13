import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Crown,
  Download,
  ExternalLink,
  MailCheck,
  Search,
  ShieldCheck,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { exportToCsv } from '../../lib/utils';
import {
  getAdminManagedUsers,
  updateAdminManagedUser,
  type AdminManagedUser,
} from '../../lib/admin/userManagement';
import AdminUserBadgeManager from './AdminUserBadgeManager';

const fallbackAvatar = '/swingsphere-logo.png';

type RoleFilter = 'All' | AdminManagedUser['role'];
type StatusFilter = 'All' | AdminManagedUser['status'];
type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'badges-desc' | 'founders-first';

const roleClass: Record<AdminManagedUser['role'], string> = {
  Admin: 'border-violet-200 bg-violet-50 text-violet-700',
  Host: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  User: 'border-gray-200 bg-gray-50 text-gray-700',
};

const AdminUserManagement: React.FC<{
  onDataChange: () => void;
}> = ({ onDataChange }) => {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [selectedUser, setSelectedUser] = useState<AdminManagedUser | null>(null);
  const [selectedAccountUser, setSelectedAccountUser] = useState<AdminManagedUser | null>(null);
  const { addToast, currentUser } = useAppStore();

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      setUsers(await getAdminManagedUsers());
    } catch (error) {
      console.error('Failed to load admin users:', error);
      addToast({ message: 'Failed to load production profiles.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const visibleUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = users
      .filter((user) => roleFilter === 'All' || user.role === roleFilter)
      .filter((user) => statusFilter === 'All' || user.status === statusFilter)
      .filter((user) => !term || [user.displayName, user.email, user.handle, user.id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)));

    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'oldest':
          return new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime();
        case 'name-asc':
          return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
        case 'name-desc':
          return b.displayName.localeCompare(a.displayName, undefined, { sensitivity: 'base' });
        case 'badges-desc':
          return b.badgeCount - a.badgeCount || a.displayName.localeCompare(b.displayName);
        case 'founders-first': {
          const aFounder = a.founderNumber ?? Number.MAX_SAFE_INTEGER;
          const bFounder = b.founderNumber ?? Number.MAX_SAFE_INTEGER;
          return aFounder - bFounder || new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime();
        }
        case 'newest':
        default:
          return new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime();
      }
    });
  }, [roleFilter, searchTerm, sortOption, statusFilter, users]);

  const hasAdminProjection = users.length === 0 || users.every((user) => user.adminMetadataAvailable);

  const stats = useMemo(() => ({
    total: users.length,
    verified: users.filter((user) => Boolean(user.emailVerifiedAt)).length,
    founders: users.filter((user) => user.founderNumber !== undefined).length,
    awarded: users.reduce((sum, user) => sum + user.badgeCount, 0),
  }), [users]);

  const handleExport = () => {
    exportToCsv(visibleUsers, `swingsphere-users-${new Date().toISOString().split('T')[0]}.csv`);
    addToast({ message: `${visibleUsers.length} filtered member record${visibleUsers.length === 1 ? '' : 's'} exported.`, type: 'info' });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setRoleFilter('All');
    setStatusFilter('All');
    setSortOption('newest');
  };

  if (isLoading) return <div className="text-gray-500">Loading production profiles…</div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><UserRoundCog size={18} /> Administration</div>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-gray-900">User Management</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Search members, inspect account state, preview any member profile, and manage achievements. Admin-only member data stays behind the protected Supabase admin projection.
          </p>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
          <Download size={16} /> Export filtered CSV
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users size={19} />} label="Members" value={stats.total} />
        <StatCard icon={<MailCheck size={19} />} label="Email verified" value={hasAdminProjection ? stats.verified : '—'} />
        <StatCard icon={<Crown size={19} />} label="Founding members" value={hasAdminProjection ? stats.founders : '—'} />
        <StatCard icon={<Award size={19} />} label="Active awards" value={hasAdminProjection ? stats.awarded : '—'} />
      </div>

      {!hasAdminProjection ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Admin member metadata migration is still pending deployment.</strong> Name/handle search works now; private Auth email search, verification, founder numbers, badge counts, and activity totals become authoritative after the pending Supabase migration chain is deployed.
        </div>
      ) : null}

      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_auto_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input
              type="search"
              placeholder="Search name, @handle, email, or user ID…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} className="h-11 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            <option value="All">All roles</option>
            <option value="Admin">Admin</option>
            <option value="Host">Host</option>
            <option value="User">User</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-11 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
            <option value="Deleted">Deleted</option>
          </select>
          <select value={sortOption} onChange={(event) => setSortOption(event.target.value as SortOption)} className="h-11 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="badges-desc">Most badges</option>
            <option value="founders-first">Founder number</option>
          </select>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>Showing {visibleUsers.length} of {users.length} accounts</span>
          {(searchTerm || roleFilter !== 'All' || statusFilter !== 'All' || sortOption !== 'newest') ? (
            <button type="button" onClick={resetFilters} className="font-semibold text-blue-700 hover:text-blue-900">Reset filters</button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[1080px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Member', 'Role', 'Joined', 'Verification', 'Achievements', 'Activity', 'Profile', ''].map((label) => (
                <th key={label || 'actions'} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {visibleUsers.map((user) => (
              <tr key={user.id} className="align-middle transition-colors hover:bg-blue-50/35">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <img src={user.avatarUrl || fallbackAvatar} alt="" className="h-11 w-11 rounded-full border border-gray-200 bg-gray-950 object-cover" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{user.displayName}</span>
                        {user.founderNumber ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">№{String(user.founderNumber).padStart(3, '0')}</span> : null}
                      </div>
                      <div className="mt-0.5 text-sm text-gray-500">@{user.handle || 'unavailable'}</div>
                      <div className="mt-0.5 max-w-[280px] truncate text-xs text-gray-400">{user.email || 'Email available after admin migration deploy'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${roleClass[user.role]}`}>{user.role}</span>
                  <div className={`mt-1.5 text-xs font-semibold ${user.status === 'Active' ? 'text-emerald-700' : 'text-red-700'}`}>{user.status}</div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{new Date(user.joinDate).toLocaleDateString()}</td>
                <td className="px-5 py-4">
                  {user.adminMetadataAvailable ? (
                    <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${user.emailVerifiedAt ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {user.emailVerifiedAt ? <BadgeCheck size={16} /> : <ShieldCheck size={16} />}
                      {user.emailVerifiedAt ? 'Verified' : 'Unverified'}
                    </div>
                  ) : <span className="text-xs font-semibold text-gray-400">Pending deploy</span>}
                </td>
                <td className="px-5 py-4">
                  <button type="button" onClick={() => setSelectedUser(user)} className="group inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100">
                    <Award size={16} /> {user.adminMetadataAvailable ? user.badgeCount : '—'}
                    <span className="font-medium text-violet-500 group-hover:text-violet-700">Manage</span>
                  </button>
                </td>
                <td className="px-5 py-4 text-xs leading-5 text-gray-500">
                  {user.adminMetadataAvailable ? (
                    <>
                      <div>{user.approvedReviewCount} approved review{user.approvedReviewCount === 1 ? '' : 's'}</div>
                      <div>{user.organizationCount} organization{user.organizationCount === 1 ? '' : 's'}</div>
                    </>
                  ) : <span className="text-gray-400">Pending deploy</span>}
                </td>
                <td className="px-5 py-4">
                  {user.adminMetadataAvailable ? (
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${user.profileVisibility === 'visible' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      {user.profileVisibility === 'visible' ? 'Visible by link' : 'Private'}
                    </span>
                  ) : <span className="text-xs font-semibold text-gray-400">Unknown</span>}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAccountUser(user)}
                      disabled={currentUser?.id === user.id}
                      title={currentUser?.id === user.id ? 'Use another active administrator to change your own account.' : 'Change role or account status'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
                    >
                      <UserRoundCog size={14} /> Account
                    </button>
                    <button
                      type="button"
                      onClick={() => user.handle && window.open(`/users/${user.handle}`, '_blank', 'noopener,noreferrer')}
                      disabled={!user.handle}
                      title={!user.handle ? 'Profile handle unavailable' : user.profileVisibility === 'private' ? 'Open private profile in admin preview' : 'Open member profile'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
                    >
                      <ExternalLink size={14} /> Profile
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!visibleUsers.length ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-gray-700">No accounts match these filters.</p>
            <button type="button" onClick={resetFilters} className="mt-2 text-sm font-semibold text-blue-700 hover:text-blue-900">Clear search and filters</button>
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <strong>Account mutations are protected and audited.</strong> Role and account-state changes require an active administrator, a confirmation, and a written reason. Marking an account Deleted locks it at the SwingSphere authorization layer; permanent privacy deletion remains a separate account-deletion workflow.
      </div>

      {selectedUser ? (
        <AdminUserBadgeManager
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onChanged={() => {
            void loadUsers();
            onDataChange();
          }}
        />
      ) : null}

      {selectedAccountUser ? (
        <AdminUserAccountManager
          user={selectedAccountUser}
          onClose={() => setSelectedAccountUser(null)}
          onChanged={() => {
            setSelectedAccountUser(null);
            void loadUsers();
            onDataChange();
          }}
        />
      ) : null}
    </div>
  );
};

const AdminUserAccountManager: React.FC<{
  user: AdminManagedUser;
  onClose: () => void;
  onChanged: () => void;
}> = ({ user, onClose, onChanged }) => {
  const [role, setRole] = useState<AdminManagedUser['role']>(user.role);
  const [status, setStatus] = useState<AdminManagedUser['status']>(user.status);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useAppStore();
  const changed = role !== user.role || status !== user.status;

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (!changed || !trimmedReason) return;

    const changes = [
      role !== user.role ? `role ${user.role} → ${role}` : null,
      status !== user.status ? `status ${user.status} → ${status}` : null,
    ].filter(Boolean).join(' and ');

    if (!window.confirm(`Apply ${changes} for ${user.displayName}? This action will be written to the permanent admin audit log.`)) return;

    setIsSaving(true);
    try {
      await updateAdminManagedUser(user.id, { role, status, reason: trimmedReason });
      addToast({ message: `${user.displayName}'s account was updated.`, type: 'success' });
      onChanged();
    } catch (error) {
      console.error('Failed to update account:', error);
      addToast({ message: error instanceof Error ? error.message : 'Failed to update account.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label={`Manage ${user.displayName}'s account`}>
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Account controls</div>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">{user.displayName}</h2>
            <p className="mt-1 text-sm text-gray-500">{user.email || `@${user.handle || user.id}`}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Close</button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as AdminManagedUser['role'])} className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                <option value="User">User</option>
                <option value="Host">Host / Promoter</option>
                <option value="Admin">Admin</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Account status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as AdminManagedUser['status'])} className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Deleted">Deleted</option>
              </select>
            </label>
          </div>

          {status === 'Deleted' && user.status !== 'Deleted' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
              <strong>Deleted is an authorization state, not a data purge.</strong> The member will be blocked from protected SwingSphere access, but their Auth identity and retained data are not permanently erased by this action.
            </div>
          ) : null}
          {role === 'Admin' && user.role !== 'Admin' ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
              <strong>Admin grants full SwingSphere administration.</strong> Only promote accounts that should have access to protected member data and privileged moderation controls.
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Reason for change</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} placeholder="Required. Describe why this account change is being made…" className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
            <div className="text-right text-xs text-gray-400">{reason.length}/1000</div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={!changed || !reason.trim() || isSaving} className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
            {isSaving ? 'Saving…' : 'Apply account changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number | string }> = ({ icon, label, value }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-gray-500">{icon}<span className="text-xs font-bold uppercase tracking-[0.12em]">{label}</span></div>
    <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
  </div>
);

export default AdminUserManagement;
