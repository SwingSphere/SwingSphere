import React, { useMemo, useState } from 'react';
import type { EventData, EventSeriesData, OrganizationData, VenueData } from '../../types';
import { AdminView } from './AdminPanel';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { exportToCsv } from '../../lib/utils';
import AdminEntityIdentity from './AdminEntityIdentity';
import { brandMediaSourceLabel, resolveBrandLogo, type BrandMediaCatalog } from '../../lib/entityBrandMedia';

type AdminManageEventsProps = {
  events: EventData[];
  eventSeries: EventSeriesData[];
  organizations: OrganizationData[];
  venues: VenueData[];
  mediaCatalog: BrandMediaCatalog;
  setView: (view: AdminView) => void;
  onDataChange: () => void;
};

type EventsAdminMode = 'series' | 'occurrences';
type OccurrenceFilter = 'upcoming' | 'past' | 'all';

const ITEMS_PER_PAGE = 12;

const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date(value));

const AdminManageEvents: React.FC<AdminManageEventsProps> = ({
  events,
  eventSeries,
  organizations,
  venues,
  mediaCatalog,
  setView,
  onDataChange,
}) => {
  const [mode, setMode] = useState<EventsAdminMode>('series');
  const [occurrenceFilter, setOccurrenceFilter] = useState<OccurrenceFilter>('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<string>>(new Set());
  const { addToast } = useAppStore();

  const organizationById = useMemo(() => new Map(organizations.map((item) => [item.id, item])), [organizations]);
  const venueById = useMemo(() => new Map(venues.map((item) => [item.id, item])), [venues]);
  const eventsBySeriesId = useMemo(() => {
    const grouped = new Map<string, EventData[]>();
    events.forEach((event) => {
      if (!event.eventSeriesId) return;
      const entries = grouped.get(event.eventSeriesId) ?? [];
      entries.push(event);
      entries.sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start));
      grouped.set(event.eventSeriesId, entries);
    });
    return grouped;
  }, [events]);

  const filteredSeries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return eventSeries
      .map((series) => {
        const occurrences = eventsBySeriesId.get(series.id) ?? [];
        const upcoming = occurrences.filter((event) => Date.parse(event.time.end) >= Date.now());
        const promoter = series.organizerOrganizationId ? organizationById.get(series.organizerOrganizationId) : null;
        const defaultVenue = series.defaultVenueId ? venueById.get(series.defaultVenueId) : null;
        const media = resolveBrandLogo('event_series', series.id, mediaCatalog);
        return { series, occurrences, upcoming, promoter, defaultVenue, media };
      })
      .filter(({ series, promoter, defaultVenue }) => !query
        || series.name.toLowerCase().includes(query)
        || promoter?.name.toLowerCase().includes(query)
        || defaultVenue?.name.toLowerCase().includes(query))
      .sort((a, b) => a.series.name.localeCompare(b.series.name));
  }, [eventSeries, eventsBySeriesId, mediaCatalog, organizationById, searchTerm, venueById]);

  const filteredOccurrences = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const now = Date.now();
    return [...events]
      .filter((event) => occurrenceFilter === 'all'
        || (occurrenceFilter === 'past' ? Date.parse(event.time.end) < now : Date.parse(event.time.end) >= now))
      .filter((event) => {
        const series = event.eventSeriesId ? eventSeries.find((item) => item.id === event.eventSeriesId) : null;
        return !query
          || event.name.toLowerCase().includes(query)
          || event.location.toLowerCase().includes(query)
          || series?.name.toLowerCase().includes(query);
      })
      .sort((a, b) => Date.parse(b.time.start) - Date.parse(a.time.start));
  }, [eventSeries, events, occurrenceFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredOccurrences.length / ITEMS_PER_PAGE));
  const paginatedEvents = filteredOccurrences.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleDelete = async (event: EventData) => {
    if (!window.confirm(`Delete “${event.name}”? This cannot be undone.`)) return;
    try {
      await api.deleteListing(event.id);
      addToast({ message: 'Event occurrence deleted successfully.', type: 'success' });
      onDataChange();
    } catch {
      addToast({ message: 'Failed to delete event occurrence.', type: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    const eventsToDelete = events.filter((event) => selectedIds.has(event.id));
    if (!eventsToDelete.length || !window.confirm(`Delete ${eventsToDelete.length} selected occurrence${eventsToDelete.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      await Promise.all(eventsToDelete.map((event) => api.deleteListing(event.id)));
      addToast({ message: `${eventsToDelete.length} occurrence${eventsToDelete.length === 1 ? '' : 's'} deleted.`, type: 'success' });
      setSelectedIds(new Set());
      onDataChange();
    } catch {
      addToast({ message: 'Failed to delete selected occurrences.', type: 'error' });
    }
  };

  const toggleExpanded = (seriesId: string) => {
    setExpandedSeriesIds((current) => {
      const next = new Set(current);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    });
  };

  const switchMode = (nextMode: EventsAdminMode) => {
    setMode(nextMode);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const oneOffEvents = filteredOccurrences.filter((event) => !event.eventSeriesId);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-red-600">Event catalog</p>
          <h1 className="text-4xl font-bold text-gray-800">Manage Events</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">Recurring brands are managed as event series. Individual dates, themes, flyers, tickets, and venue changes remain event occurrences.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportToCsv(filteredOccurrences, `swingsphere-event-occurrences-${new Date().toISOString().split('T')[0]}.csv`)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">Export occurrences</button>
          <button onClick={() => setView('add-event-series')} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">Add event series</button>
          <button onClick={() => setView('add-event')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Add occurrence</button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="inline-flex w-fit rounded-lg bg-gray-100 p-1">
          <button onClick={() => switchMode('series')} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'series' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Event series</button>
          <button onClick={() => switchMode('occurrences')} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'occurrences' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>All occurrences</button>
        </div>
        <div className="flex w-full flex-col gap-3 md:max-w-2xl md:flex-row md:items-center md:justify-end">
          {mode === 'occurrences' && (
            <div className="inline-flex w-fit rounded-lg bg-gray-100 p-1">
              {(['upcoming', 'past', 'all'] as OccurrenceFilter[]).map((filter) => (
                <button key={filter} onClick={() => { setOccurrenceFilter(filter); setCurrentPage(1); }} className={`rounded-md px-3 py-2 text-xs font-semibold capitalize ${occurrenceFilter === filter ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{filter}</button>
              ))}
            </div>
          )}
          <input type="search" placeholder={mode === 'series' ? 'Search series, promoter, or venue…' : 'Search events, series, or location…'} value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }} className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 md:max-w-md" />
        </div>
      </div>

      {mode === 'series' ? (
        <div className="space-y-4">
          {filteredSeries.map(({ series, occurrences, upcoming, promoter, defaultVenue, media }) => {
            const expanded = expandedSeriesIds.has(series.id);
            return (
              <section key={series.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(260px,1.3fr)_minmax(170px,.8fr)_120px_150px_auto] lg:items-center">
                  <AdminEntityIdentity name={series.name} imageUrl={media.url} imageSourceLabel={brandMediaSourceLabel(media)} secondary={promoter?.name ?? 'Independent / promoter not linked'} />
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Usual venue</div><div className="mt-1 text-sm font-semibold text-gray-700">{defaultVenue?.name ?? 'Varies by occurrence'}</div></div>
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Upcoming</div><div className="mt-1 text-2xl font-bold text-gray-900">{upcoming.length}</div></div>
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</div><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${series.status === 'approved' || series.status === 'active' ? 'bg-green-100 text-green-800' : series.status === 'draft' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-800'}`}>{series.status}</span></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => toggleExpanded(series.id)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{expanded ? 'Hide dates' : 'View dates'}</button>
                    <button onClick={() => setView({ view: 'edit-event-series', eventSeriesId: series.id })} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Edit series</button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-gray-200 bg-gray-50/70 p-4">
                    <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-gray-800">Occurrences</h2><button onClick={() => setView('add-event')} className="text-sm font-semibold text-blue-600 hover:text-blue-800">Add another date</button></div>
                    <div className="grid gap-2">
                      {occurrences.map((event) => { const occurrenceMedia = resolveBrandLogo('event', event.id, mediaCatalog); return (
                        <div key={event.id} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-[minmax(220px,1fr)_150px_minmax(180px,.8fr)_auto] md:items-center">
                          <AdminEntityIdentity name={event.occurrenceTitle || event.name} imageUrl={occurrenceMedia.url} imageSourceLabel={brandMediaSourceLabel(occurrenceMedia)} secondary={series.name} />
                          <div className="text-sm font-semibold text-gray-700">{formatDate(event.time.start)}</div>
                          <div className="truncate text-sm text-gray-500">{venueById.get(event.venueId ?? '')?.name ?? event.location}</div>
                          <button onClick={() => setView({ view: 'edit-event', eventId: event.id })} className="justify-self-start text-sm font-semibold text-blue-600 hover:text-blue-900 md:justify-self-end">Edit occurrence</button>
                        </div>
                      ); })}
                      {!occurrences.length && <p className="rounded-lg border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">No occurrences are linked to this series yet.</p>}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {!!oneOffEvents.length && (
            <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-bold text-gray-800">One-off events</h2><p className="mt-1 text-sm text-gray-500">These events intentionally have no recurring series.</p></div><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-gray-700 shadow-sm">{oneOffEvents.length}</span></div>
            </section>
          )}
          {!filteredSeries.length && <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No event series found.</p>}
        </div>
      ) : (
        <>
          {selectedIds.size > 0 && <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-100 p-3"><span className="text-sm font-semibold text-blue-800">{selectedIds.size} selected</span><button className="text-sm font-semibold text-red-600 hover:text-red-800" onClick={handleBulkDelete}>Delete selected</button></div>}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr><th className="p-4"><input type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? new Set(paginatedEvents.map((item) => item.id)) : new Set())} /></th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Occurrence</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Series</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Location</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th><th className="px-6 py-3" /></tr></thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {paginatedEvents.map((event) => {
                  const series = event.eventSeriesId ? eventSeries.find((item) => item.id === event.eventSeriesId) : null;
                  const media = resolveBrandLogo('event', event.id, mediaCatalog);
                  return <tr key={event.id} className={selectedIds.has(event.id) ? 'bg-blue-50' : 'hover:bg-red-50/80'}><td className="p-4"><input type="checkbox" checked={selectedIds.has(event.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(event.id) ? next.delete(event.id) : next.add(event.id); return next; })} /></td><td className="px-6 py-4"><AdminEntityIdentity name={event.occurrenceTitle || event.name} imageUrl={media.url} imageSourceLabel={brandMediaSourceLabel(media)} secondary={event.hostName} /></td><td className="px-6 py-4 text-sm font-semibold text-gray-700">{series?.name ?? <span className="font-normal text-gray-400">One-off</span>}</td><td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500">{event.location}</td><td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(event.time.start)}</td><td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${event.status === 'approved' ? 'bg-green-100 text-green-800' : event.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{event.status.replace('_', ' ')}</span></td><td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium"><button onClick={() => setView({ view: 'edit-event', eventId: event.id })} className="text-blue-600 hover:text-blue-900">Edit</button><button onClick={() => handleDelete(event)} className="ml-4 text-red-600 hover:text-red-900">Delete</button></td></tr>;
                })}
              </tbody>
            </table>
            {!paginatedEvents.length && <p className="p-6 text-center text-gray-500">No event occurrences found.</p>}
          </div>
          {totalPages > 1 && <div className="mt-4 flex items-center justify-between"><button onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Previous</button><span className="text-sm text-gray-700">Page {currentPage} of {totalPages}</span><button onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Next</button></div>}
        </>
      )}
    </div>
  );
};

export default AdminManageEvents;
