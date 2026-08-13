import React, { useMemo, useState } from 'react';
import type { CruiseSailingData, CruiseSeriesData, ResortData } from '../../types';
import type { AdminView } from './AdminPanel';

const tabs = ['resorts', 'cruise-series', 'sailings'] as const;
type Tab = typeof tabs[number];

type Props = {
  resorts: ResortData[];
  cruiseSeries: CruiseSeriesData[];
  sailings: CruiseSailingData[];
  setView: (view: AdminView) => void;
};

const statusClass = (status: string) => status === 'approved'
  ? 'bg-green-100 text-green-800'
  : status === 'draft'
    ? 'bg-gray-100 text-gray-700'
    : 'bg-yellow-100 text-yellow-800';

const AdminManageTravel: React.FC<Props> = ({ resorts, cruiseSeries, sailings, setView }) => {
  const [tab, setTab] = useState<Tab>('resorts');
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const filteredResorts = useMemo(() => resorts.filter((item) => !query || [item.name, item.geopoint.address.city, item.geopoint.address.country].some((value) => value?.toLowerCase().includes(query))), [query, resorts]);
  const filteredSeries = useMemo(() => cruiseSeries.filter((item) => !query || item.name.toLowerCase().includes(query)), [cruiseSeries, query]);
  const filteredSailings = useMemo(() => sailings.filter((item) => !query || [item.name, item.shipName, item.departurePort.portName].some((value) => value.toLowerCase().includes(query))), [query, sailings]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Travel content</p>
          <h1 className="mt-1 text-4xl font-bold text-gray-800">Managed Travel</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">Resorts are destination properties. Cruise brands contain reusable identity, while sailings hold dates, ships, ports, itineraries, pricing, and booking status.</p>
        </div>
        <button onClick={() => setView(tab === 'resorts' ? 'add-resort' : tab === 'cruise-series' ? 'add-cruise-series' : 'add-cruise-sailing')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          {tab === 'resorts' ? 'Add Resort' : tab === 'cruise-series' ? 'Add Cruise Series' : 'Add Sailing'}
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{item === 'resorts' ? 'Resorts' : item === 'cruise-series' ? 'Cruise Series' : 'Sailings'}</button>)}
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search travel content…" className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 md:max-w-sm" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {tab === 'resorts' && <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Resort</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Destination</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Style</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th><th /></tr></thead><tbody className="divide-y divide-gray-100">{filteredResorts.map((item) => <tr key={item.id}><td className="px-6 py-4"><div className="font-semibold text-gray-900">{item.name}</div><div className="text-xs text-gray-500">{item.audienceLabel}</div></td><td className="px-6 py-4 text-sm text-gray-600">{item.geopoint.address.city}, {item.geopoint.address.country}</td><td className="px-6 py-4 text-sm capitalize text-gray-600">{item.resortStyle.replaceAll('_', ' ')}</td><td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></td><td className="px-6 py-4 text-right"><button onClick={() => setView({ view: 'edit-resort', resortId: item.id })} className="text-sm font-semibold text-blue-600">Edit</button></td></tr>)}</tbody></table>}
        {tab === 'cruise-series' && <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Cruise brand</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Sailings</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th><th /></tr></thead><tbody className="divide-y divide-gray-100">{filteredSeries.map((item) => <tr key={item.id}><td className="px-6 py-4"><div className="font-semibold text-gray-900">{item.name}</div><div className="text-xs text-gray-500">{item.audienceLabel}</div></td><td className="px-6 py-4 text-sm text-gray-600">{sailings.filter((sailing) => sailing.cruiseSeriesId === item.id).length}</td><td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></td><td className="px-6 py-4 text-right"><button onClick={() => setView({ view: 'edit-cruise-series', cruiseSeriesId: item.id })} className="text-sm font-semibold text-blue-600">Edit series</button></td></tr>)}</tbody></table>}
        {tab === 'sailings' && <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Sailing</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Ship</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Dates</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Booking</th><th /></tr></thead><tbody className="divide-y divide-gray-100">{filteredSailings.map((item) => <tr key={item.id}><td className="px-6 py-4"><div className="font-semibold text-gray-900">{item.name}</div><div className="text-xs text-gray-500">From {item.departurePort.portName}</div></td><td className="px-6 py-4 text-sm text-gray-600">{item.shipName}</td><td className="px-6 py-4 text-sm text-gray-600">{new Date(item.startsAt).toLocaleDateString()} – {new Date(item.endsAt).toLocaleDateString()}</td><td className="px-6 py-4 text-sm capitalize text-gray-600">{item.bookingStatus?.replaceAll('_', ' ') || 'Not set'}</td><td className="px-6 py-4 text-right"><button onClick={() => setView({ view: 'edit-cruise-sailing', cruiseSailingId: item.id })} className="text-sm font-semibold text-blue-600">Edit sailing</button></td></tr>)}</tbody></table>}
      </div>
    </div>
  );
};

export default AdminManageTravel;
