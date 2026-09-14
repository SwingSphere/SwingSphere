import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import EventCardCompact from '../host/EventCardCompact';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

export type ClubEventPreviewItem = {
  id: string;
  name: string;
  dateTime: string;
  city: string;
  tags: string[];
  to?: string;
};

type ClubEventsPreviewProps = {
  events: ClubEventPreviewItem[];
  viewAllHref?: string;
  addEventHref?: string;
};

const ClubEventsPreview: React.FC<ClubEventsPreviewProps> = ({
  events,
  viewAllHref = '/explore',
  addEventHref,
}) => {
  const { isAdvancedEditorOpen, isViewingAsVisitor, publicPage } = useAdminEditMode();
  const showAddEvent = Boolean(publicPage?.canEdit && !isViewingAsVisitor && !isAdvancedEditorOpen && addEventHref);
  const previewItems = events.slice(0, 5);
  return (
    <section className="ss-glass ss-glass--ambient rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Upcoming Events at This Club</h2>
          <p className="mt-1 text-xs text-gray-400">Preview of what is currently scheduled here.</p>
        </div>
        {showAddEvent ? <Link to={addEventHref!} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white transition hover:border-red-300/60 hover:bg-red-500/10"><Plus size={14} /> Add event at this club</Link> : null}
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
                city={item.city}
                tags={item.tags}
                to={item.to}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 border-t border-white/[0.08] pt-3">
        <Link to={viewAllHref} className="text-xs font-semibold text-red-300 hover:text-red-200">
          View all events at this club &rarr;
        </Link>
      </div>
    </section>
  );
};

export default ClubEventsPreview;
