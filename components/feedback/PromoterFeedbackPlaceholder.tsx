import React from 'react';
import { Clock3, LockKeyhole, MessageSquareText } from 'lucide-react';
import FeedbackExperienceShell from './FeedbackExperienceShell';

type PromoterFeedbackPlaceholderProps = {
  id: string;
};

const PromoterFeedbackPlaceholder: React.FC<PromoterFeedbackPlaceholderProps> = ({ id }) => (
  <FeedbackExperienceShell targetType="organization" labelledBy={id} calm>
    <div className="ss-feedback-placeholder">
      <span className="ss-feedback-placeholder__icon" aria-hidden="true"><MessageSquareText size={28} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200/75">In development</p>
        <h3 className="mt-2 text-xl font-bold text-white">Organizer feedback is being prepared thoughtfully.</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          This non-interactive preview uses the shared experience system. Submission will remain unavailable until the organizer workflow and moderation surfaces are ready.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-2"><Clock3 size={15} className="text-amber-300/80" /> No launch date claimed</span>
          <span className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-amber-300/80" /> No active submission flow</span>
        </div>
      </div>
    </div>
  </FeedbackExperienceShell>
);

export default PromoterFeedbackPlaceholder;
