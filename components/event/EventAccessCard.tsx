import React from 'react';
import { CalendarCheck2, ExternalLink, Globe, Mail, Ticket } from 'lucide-react';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import type { OutboundDestinationType } from '../../lib/analytics/outboundTracking';

type EventAccessCardProps = {
  eventId: string;
  accessUrl?: string;
  accessDestinationType?: OutboundDestinationType;
  publicEventPageUrl?: string;
  ticketUrl?: string;
  rsvpUrl?: string;
  contactEmail?: string;
  organizationId?: string;
  eventSeriesId?: string;
  isPast?: boolean;
  placement: string;
};

const normalizeExternalUrl = (value?: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getCleanDomain = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

type ActionItem = {
  key: string;
  href: string;
  label: string;
  subLabel?: string;
  destinationType: OutboundDestinationType;
  icon: React.ReactNode;
};

const EventAccessCard: React.FC<EventAccessCardProps> = ({
  eventId,
  accessUrl,
  accessDestinationType = 'website',
  publicEventPageUrl,
  ticketUrl,
  rsvpUrl,
  contactEmail,
  organizationId,
  eventSeriesId,
  isPast = false,
  placement,
}) => {
  const normalizedPublicUrl = normalizeExternalUrl(publicEventPageUrl);
  const normalizedTicketUrl = normalizeExternalUrl(ticketUrl);
  const normalizedRsvpUrl = normalizeExternalUrl(rsvpUrl);
  const normalizedFallbackAccessUrl = normalizeExternalUrl(accessUrl);
  const emailHref = contactEmail?.trim() ? `mailto:${contactEmail.trim()}` : '';

  const actionItems: ActionItem[] = [];
  const seenUrls = new Set<string>();

  const addAction = (
    key: string,
    rawUrl: string,
    label: string,
    destinationType: OutboundDestinationType,
    icon: React.ReactNode,
  ) => {
    if (!rawUrl || seenUrls.has(rawUrl)) return;
    seenUrls.add(rawUrl);
    const domain = getCleanDomain(rawUrl);
    actionItems.push({
      key,
      href: rawUrl,
      label,
      subLabel: domain || undefined,
      destinationType,
      icon,
    });
  };

  if (normalizedPublicUrl) {
    addAction(
      'public_page',
      normalizedPublicUrl,
      'Official event page',
      'website',
      <Globe size={15} className="shrink-0 text-red-300" />,
    );
  }

  if (!isPast && normalizedTicketUrl) {
    addAction(
      'ticket',
      normalizedTicketUrl,
      'Get tickets / registration',
      'ticket',
      <Ticket size={15} className="shrink-0 text-red-300" />,
    );
  }

  if (!isPast && normalizedRsvpUrl) {
    addAction(
      'rsvp',
      normalizedRsvpUrl,
      'RSVP / request access',
      'rsvp',
      <CalendarCheck2 size={15} className="shrink-0 text-red-300" />,
    );
  }

  if (actionItems.length === 0 && normalizedFallbackAccessUrl && (!isPast || accessDestinationType === 'website')) {
    const fallbackLabel =
      accessDestinationType === 'ticket'
        ? 'Get tickets / registration'
        : accessDestinationType === 'rsvp'
          ? 'RSVP / request access'
          : 'Official event page';
    addAction(
      'primary',
      normalizedFallbackAccessUrl,
      fallbackLabel,
      accessDestinationType,
      accessDestinationType === 'ticket' ? (
        <Ticket size={15} className="shrink-0 text-red-300" />
      ) : (
        <Globe size={15} className="shrink-0 text-red-300" />
      ),
    );
  }

  if (!actionItems.length && !emailHref) return null;

  return (
    <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {isPast ? 'Event reference' : 'Plan your attendance'}
      </p>
      <h2 className="mt-1 text-sm font-semibold text-gray-100">
        {isPast ? 'Official Links' : 'How to Attend'}
      </h2>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        {isPast
          ? 'This event has concluded. Visit the organizer page for future dates or official archives.'
          : 'Events may use ticketing, approval forms, email screening, or direct payment. Follow the host’s listed method.'}
      </p>
      <div className="mt-3 space-y-2">
        {actionItems.map((item) => (
          <TrackedExternalLink
            key={item.key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            tracking={{
              entityType: 'event',
              entityId: eventId,
              organizationId,
              eventSeriesId,
              destinationType: item.destinationType,
              placement: `${placement}_${item.key}`,
              surface: 'entity_page',
            }}
            className="ss-glass ss-glass--ambient ss-glass--interactive flex items-center gap-3 rounded-xl px-3 py-2.5 text-gray-300 hover:text-gray-100"
          >
            {item.icon}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-100">{item.label}</p>
              {item.subLabel ? (
                <p className="truncate text-[11px] text-gray-500">{item.subLabel}</p>
              ) : null}
            </div>
            <ExternalLink size={13} className="shrink-0 text-gray-500" />
          </TrackedExternalLink>
        ))}
        {!isPast && emailHref ? (
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
