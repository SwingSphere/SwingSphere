import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../../data/mockUsers';
import type { OrganizationMember, OrganizationMemberRole, OrganizationMemberStatus } from '../../types';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';

const inputClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const roleOptions: OrganizationMemberRole[] = ['owner', 'manager', 'editor'];
const statusOptions: OrganizationMemberStatus[] = ['active', 'invited', 'suspended'];

const AdminOrganizationTeamAccess: React.FC<{
  organizationId: string;
  users: User[];
}> = ({ organizationId, users }) => {
  const { addToast } = useAppStore();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrganizationMemberRole>('editor');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const availableUsers = useMemo(
    () => users.filter((user) => user.status === 'Active' && !members.some((member) => member.userId === user.id)),
    [members, users],
  );

  const loadMembers = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      setMembers(await api.getOrganizationMembers(organizationId));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load organization members.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [organizationId]);

  const addMember = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    try {
      const saved = await api.saveOrganizationMember({
        organizationId,
        userId: selectedUserId,
        role: selectedRole,
        status: 'active',
      });
      setMembers((current) => [...current, saved]);
      setSelectedUserId('');
      setSelectedRole('editor');
      addToast({ message: 'Team member added.', type: 'success' });
    } catch (saveError) {
      addToast({ message: saveError instanceof Error ? saveError.message : 'Unable to add team member.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateMember = async (member: OrganizationMember, changes: Partial<Pick<OrganizationMember, 'role' | 'status'>>) => {
    try {
      const saved = await api.saveOrganizationMember({ ...member, ...changes });
      setMembers((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      addToast({ message: 'Team access updated.', type: 'success' });
    } catch (saveError) {
      addToast({ message: saveError instanceof Error ? saveError.message : 'Unable to update team access.', type: 'error' });
    }
  };

  const removeMember = async (member: OrganizationMember) => {
    const user = usersById.get(member.userId);
    if (!window.confirm(`Remove ${user?.displayName ?? 'this member'} from the organization?`)) return;
    try {
      await api.removeOrganizationMember(member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      addToast({ message: 'Team member removed.', type: 'success' });
    } catch (removeError) {
      addToast({ message: removeError instanceof Error ? removeError.message : 'Unable to remove team member.', type: 'error' });
    }
  };

  if (!organizationId) {
    return <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">Save this organization before assigning team access.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Owners control the team, managers control organization content, and editors can update assigned content. Database policies enforce these roles; this is not only a visual restriction.
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Team access is not available yet.</div>
          <div className="mt-1">{error}</div>
          <div className="mt-2 text-xs">Apply the organizations-and-members Supabase migration, then reload this page.</div>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[1fr_160px_auto]">
        <select className={inputClass} value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={isSaving || Boolean(error)}>
          <option value="">Select an existing account</option>
          {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName}{user.email ? ` — ${user.email}` : ''}</option>)}
        </select>
        <select className={inputClass} value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as OrganizationMemberRole)} disabled={isSaving || Boolean(error)}>
          {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <button type="button" onClick={addMember} disabled={!selectedUserId || isSaving || Boolean(error)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {isSaving ? 'Adding…' : 'Add member'}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading ? <div className="p-5 text-sm text-gray-500">Loading team access…</div> : null}
        {!isLoading && !members.length ? <div className="p-5 text-sm text-gray-500">No team members are assigned yet. Add at least one owner before promoter self-management is enabled.</div> : null}
        {members.map((member) => {
          const user = usersById.get(member.userId);
          return (
            <div key={member.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 md:grid-cols-[1fr_150px_150px_auto] md:items-center">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{user?.displayName ?? member.userId}</div>
                <div className="truncate text-xs text-gray-500">{user?.email || user?.handle || member.userId}</div>
              </div>
              <select className={inputClass} value={member.role} onChange={(event) => void updateMember(member, { role: event.target.value as OrganizationMemberRole })}>
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <select className={inputClass} value={member.status} onChange={(event) => void updateMember(member, { status: event.target.value as OrganizationMemberStatus })}>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <button type="button" onClick={() => void removeMember(member)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50">Remove</button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminOrganizationTeamAccess;
