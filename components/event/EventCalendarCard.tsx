import React, { useEffect, useMemo, useState } from 'react';
import TrackedExternalLink from '../analytics/TrackedExternalLink';

type EventCalendarCardProps = {
  eventId: string;
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  locationText: string;
  organizationId?: string;
  eventSeriesId?: string;
  placementPrefix?: string;
  compact?: boolean;
};

const toCalendarTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const escapeIcs = (value: string): string => {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
};

const EventCalendarCard: React.FC<EventCalendarCardProps> = ({
  eventId,
  title,
  description,
  startIso,
  endIso,
  locationText,
  organizationId,
  eventSeriesId,
  placementPrefix = 'event_page_calendar',
  compact = false,
}) => {
  const [icsUrl, setIcsUrl] = useState<string>('');
  const start = toCalendarTimestamp(startIso);
  const end = toCalendarTimestamp(endIso);
  const details = description?.trim() || 'Event details on SwingSphere.';

  const googleUrl = useMemo(() => {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${start}/${end}`,
      details,
      location: locationText,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [details, end, locationText, start, title]);

  useEffect(() => {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@swingsphere.local`;
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SwingSphere//Event//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toCalendarTimestamp(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(details)}`,
      `LOCATION:${escapeIcs(locationText)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setIcsUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [details, end, locationText, start, title]);

  const trackingBase = {
    entityType: 'event' as const,
    entityId: eventId,
    organizationId,
    eventSeriesId,
    surface: 'entity_page' as const,
  };

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-gray-300">Add to calendar:</span>
        <TrackedExternalLink
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          tracking={{
            ...trackingBase,
            destinationType: 'calendar_google',
            placement: `${placementPrefix}_google`,
          }}
          className="text-red-300 underline underline-offset-4 hover:text-red-200"
        >
          Google Calendar
        </TrackedExternalLink>
        <TrackedExternalLink
          href={icsUrl}
          download={`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'event'}.ics`}
          tracking={{
            ...trackingBase,
            destinationType: 'calendar_ics',
            destinationDomain: 'download.local',
            placement: `${placementPrefix}_ics`,
          }}
          className="text-red-300 underline underline-offset-4 hover:text-red-200"
        >
          Download ICS
        </TrackedExternalLink>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="text-base font-semibold text-gray-100">Add to Calendar</h2>
      <p className="mt-1 text-xs text-gray-500">Save this event to your preferred calendar.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <TrackedExternalLink
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          tracking={{
            ...trackingBase,
            destinationType: 'calendar_google',
            placement: `${placementPrefix}_google`,
          }}
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Add to Google Calendar
        </TrackedExternalLink>
        <TrackedExternalLink
          href={icsUrl}
          download={`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'event'}.ics`}
          tracking={{
            ...trackingBase,
            destinationType: 'calendar_ics',
            destinationDomain: 'download.local',
            placement: `${placementPrefix}_ics`,
          }}
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Download .ics
        </TrackedExternalLink>
      </div>
    </section>
  );
};

export default EventCalendarCard;
