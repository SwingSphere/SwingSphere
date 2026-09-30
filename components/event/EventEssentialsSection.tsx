import React from 'react';
import { Link } from 'react-router-dom';

type EventEssentialsSectionProps = {
  timeText: string;
  locationText: string;
  venueName?: string;
  venuePath?: string;
  attendanceText?: string;
  calendarActions?: React.ReactNode;
};

const EventEssentialsSection: React.FC<EventEssentialsSectionProps> = ({
  timeText,
  locationText,
  venueName,
  venuePath,
  attendanceText,
  calendarActions,
}) => {
  const items = [
    { label: 'When', value: timeText || 'Schedule TBD' },
    { label: 'Where', value: venueName || locationText || 'Location TBD', href: venueName && venuePath ? venuePath : undefined },
    { label: 'Admission', value: attendanceText || 'See event details' },
  ];

  return (
    <section className="relative z-10 mt-3 rounded-2xl border border-white/10 bg-gray-950/90 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-4 lg:-mt-3">
      <div className="grid gap-3 md:grid-cols-3 md:items-stretch">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/5 bg-white/[0.035] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{item.label}</p>
            {item.href ? (
              <Link to={item.href} className="mt-1 inline-flex text-sm font-semibold leading-5 text-red-200 underline decoration-red-300/40 underline-offset-4 hover:text-white">
                {item.value} →
              </Link>
            ) : (
              <p className="mt-1 text-sm font-medium leading-5 text-gray-100">{item.value}</p>
            )}
          </div>
        ))}
      </div>
      {calendarActions ? (
        <div className="mt-3 border-t border-white/5 px-1 pt-3">{calendarActions}</div>
      ) : null}
    </section>
  );
};

export default EventEssentialsSection;
