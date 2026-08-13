import React from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  MessageSquareOff,
  type LucideIcon,
} from 'lucide-react';

type FeedbackStateNoticeProps = {
  tone?: 'neutral' | 'loading' | 'error' | 'success' | 'withdrawn';
  title: string;
  description?: string;
  action?: React.ReactNode;
};

const icons: Record<NonNullable<FeedbackStateNoticeProps['tone']>, LucideIcon> = {
  neutral: CalendarClock,
  loading: LoaderCircle,
  error: AlertCircle,
  success: CheckCircle2,
  withdrawn: MessageSquareOff,
};

const FeedbackStateNotice: React.FC<FeedbackStateNoticeProps> = ({
  tone = 'neutral',
  title,
  description,
  action,
}) => {
  const Icon = icons[tone];
  return (
    <div className={`ss-feedback-notice ss-feedback-notice--${tone}`} aria-live={tone === 'loading' ? 'polite' : undefined}>
      <span className="ss-feedback-notice__icon">
        <Icon size={19} className={tone === 'loading' ? 'animate-spin' : ''} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-100">{title}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
};

export default FeedbackStateNotice;
