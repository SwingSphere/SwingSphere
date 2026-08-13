import React, { useMemo, useState } from 'react';
import type { CruiseSailingData, CruiseSeriesData, OrganizationData, ResortData } from '../../types';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import MediaUploader from '../media/MediaUploader';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900';
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const csv = (value?: string[]) => (value ?? []).join(', ');
const parseCsv = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

type Props = {
  entity: ResortData | CruiseSeriesData | CruiseSailingData;
  organizations: OrganizationData[];
  cruiseSeries: CruiseSeriesData[];
  sailings: CruiseSailingData[];
  onSaved: (saved: ResortData | CruiseSeriesData | CruiseSailingData) => void;
  onOpenSailing: (id: string) => void;
  onBack: () => void;
};

const AdminTravelEditor: React.FC<Props> = ({ entity, organizations, cruiseSeries, sailings, onSaved, onOpenSailing, onBack }) => {
  const [draft, setDraft] = useState(entity);
  const [saving, setSaving] = useState(false);
  const { addToast } = useAppStore();
  const { markUnsaved, markSaved } = useAdminEditMode();
  const mediaOwnerId = getMediaOwnerId(draft.type, draft.id || `${draft.type}-draft`);
  const linkedSailings = useMemo(() => draft.type === 'cruise_series' ? sailings.filter((item) => item.cruiseSeriesId === draft.id).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : [], [draft, sailings]);

  const update = (key: string, value: unknown) => {
    markUnsaved();
    setDraft((current) => ({ ...current, [key]: value }) as typeof current);
  };
  const getAsset = (role: MediaRole) => ('mediaAssets' in draft ? draft.mediaAssets?.find((asset) => asset.role === role) : undefined) ?? null;
  const handleUploaded = (asset: MediaAsset) => {
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(asset.role).defaultVariant });
    setDraft((current) => ({
      ...current,
      mediaAssets: [...(('mediaAssets' in current ? current.mediaAssets : []) ?? []).filter((item) => item.role !== asset.role), asset],
      ...(asset.role === 'logo' ? { logoImageUrl: url } : {}),
      ...(asset.role === 'hero' ? { headerImageUrl: url } : {}),
    }) as typeof current);
  };

  const save = async () => {
    if (!draft.name.trim()) return addToast({ message: 'Name is required.', type: 'error' });
    setSaving(true);
    try {
      const withIdentity = { ...draft, id: draft.id || `${draft.type}-${slugify(draft.name)}-${Date.now()}`, slug: draft.slug || slugify(draft.name) } as typeof draft;
      const saved = draft.type === 'resort'
        ? await api.saveResort(withIdentity as ResortData)
        : draft.type === 'cruise_series'
          ? await api.saveCruiseSeries(withIdentity as CruiseSeriesData)
          : await api.saveCruiseSailing(withIdentity as CruiseSailingData);
      setDraft(saved as typeof draft);
      markSaved();
      onSaved(saved);
      addToast({ message: 'Travel content saved.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to save travel content.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-6xl">
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><button onClick={onBack} className="mb-3 text-sm font-semibold text-blue-600">← Back to managed travel</button><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">{draft.type.replaceAll('_', ' ')}</p><h1 className="mt-1 text-4xl font-bold text-gray-800">{draft.id ? `Edit ${draft.name}` : `Add ${draft.type.replaceAll('_', ' ')}`}</h1></div><button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Identity</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Name</span><input className={inputClass} value={draft.name} onChange={(e) => update('name', e.target.value)} /></label><label><span className="mb-1 block text-sm font-semibold">Slug</span><input className={inputClass} value={draft.slug} onChange={(e) => update('slug', e.target.value)} /></label><label><span className="mb-1 block text-sm font-semibold">Status</span><select className={inputClass} value={draft.status} onChange={(e) => update('status', e.target.value)}><option value="draft">Draft</option><option value="approved">Approved</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>{draft.type !== 'cruise_sailing' && <><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Short description</span><textarea rows={3} className={inputClass} value={draft.descriptionShort} onChange={(e) => update('descriptionShort', e.target.value)} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Full description</span><textarea rows={7} className={inputClass} value={draft.descriptionFull} onChange={(e) => update('descriptionFull', e.target.value)} /></label></>}</div></section>

        {draft.type === 'resort' && <><section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Property and destination</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-semibold">Operator</span><select className={inputClass} value={draft.operatorOrganizationId ?? ''} onChange={(e) => update('operatorOrganizationId', e.target.value || undefined)}><option value="">Not linked</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span className="mb-1 block text-sm font-semibold">Resort style</span><select className={inputClass} value={draft.resortStyle} onChange={(e) => update('resortStyle', e.target.value)}><option value="destination_resort">Destination resort</option><option value="hotel">Hotel</option><option value="retreat">Retreat</option><option value="campground">Campground</option><option value="villa_collection">Villa collection</option></select></label><label><span className="mb-1 block text-sm font-semibold">City</span><input className={inputClass} value={draft.geopoint.address.city} onChange={(e) => update('geopoint', { ...draft.geopoint, address: { ...draft.geopoint.address, city: e.target.value } })} /></label><label><span className="mb-1 block text-sm font-semibold">Country</span><input className={inputClass} value={draft.geopoint.address.country} onChange={(e) => update('geopoint', { ...draft.geopoint, address: { ...draft.geopoint.address, country: e.target.value } })} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Audience label</span><input className={inputClass} value={draft.audienceLabel} onChange={(e) => update('audienceLabel', e.target.value)} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Accommodation summary</span><textarea rows={3} className={inputClass} value={draft.accommodationSummary} onChange={(e) => update('accommodationSummary', e.target.value)} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Amenities</span><input className={inputClass} value={csv(draft.amenities)} onChange={(e) => update('amenities', parseCsv(e.target.value))} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Experience highlights</span><input className={inputClass} value={csv(draft.experienceHighlights)} onChange={(e) => update('experienceHighlights', parseCsv(e.target.value))} /></label><label><span className="mb-1 block text-sm font-semibold">Booking URL</span><input className={inputClass} value={draft.bookingUrl ?? ''} onChange={(e) => update('bookingUrl', e.target.value || undefined)} /></label><label><span className="mb-1 block text-sm font-semibold">Contact email</span><input className={inputClass} value={draft.contactEmail ?? ''} onChange={(e) => update('contactEmail', e.target.value || undefined)} /></label></div></section></>}

        {draft.type === 'cruise_series' && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Cruise brand defaults</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-semibold">Operator</span><select className={inputClass} value={draft.operatorOrganizationId ?? ''} onChange={(e) => update('operatorOrganizationId', e.target.value || undefined)}><option value="">Not linked</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span className="mb-1 block text-sm font-semibold">Audience label</span><input className={inputClass} value={draft.audienceLabel} onChange={(e) => update('audienceLabel', e.target.value)} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Experience highlights</span><input className={inputClass} value={csv(draft.experienceHighlights)} onChange={(e) => update('experienceHighlights', parseCsv(e.target.value))} /></label></div></section>}

        {draft.type === 'cruise_sailing' && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Sailing details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-semibold">Cruise series</span><select className={inputClass} value={draft.cruiseSeriesId} onChange={(e) => update('cruiseSeriesId', e.target.value)}>{cruiseSeries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span className="mb-1 block text-sm font-semibold">Ship</span><input className={inputClass} value={draft.shipName} onChange={(e) => update('shipName', e.target.value)} /></label><label><span className="mb-1 block text-sm font-semibold">Starts</span><input type="datetime-local" className={inputClass} value={draft.startsAt.slice(0, 16)} onChange={(e) => update('startsAt', new Date(e.target.value).toISOString())} /></label><label><span className="mb-1 block text-sm font-semibold">Ends</span><input type="datetime-local" className={inputClass} value={draft.endsAt.slice(0, 16)} onChange={(e) => update('endsAt', new Date(e.target.value).toISOString())} /></label><label><span className="mb-1 block text-sm font-semibold">Ship nights</span><input type="number" min="1" className={inputClass} value={draft.durationNights} onChange={(e) => update('durationNights', Number(e.target.value))} /></label><label><span className="mb-1 block text-sm font-semibold">Booking status</span><select className={inputClass} value={draft.bookingStatus ?? 'announced'} onChange={(e) => update('bookingStatus', e.target.value)}><option value="announced">Announced</option><option value="booking_open">Booking open</option><option value="limited">Limited</option><option value="waitlist">Waitlist</option><option value="sold_out">Sold out</option><option value="completed">Completed</option></select></label><label><span className="mb-1 block text-sm font-semibold">Departure port</span><input className={inputClass} value={draft.departurePort.portName} onChange={(e) => update('departurePort', { ...draft.departurePort, portName: e.target.value })} /></label><label><span className="mb-1 block text-sm font-semibold">Departure country</span><input className={inputClass} value={draft.departurePort.country} onChange={(e) => update('departurePort', { ...draft.departurePort, country: e.target.value })} /></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Cabin summary</span><textarea rows={3} className={inputClass} value={draft.cabinSummary ?? ''} onChange={(e) => update('cabinSummary', e.target.value || undefined)} /></label><label><span className="mb-1 block text-sm font-semibold">Pricing summary</span><input className={inputClass} value={draft.pricingSummary ?? ''} onChange={(e) => update('pricingSummary', e.target.value || undefined)} /></label><label><span className="mb-1 block text-sm font-semibold">Booking URL</span><input className={inputClass} value={draft.bookingUrl ?? ''} onChange={(e) => update('bookingUrl', e.target.value || undefined)} /></label></div></section>}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Media</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{draft.type !== 'cruise_sailing' && <MediaUploader tone="light" ownerType={draft.type} ownerId={mediaOwnerId} role="logo" existingAsset={getAsset('logo')} label="Upload logo" cropAspectRatioOverride={1} onUploaded={handleUploaded} />}<MediaUploader tone="light" ownerType={draft.type} ownerId={mediaOwnerId} role="hero" existingAsset={getAsset('hero')} label={draft.type === 'cruise_sailing' ? 'Sailing banner' : 'Default banner'} onUploaded={handleUploaded} /></div></section>
      </div>
      <aside className="space-y-5">{draft.type === 'cruise_series' && <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-gray-800">Linked sailings</h2><div className="mt-3 text-3xl font-black">{linkedSailings.length}</div><div className="mt-4 space-y-2">{linkedSailings.map((item) => <button key={item.id} onClick={() => onOpenSailing(item.id)} className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50"><div className="font-semibold text-gray-800">{item.name}</div><div className="mt-1 text-xs text-gray-500">{new Date(item.startsAt).toLocaleDateString()} · {item.shipName}</div></button>)}</div></section>}<section className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm"><h2 className="font-bold text-gray-800">Content model</h2><p className="mt-2">{draft.type === 'resort' ? 'A resort is a destination property with planning, accommodation, amenities, and on-property experiences.' : draft.type === 'cruise_series' ? 'A cruise series owns reusable identity. Each dated sailing stores its own ship, itinerary, pricing, and booking state.' : 'A sailing is a dated travel occurrence linked to a reusable cruise brand.'}</p></section></aside>
    </div>
  </div>;
};

export default AdminTravelEditor;
