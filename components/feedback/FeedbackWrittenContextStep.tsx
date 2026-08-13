import React from 'react';
import { FEEDBACK_REVIEW_TEXT_MAX_LENGTH } from '../../lib/feedback';

type FeedbackWrittenContextStepProps = {
  value: string;
  approvedText?: string;
  moderationStatus?: string;
  onChange: (value: string) => void;
};

const FeedbackWrittenContextStep: React.FC<FeedbackWrittenContextStepProps> = ({
  value,
  approvedText,
  moderationStatus,
  onChange,
}) => (
  <div>
    <label htmlFor="feedback-written-context" className="text-lg font-bold text-white">Anything else future guests should know?</label>
    <p className="mt-1 text-sm leading-6 text-gray-400">Written context is optional and reviewed before publication.</p>
    {approvedText ? (
      <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">Currently published</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">{approvedText}</p>
        {moderationStatus === 'pending' ? <p className="mt-2 text-xs text-amber-100">Revision pending · published text remains visible.</p> : null}
      </div>
    ) : null}
    <textarea
      id="feedback-written-context"
      value={value}
      maxLength={FEEDBACK_REVIEW_TEXT_MAX_LENGTH}
      onChange={(event) => onChange(event.target.value)}
      rows={4}
      placeholder="Share practical, first-hand context without naming other attendees…"
      className="ss-form-control mt-4 w-full resize-y"
    />
    <div className="mt-2 flex justify-between gap-4 text-[11px] text-gray-500">
      <span>Optional</span>
      <span>{value.length}/{FEEDBACK_REVIEW_TEXT_MAX_LENGTH}</span>
    </div>
    <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-gray-400 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-4">
      <p className="font-semibold text-gray-300">Protect everyone’s privacy</p>
      <p>Do not name other attendees or reveal private addresses. Contact the club or promoter directly about urgent or safety-sensitive concerns.</p>
    </div>
  </div>
);

export default FeedbackWrittenContextStep;
