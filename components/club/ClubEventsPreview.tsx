import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, History, Plus } from 'lucide-react';
import EventCardCompact from '../host/EventCardCompact';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

export type ClubEventPreviewItem = {
  id: string;
  name: string;
  dateTime: string;
  tags: string[];
  logoUrl?: string;
  logoAlt?: string;
  flyerUrl?: string;
  to?: string;
};

type ClubEventsPreviewProps = {
  events: ClubEventPreviewItem[];
  pastEvents?: ClubEventPreviewItem[];
  viewAllHref?: string;
  addEventHref?: string;
};

const INITIAL_UPCOMING_LIMIT = 5;
const INITIAL_PAST_LIMIT = 6;

const ClubEventsPreview: React.FC<ClubEventsPreviewProps> = ({
  events,
  pastEvents = [],
  viewAllHref = '/explore',
  addEventHref,
}) => {
  const { isAdvancedEditorOpen, isViewingAsVisitor, publicPage } = useAdminEditMode();
  const showAddEvent = Boolean(publicPage?.canEdit && !isViewingAsVisitor && !isAdvancedEditorOpen && addEventHref);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const previewItems = showAllUpcoming ? events : events.slice(0, INITIAL_UPCOMING_LIMIT);
  const visiblePastItems = showAllPast ? pastEvents : pastEvents.slice(0, INITIAL_PAST_LIMIT);
  const hasAnyEvents = events.length > 0 || pastEvents.length > 0;

  return (
    <section id="club-upcoming-events" className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold text-gray-100">Upcoming Events at This Club</h2>
            {events.length > 0 ? (
              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-200">
                {events.length} upcoming
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {events.length > 0
              ? 'Published events currently scheduled at this venue.'
              : pastEvents.length > 0
                ? 'No upcoming dates are currently scheduled. Browse past events hosted here below.'
                : 'Preview of what is currently scheduled here.'}
          </p>
        </div>
        {showAddEvent ? (
          <Link
            to={addEventHref!}
            className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white transition hover:border-red-300/60 hover:bg-red-500/10"
          >
            <Plus size={14} /> Add event at this club
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        {previewItems.length === 0 ? (
          <p className="text-sm text-gray-500">No upcoming events currently listed. Check back soon.</p>
        ) : (
          <div className="space-y-3">
            {previewItems.map((item) => (
              <EventCardCompact
                key={item.id}
                title={item.name}
                dateTime={item.dateTime}
                tags={item.tags}
                logoUrl={item.logoUrl}
                logoAlt={item.logoAlt}
                flyerUrl={item.flyerUrl}
                to={item.to}
              />
            ))}
          </div>
        )}
      </div>

      {(events.length > INITIAL_UPCOMING_LIMIT || hasAnyEvents) ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
          {events.length > INITIAL_UPCOMING_LIMIT ? (
            <button
              type="button"
              onClick={() => setShowAllUpcoming((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-200 transition hover:text-white"
            >
              {showAllUpcoming ? (
                <>
                  <span>Show fewer upcoming events</span>
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  <span>Show all {events.length} upcoming events</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
          ) : <span />}
          {events.length > 0 ? (
            <Link to={viewAllHref} className="text-xs font-semibold text-red-300 hover:text-red-200">
              View all events at this club &rarr;
            </Link>
          ) : null}
        </div>
      ) : null}

      {pastEvents.length > 0 ? (
        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <button
            type="button"
            onClick={() => setShowPastEvents((prev) => !prev)}
            aria-expanded={showPastEvents}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2.5 text-left text-xs font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.045] hover:text-white"
          >
            <span className="inline-flex items-center gap-2">
              <History size={14} className="text-gray-400" />
              <span>Past Events at This Club ({pastEvents.length})</span>
            </span>
            {showPastEvents ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showPastEvents ? (
            <div className="mt-3 space-y-2.5">
              {visiblePastItems.map((item) => (
                <EventCardCompact
                  key={item.id}
                  title={item.name}
                  dateTime={item.dateTime}
                  tags={item.tags}
                  logoUrl={item.logoUrl}
                  logoAlt={item.logoAlt}
                  flyerUrl={item.flyerUrl}
                  to={item.to}
                />
              ))}
              {pastEvents.length > INITIAL_PAST_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setShowAllPast((prev) => !prev)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition hover:text-gray-200"
                >
                  {showAllPast
                    ? 'Show fewer past events'
                    : `Show all ${pastEvents.length} past events`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default ClubEventsPreview;
