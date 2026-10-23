import React from 'react';
import { CalendarCheck2, Clock, ExternalLink, Mail, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

export type EventStatusBadge = {
  label: string;
  tone: 'live' | 'today' | 'past';
};

type EventEssentialsSectionProps = {
  timeText: string;
  timeSubValue?: string;
  statusBadge?: EventStatusBadge | null;
  locationText: string;
  venueName?: string;
  venuePath?: string;
  hostName?: string;
  hostPath?: string;
  attendanceText?: string;
  accessUrl?: string;
  accessDestinationType?: 'ticket' | 'rsvp' | 'website';
  secondaryTicketUrl?: string;
  secondaryRsvpUrl?: string;
  contactEmail?: string;
  calendarActions?: React.ReactNode;
  isPast?: boolean;
  className?: string;
};

const EventEssentialsSection: React.FC<EventEssentialsSectionProps> = ({
  timeText,
  timeSubValue,
  statusBadge,
  locationText,
  venueName,
  venuePath,
  hostName,
  hostPath,
  attendanceText,
  accessUrl,
  accessDestinationType = 'website',
  secondaryTicketUrl,
  secondaryRsvpUrl,
  contactEmail,
  calendarActions,
  isPast = false,
  className = '',
}) => {
  const items: Array<{
    label: string;
    value: string;
    subValue?: string;
    href?: string;
    badge?: EventStatusBadge | null;
  }> = [
    {
      label: 'When',
      value: timeText || 'Schedule TBD',
      subValue: timeSubValue || undefined,
      badge: statusBadge,
    },
    {
      label: 'Where',
      value: venueName || locationText || 'Location TBD',
      subValue: venueName && locationText && venueName !== locationText ? locationText : undefined,
      href: venueName && venuePath ? venuePath : undefined,
    },
    ...(hostName
      ? [
          {
            label: 'Host',
            value: hostName,
            href: hostPath,
          },
        ]
      : []),
    { label: 'Admission', value: attendanceText || 'See event details' },
  ];

  const accessButtonLabel = isPast
    ? 'View Event Page'
    : accessDestinationType === 'ticket'
      ? 'Get Tickets'
      : accessDestinationType === 'rsvp'
        ? 'RSVP / Request Access'
        : 'Official Event Page';

  const hasDistinctSecondaryTicket =
    !isPast && Boolean(secondaryTicketUrl && secondaryTicketUrl !== accessUrl);
  const hasDistinctSecondaryRsvp =
    !isPast &&
    Boolean(
      secondaryRsvpUrl &&
        secondaryRsvpUrl !== accessUrl &&
        secondaryRsvpUrl !== secondaryTicketUrl,
    );

  const hasFooterActions = Boolean(
    (!isPast && calendarActions) ||
      accessUrl ||
      hasDistinctSecondaryTicket ||
      hasDistinctSecondaryRsvp ||
      (!isPast && contactEmail),
  );

  return (
    <section
      className={`relative z-10 mt-3 rounded-2xl border border-white/10 bg-gray-950/90 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-4 min-[1025px]:-mt-3 ${className}`.trim()}
    >
      <div
        className={`grid gap-2.5 sm:grid-cols-2 ${
          items.length >= 4 ? 'min-[1025px]:grid-cols-4' : 'md:grid-cols-3'
        } md:items-stretch`}
      >
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/5 bg-white/[0.035] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{item.label}</p>
              {item.badge ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    item.badge.tone === 'live'
                      ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : item.badge.tone === 'today'
                        ? 'border border-red-400/40 bg-red-500/15 text-red-200'
                        : 'border border-white/15 bg-white/[0.06] text-gray-400'
                  }`}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {item.badge.label}
                </span>
              ) : null}
            </div>
            {item.href ? (
              <Link
                to={item.href}
                className="mt-1 inline-flex text-sm font-semibold leading-5 text-red-200 underline decoration-red-300/40 underline-offset-4 hover:text-white"
              >
                {item.value} →
              </Link>
            ) : (
              <p className="mt-1 text-sm font-medium leading-5 text-gray-100">{item.value}</p>
            )}
            {item.subValue ? (
              <p className="mt-0.5 text-xs leading-4 text-gray-400">{item.subValue}</p>
            ) : null}
          </div>
        ))}
      </div>
      {hasFooterActions ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-1 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {accessUrl ? (
              <a
                href={accessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  isPast
                    ? 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-200 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white'
                    : 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500'
                }
              >
                {accessDestinationType === 'ticket' && !isPast ? (
                  <Ticket className="h-3.5 w-3.5" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                <span>{accessButtonLabel}</span>
              </a>
            ) : !isPast && contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/25"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Contact Host to RSVP</span>
              </a>
            ) : null}
            {hasDistinctSecondaryTicket ? (
              <a
                href={secondaryTicketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-500/15 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-red-100 transition hover:border-red-400/55 hover:bg-red-500/25 hover:text-white"
              >
                <Ticket className="h-3.5 w-3.5 text-red-300" />
                <span>Get Tickets</span>
              </a>
            ) : null}
            {hasDistinctSecondaryRsvp ? (
              <a
                href={secondaryRsvpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-200 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
              >
                <CalendarCheck2 className="h-3.5 w-3.5 text-red-300" />
                <span>RSVP</span>
              </a>
            ) : null}
          </div>
          {!isPast && calendarActions ? <div className="min-w-0 flex-1">{calendarActions}</div> : null}
        </div>
      ) : null}
    </section>
  );
};

export default EventEssentialsSection;
