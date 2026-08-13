import React from 'react';
import { AlertTriangle, ArrowLeft, LockKeyhole } from 'lucide-react';
import {
  FEEDBACK_SAFETY_CONCERNS,
  FEEDBACK_SAFETY_NARRATIVE_MAX_LENGTH,
  type FeedbackRepositoryMode,
} from '../../lib/feedback';

type FeedbackSafetyBranchProps = {
  selectedCategoryId?: string;
  narrative: string;
  repositoryMode: FeedbackRepositoryMode;
  onSelectCategory: (categoryId: string) => void;
  onChangeNarrative: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
};

const FeedbackSafetyBranch: React.FC<FeedbackSafetyBranchProps> = ({
  selectedCategoryId,
  narrative,
  repositoryMode,
  onSelectCategory,
  onChangeNarrative,
  onBack,
  onSave,
  isSaving,
}) => (
  <div>
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
        <LockKeyhole size={19} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-bold text-white">Private concern pathway</h2>
        <p className="mt-1 text-sm leading-6 text-gray-400">Safety-sensitive concerns stay separate from public feedback and are never included in aggregate signals.</p>
      </div>
    </div>

    <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-50/80">
      <p className="flex items-center gap-2 font-bold text-amber-100"><AlertTriangle size={15} /> {repositoryMode === 'mock' ? 'Development mode' : 'Private safety report'}</p>
      <p className="mt-1">{repositoryMode === 'mock' ? 'This development-only pathway stores the category locally and does not notify anyone.' : 'This report is sent privately to SwingSphere safety staff. It is not an emergency service, and no response time is guaranteed.'}</p>
    </div>

    <fieldset className="mt-5">
      <legend className="text-sm font-semibold text-gray-200">Concern category</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {FEEDBACK_SAFETY_CONCERNS.map((category) => (
          <button key={category.id} type="button" aria-pressed={selectedCategoryId === category.id} onClick={() => onSelectCategory(category.id)} className={`ss-glass ss-glass--ambient ss-glass--interactive min-h-20 rounded-xl p-3 text-left ${selectedCategoryId === category.id ? 'ring-1 ring-amber-300/70' : ''}`}>
            <span className="block text-sm font-bold text-gray-100">{category.label}</span>
            <span className="mt-1 block text-[11px] leading-4 text-gray-500">{category.description}</span>
          </button>
        ))}
      </div>
    </fieldset>

    <div className="mt-5">
      <label htmlFor="feedback-safety-narrative" className="text-sm font-semibold text-gray-200">What happened?</label>
      <p className="mt-1 text-xs leading-5 text-gray-500">Share the context needed for private review. Avoid unnecessary identifying details about other attendees.</p>
      <textarea id="feedback-safety-narrative" value={narrative} maxLength={FEEDBACK_SAFETY_NARRATIVE_MAX_LENGTH} rows={5} onChange={(event) => onChangeNarrative(event.target.value)} className="ss-form-control mt-3 w-full resize-y" placeholder="Describe the concern privately…" />
      <p className="mt-1 text-right text-[11px] text-gray-500">{narrative.length}/{FEEDBACK_SAFETY_NARRATIVE_MAX_LENGTH}</p>
    </div>

    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-gray-300 hover:bg-white/5">
        <ArrowLeft size={16} /> Back to feedback
      </button>
      <button type="button" onClick={onSave} disabled={!selectedCategoryId || !narrative.trim() || isSaving} className="min-h-11 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40">
        {isSaving ? 'Submitting…' : repositoryMode === 'mock' ? 'Save development concern' : 'Submit private concern'}
      </button>
    </div>
  </div>
);

export default FeedbackSafetyBranch;
