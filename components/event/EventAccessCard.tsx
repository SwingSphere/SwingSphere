import React from 'react';
import { ExternalLink, Mail } from 'lucide-react';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import type { OutboundDestinationType } from '../../lib/analytics/outboundTracking';

type EventAccessCardProps = {
  eventId: string;
  accessUrl?: string;
  accessDestinationType?: OutboundDestinationType;
  contactEmail?: string;
  organizationId?: string;
  eventSeriesId?: string;
  placement: string;
};

const normalizeExternalUrl = (value?: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const EventAccessCard: React.FC<EventAccessCardProps> = ({
  eventId,
  accessUrl,
  accessDestinationType = 'website',
  contactEmail,
  organizationId,
  eventSeriesId,
  placement,
}) => {
  const normalizedAccessUrl = normalizeExternalUrl(accessUrl);
  const emailHref = contactEmail?.trim() ? `mailto:${contactEmail.trim()}` : '';

  if (!normalizedAccessUrl && !emailHref) return null;

  return (
    <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Plan your attendance</p>
      <h2 className="mt-1 text-sm font-semibold text-gray-100">How to Attend</h2>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        Events may use ticketing, approval forms, email screening, or direct payment. Follow the host’s listed method.
      </p>
      <div className="mt-3 space-y-2">
        {normalizedAccessUrl ? (
          <TrackedExternalLink
            href={normalizedAccessUrl}
            target="_blank"
            rel="noopener noreferrer"
            tracking={{
              entityType: 'event',
              entityId: eventId,
              organizationId,
              eventSeriesId,
              destinationType: accessDestinationType,
              placement,
              surface: 'entity_page',
            }}
            className="ss-glass ss-glass--ambient ss-glass--interactive flex items-center gap-3 rounded-xl px-3 py-2.5 text-gray-300 hover:text-gray-100"
          >
            <ExternalLink size={15} className="shrink-0 text-red-300" />
            <span className="min-w-0 flex-1 text-xs font-medium">Open registration or ticket link</span>
            <ExternalLink size={13} className="shrink-0 text-gray-500" />
          </TrackedExternalLink>
        ) : null}
        {emailHref ? (
          <TrackedExternalLink
            href={emailHref}
            tracking={{
              entityType: 'event',
              entityId: eventId,
              organizationId,
              eventSeriesId,
              destinationType: 'email',
              placement: `${placement}_contact`,
              surface: 'entity_page',
            }}
            className="ss-glass ss-glass--ambient ss-glass--interactive flex items-center gap-3 rounded-xl px-3 py-2.5 text-gray-300 hover:text-gray-100"
          >
            <Mail size={15} className="shrink-0 text-red-300" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{contactEmail}</span>
          </TrackedExternalLink>
        ) : null}
      </div>
    </section>
  );
};

export default EventAccessCard;
