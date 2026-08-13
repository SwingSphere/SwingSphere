import React, { useEffect } from 'react';
import { MessageSquareText } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { FeedbackTargetType } from '../../lib/feedback';

type PresentationTarget = Extract<FeedbackTargetType, 'event' | 'club' | 'organization'>;

export const FEEDBACK_EXPERIENCE_COPY: Record<PresentationTarget, {
  eyebrow: string;
  title: string;
  description: string;
}> = {
  event: {
    eyebrow: 'Community',
    title: 'Guest reviews',
    description: 'Reviews from people who attended this event.'
  },
  club: {
    eyebrow: 'Community',
    title: 'Guest reviews',
    description: 'Reviews from people who visited this club.'
  },
  organization: {
    eyebrow: 'Community',
    title: 'Organizer feedback',
    description: 'Published community feedback about communication, consistency, and organization.',
  },
};

type FeedbackExperienceShellProps = {
  targetType: PresentationTarget;
  labelledBy: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  calm?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

const FeedbackExperienceShell: React.FC<FeedbackExperienceShellProps> = ({
  targetType,
  labelledBy,
  action,
  badge,
  calm = false,
  children,
  footer,
}) => {
  const copy = FEEDBACK_EXPERIENCE_COPY[targetType];
  const location = useLocation();

  useEffect(() => {
    if (location.hash !== `#${labelledBy}`) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(labelledBy)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [labelledBy, location.hash]);

  return (
    <section
      className={`ss-feedback-experience ss-feedback-experience--compact${calm ? ' ss-feedback-experience--calm' : ''}`}
      aria-labelledby={labelledBy}
    >
      <div className="ss-feedback-experience__ambient" aria-hidden="true" />
      <header className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/18 bg-rose-300/[0.07] text-rose-200">
            <MessageSquareText size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-300/80">{copy.eyebrow}</p>
            <h2 id={labelledBy} className="mt-0.5 text-xl font-black tracking-[-0.015em] text-white sm:text-2xl">
              {copy.title}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400 sm:text-sm">
              {copy.description}
            </p>
          </div>
        </div>
        {badge ?? action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {badge}
            {action}
          </div>
        ) : null}
      </header>

      <div className="relative z-[1] mt-4">{children}</div>
      {footer ? <footer className="relative z-[1] mt-4 border-t border-white/[0.06] pt-3">{footer}</footer> : null}
    </section>
  );
};

export default FeedbackExperienceShell;
