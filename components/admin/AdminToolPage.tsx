import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../lib/api';
import type { Listing, OrganizationData, OrganizationVenueRelationship, VenueData } from '../../types';
import AdminBuildingInspector from './AdminBuildingInspector';

const AdminToolPage: React.FC = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [relationships, setRelationships] = useState<OrganizationVenueRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getListings(),
      api.getVenues(),
      api.getOrganizations(),
      api.getOrganizationVenueRelationships(),
    ]).then(([nextListings, nextVenues, nextOrganizations, nextRelationships]) => {
      if (cancelled) return;
      setListings(nextListings);
      setVenues(nextVenues);
      setOrganizations(nextOrganizations);
      setRelationships(nextRelationships);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateListing = (updated: Listing) => {
    setListings((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  const updateVenue = (updated: VenueData) => {
    setVenues((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-5 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Admin tool</p>
          <h1 className="text-lg font-semibold text-white">
            Building Inspector
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400/50 hover:text-white"
        >
          Back to Admin Panel
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">Loading tool…</div>
        ) : (
          <AdminBuildingInspector
            listings={listings}
            venues={venues}
            organizations={organizations}
            relationships={relationships}
            onUpdateListing={updateListing}
            onUpdateVenue={updateVenue}
          />
        )}
      </div>
    </div>
  );
};

export default AdminToolPage;
