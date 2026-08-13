import React from 'react';
import { ArrowRight, LogIn, MessageSquareText } from 'lucide-react';

type FeedbackEntryButtonProps = {
  label: string;
  onClick: () => void;
  requiresSignIn?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

const FeedbackEntryButton: React.FC<FeedbackEntryButtonProps> = ({
  label,
  onClick,
  requiresSignIn = false,
  disabled = false,
  disabledReason,
}) => (
  <div>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={disabled && disabledReason ? 'feedback-entry-disabled-reason' : undefined}
      className="group ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(110deg,rgba(111,6,31,.9),rgba(205,31,58,.84))] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(159,18,57,.2)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      {requiresSignIn ? <LogIn size={17} aria-hidden="true" /> : <MessageSquareText size={17} aria-hidden="true" />}
      {label}
      <ArrowRight size={17} className="ml-1 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
    {disabled && disabledReason ? (
      <p id="feedback-entry-disabled-reason" className="mt-2 text-xs text-gray-500">{disabledReason}</p>
    ) : null}
  </div>
);

export default FeedbackEntryButton;
