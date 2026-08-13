import React, { useMemo, useState } from 'react';
import type { ClubBrandData, ClubData, OrganizationData } from '../../types';
import { AdminView } from './AdminPanel';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import AdminEntityIdentity from './AdminEntityIdentity';
import { brandMediaSourceLabel, resolveBrandLogo, type BrandMediaCatalog } from '../../lib/entityBrandMedia';

type Props = { clubs: ClubData[]; clubBrands: ClubBrandData[]; organizations: OrganizationData[]; mediaCatalog: BrandMediaCatalog; setView: (view: AdminView) => void; onDataChange: () => void };

const AdminManageClubs: React.FC<Props> = ({ clubs, clubBrands, organizations, mediaCatalog, setView, onDataChange }) => {
  const [mode, setMode] = useState<'brands' | 'locations'>('brands');
  const [search, setSearch] = useState('');
  const { addToast } = useAppStore();
  const orgById = useMemo(() => new Map(organizations.map((org) => [org.id, org])), [organizations]);
  const grouped = useMemo(() => clubBrands.map((brand) => ({ brand, locations: clubs.filter((club) => club.clubBrandId === brand.id) })).filter(({ brand }) => !search || brand.name.toLowerCase().includes(search.toLowerCase())), [clubBrands, clubs, search]);
  const locations = useMemo(() => clubs.filter((club) => !search || `${club.name} ${club.location}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [clubs, search]);

  const handleDelete = async (club: ClubData) => {
    if (!window.confirm(`Delete “${club.name}”? This cannot be undone.`)) return;
    try { await api.deleteListing(club.id); addToast({ message: 'Club location deleted.', type: 'success' }); onDataChange(); }
    catch { addToast({ message: 'Failed to delete club location.', type: 'error' }); }
  };

  return <div>
    <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-red-600">Club catalog</p><h1 className="text-4xl font-bold text-gray-800">Manage Clubs</h1><p className="mt-2 text-sm text-gray-500">Shared brands sit above permanent physical locations. Each location keeps its own address, schedule, policies, images, and events.</p></div><div className="flex gap-2"><button onClick={() => setView('add-club-brand')} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Add club brand</button><button onClick={() => setView('add-club')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Add location</button></div></div>
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"><div className="inline-flex w-fit rounded-lg bg-gray-100 p-1"><button onClick={() => setMode('brands')} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'brands' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Club brands</button><button onClick={() => setMode('locations')} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'locations' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>All locations</button></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clubs..." className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 md:max-w-sm" /></div>
    {mode === 'brands' ? <div className="space-y-3">{grouped.map(({ brand, locations: linked }) => { const media = resolveBrandLogo('club_brand', brand.id, mediaCatalog); return <div key={brand.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><AdminEntityIdentity name={brand.name} imageUrl={media.url} imageSourceLabel={brandMediaSourceLabel(media)} secondary={brand.operatorOrganizationId ? orgById.get(brand.operatorOrganizationId)?.name : `${linked.length} location${linked.length === 1 ? '' : 's'}`} /><div className="flex items-center gap-3"><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{linked.length} locations</span><button onClick={() => setView({ view: 'edit-club-brand', clubBrandId: brand.id })} className="text-sm font-semibold text-blue-600">Edit brand</button></div></div>{linked.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{linked.map((club) => <button key={club.id} onClick={() => setView({ view: 'edit-club', clubId: club.id })} className="rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50"><div className="font-semibold text-gray-800">{club.name}</div><div className="mt-1 truncate text-xs text-gray-500">{club.location}</div></button>)}</div>}</div>; })}{!grouped.length && <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No club brands found.</p>}</div> : <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Location</th><th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Brand</th><th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Address</th><th className="px-6 py-3" /></tr></thead><tbody className="divide-y divide-gray-200">{locations.map((club) => { const brand = clubBrands.find((item) => item.id === club.clubBrandId); const media = resolveBrandLogo('club', club.id, mediaCatalog); return <tr key={club.id}><td className="px-6 py-4"><AdminEntityIdentity name={club.name} imageUrl={media.url} imageSourceLabel={brandMediaSourceLabel(media)} secondary={club.id} /></td><td className="px-6 py-4 text-sm text-gray-600">{brand?.name ?? 'Independent'}</td><td className="px-6 py-4 text-sm text-gray-500">{club.location}</td><td className="px-6 py-4 text-right text-sm"><button onClick={() => setView({ view: 'edit-club', clubId: club.id })} className="text-blue-600">Edit</button><button onClick={() => handleDelete(club)} className="ml-4 text-red-600">Delete</button></td></tr>})}</tbody></table></div>}
  </div>;
};

export default AdminManageClubs;
