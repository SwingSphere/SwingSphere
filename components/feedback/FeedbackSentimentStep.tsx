import React from 'react';
import { CircleMinus, Heart, Waves } from 'lucide-react';
import type { FeedbackSentiment } from '../../lib/feedback';

type FeedbackSentimentStepProps = {
  value?: FeedbackSentiment;
  onChange: (sentiment: FeedbackSentiment) => void;
};

const choices: Array<{
  id: FeedbackSentiment;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
}> = [
  { id: 'positive', label: 'Positive', description: 'The experience went well overall.', icon: Heart },
  { id: 'mixed', label: 'Mixed', description: 'Some parts worked and some could improve.', icon: Waves },
  { id: 'negative', label: 'Negative', description: 'The experience missed important expectations.', icon: CircleMinus },
];

const sentimentTone: Record<FeedbackSentiment, string> = {
  positive: 'border-emerald-300/25 bg-emerald-300/[0.06] ring-2 ring-emerald-300/55',
  mixed: 'border-amber-300/25 bg-amber-300/[0.06] ring-2 ring-amber-300/55',
  negative: 'border-rose-300/25 bg-rose-300/[0.06] ring-2 ring-rose-300/55',
};

const sentimentIconTone: Record<FeedbackSentiment, string> = {
  positive: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
  mixed: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
  negative: 'border-rose-300/20 bg-rose-300/10 text-rose-200',
};

const FeedbackSentimentStep: React.FC<FeedbackSentimentStepProps> = ({ value, onChange }) => (
  <fieldset>
    <legend className="text-lg font-bold text-white">How was your overall experience?</legend>
    <p className="mt-1 text-sm leading-6 text-gray-400">Choose the closest fit. You can add detail in the next steps.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {choices.map(({ id, label, description, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            className={`ss-glass ss-glass--ambient ss-glass--interactive min-h-28 rounded-2xl p-3.5 text-left ${selected ? sentimentTone[id] : ''}`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${selected ? sentimentIconTone[id] : 'border-white/10 bg-white/[0.03] text-gray-400'}`}>
              <Icon size={20} aria-hidden={true} />
            </span>
            <span className="mt-2.5 block text-base font-bold text-white">{label}</span>
            <span className="mt-1 block text-xs leading-5 text-gray-400">{description}</span>
          </button>
        );
      })}
    </div>
  </fieldset>
);

export default FeedbackSentimentStep;
