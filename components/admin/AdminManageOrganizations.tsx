import React, { useMemo, useState } from 'react';
import type { Listing, OrganizationData, OrganizationRelationship, OrganizationVenueRelationship } from '../../types';
import * as api from '../../lib/api';
import type { AdminView } from './AdminPanel';
import AdminEntityIdentity from './AdminEntityIdentity';
import { brandMediaSourceLabel, resolveBrandLogo, type BrandMediaCatalog } from '../../lib/entityBrandMedia';

const AdminManageOrganizations: React.FC<{
  organizations: OrganizationData[];
  listings: Listing[];
  relationships: OrganizationVenueRelationship[];
  organizationRelationships: OrganizationRelationship[];
  mediaCatalog: BrandMediaCatalog;
  setView: (view: AdminView) => void;
  onDeleted: (organizationId: string) => void;
}> = ({ organizations, listings, relationships, organizationRelationships, mediaCatalog, setView, onDeleted }) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...organizations]
      .filter((organization) => !term || [organization.name, organization.slug, organization.contactEmail, ...organization.displayTypes].some((value) => value?.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, query]);

  const deleteOrganization = async (organization: OrganizationData) => {
    if (!window.confirm(`Delete ${organization.name}? This removes the organization/brand record and unlinks its events, venues, and organization relationships.`)) return;
    await api.deleteOrganization(organization.id);
    onDeleted(organization.id);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Organizations</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Manage Organizations & Brands</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">Manage operators, producers, promoters, public event brands, hosts, and their relationships to clubs, events, and venues.</p>
        </div>
        <button type="button" onClick={() => setView('add-organization')} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">+ Add organization / brand</button>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, slug, email, or type" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Operator / Parent</th><th className="px-4 py-3">Clubs</th><th className="px-4 py-3">Events</th><th className="px-4 py-3">Venues</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((organization) => {
                const clubs = listings.filter((listing) => listing.type === 'club' && listing.ownerOrganizationId === organization.id).length;
                const events = listings.filter((listing) => listing.type === 'event' && listing.organizerOrganizationId === organization.id).length;
                const venueCount = relationships.filter((relationship) => relationship.organizationId === organization.id).length;
                const parentRelationship = organizationRelationships.find((relationship) => relationship.targetOrganizationId === organization.id && relationship.isPrimary)
                  ?? organizationRelationships.find((relationship) => relationship.targetOrganizationId === organization.id && ['operates', 'produces', 'owns', 'parent_brand'].includes(relationship.relationshipType));
                const parentOrganization = parentRelationship ? organizations.find((candidate) => candidate.id === parentRelationship.sourceOrganizationId) : undefined;
                const media = resolveBrandLogo('organization', organization.id, mediaCatalog);
                return (
                  <tr key={organization.id} onClick={() => setView({ view: 'edit-organization', organizationId: organization.id })} className="cursor-pointer transition hover:bg-blue-50/70">
                    <td className="px-4 py-3"><AdminEntityIdentity name={organization.name} imageUrl={media.url} imageSourceLabel={brandMediaSourceLabel(media)} secondary={`/${organization.slug}`} /></td>
                    <td className="px-4 py-3 text-gray-700">{organization.displayTypes.map((type) => type.replaceAll('_', ' ')).join(', ') || '—'}</td><td className="px-4 py-3 text-gray-600">{parentOrganization ? <><div className="font-semibold text-gray-800">{parentOrganization.name}</div><div className="text-xs text-gray-400">{parentRelationship?.relationshipType.replaceAll('_', ' ')}</div></> : '—'}</td><td className="px-4 py-3">{clubs}</td><td className="px-4 py-3">{events}</td><td className="px-4 py-3">{venueCount}</td><td className="px-4 py-3"><span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">{organization.status}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); setView({ view: 'edit-organization', organizationId: organization.id }); }} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button><button type="button" onClick={(event) => { event.stopPropagation(); void deleteOrganization(organization); }} className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button></div></td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">No promoter or host records found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminManageOrganizations;
