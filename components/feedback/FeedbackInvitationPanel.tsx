import React from 'react';
import { Clock3, MessageSquareText, ShieldCheck } from 'lucide-react';
import {
  type FeedbackAggregate,
  type FeedbackTargetType,
} from '../../lib/feedback';

type FeedbackInvitationPanelProps = {
  aggregate: FeedbackAggregate;
  targetType: Extract<FeedbackTargetType, 'event' | 'club'>;
  targetName: string;
  action?: React.ReactNode;
};

const FeedbackInvitationPanel: React.FC<FeedbackInvitationPanelProps> = ({
  aggregate,
  targetType,
  targetName,
  action,
}) => {
  const detailCopy = targetType === 'event'
    ? 'Add a quick thumbs up or down, then tell future guests what they should know.'
    : 'Add a quick thumbs up or down, then tell future guests what they should know.';
  const thresholdCopy = `Optional private details can later support aggregate insights after enough responses are collected.`;

  return (
    <div className="rounded-2xl border border-rose-300/20 bg-[linear-gradient(135deg,rgba(35,8,18,.48),rgba(10,8,8,.54))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,.045)] sm:px-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.07] text-rose-200">
            <MessageSquareText size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-rose-300/80">Share your experience</p>
            <h3 className="mt-1 text-base font-bold text-white sm:text-lg">What stood out about {targetName}?</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400 sm:text-sm">{detailCopy}</p>
            <div className="mt-2 flex flex-col gap-1 text-[10px] leading-4 text-zinc-500 sm:flex-row sm:flex-wrap sm:gap-x-4">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={12} className="text-amber-300" aria-hidden="true" /> About one minute; extra detail tags optional</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} aria-hidden="true" /> {thresholdCopy}</span>
            </div>
          </div>
        </div>
        {action ? <div className="shrink-0 md:max-w-[15rem]">{action}</div> : null}
      </div>
    </div>
  );
};

export default FeedbackInvitationPanel;
