import React from 'react';
import { ArrowRight, CheckCircle2, ClipboardList } from 'lucide-react';
import type { Listing } from '../../types';

type SubmissionConfirmationProps = {
  listing: Listing;
  onViewSubmissions: () => void;
  onReturn: () => void;
  onAddAnother?: () => void;
  presentation?: 'default' | 'mobile';
  variant?: 'submitted' | 'updated' | 'managed-updated' | 'published';
};

const SubmissionConfirmation: React.FC<SubmissionConfirmationProps> = ({
  listing,
  onViewSubmissions,
  onReturn,
  onAddAnother,
  presentation = 'default',
  variant = 'submitted',
}) => {
  const kindLabel = listing.type === 'event' ? 'event' : 'club';
  const isMobile = presentation === 'mobile';
  const isManagedUpdate = variant === 'managed-updated';
  const isPublishedSubmission = variant === 'published';
  const isLiveNow = isManagedUpdate || isPublishedSubmission;

  return (
    <section
      className={isMobile
        ? 'flex min-h-[62vh] flex-col items-center justify-center rounded-[26px] border border-emerald-300/15 bg-emerald-300/[0.045] px-5 py-8 text-center'
        : 'ss-submission-page ss-bg-geometric-muted min-h-[calc(100vh-72px)] px-4 py-10 text-white md:px-8 md:py-16'}
      aria-labelledby="submission-confirmation-title"
    >
      <div className={isMobile ? 'w-full max-w-md' : 'mx-auto w-full max-w-2xl'}>
        <div className={isMobile ? '' : 'ss-glass-surface rounded-[30px] border border-white/10 px-6 py-9 text-center shadow-2xl sm:px-10 sm:py-12'}>
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200/75">
            {isManagedUpdate ? 'Published update' : isPublishedSubmission ? 'Published now' : 'Pending review'}
          </p>
          <h1 id="submission-confirmation-title" className={`${isMobile ? 'mt-2 text-xl' : 'mt-3 text-3xl sm:text-4xl'} font-semibold tracking-tight text-white`}>
            {isManagedUpdate ? 'Listing updated' : isPublishedSubmission ? 'Event published' : variant === 'updated' ? 'Submission updated' : 'Submission received'}
          </h1>
          <p className={`${isMobile ? 'mt-3 text-[13px]' : 'mx-auto mt-4 max-w-xl text-sm sm:text-base'} leading-6 text-gray-400`}>
            {isManagedUpdate
              ? <>Your changes to <span className="font-semibold text-gray-100">{listing.name}</span> have been saved to the managed {kindLabel} listing.</>
              : isPublishedSubmission
                ? <><span className="font-semibold text-gray-100">{listing.name}</span> is live now on SwingSphere under your verified management access.</>
                : <>{variant === 'updated' ? 'Your changes to' : 'Thanks — your'} {kindLabel} submission <span className="font-semibold text-gray-100">{listing.name}</span> {variant === 'updated' ? 'have been saved and remain pending review.' : 'has been received. We’ll review the listing details, location, and submitted media before it appears publicly on SwingSphere.'}</>}
          </p>

          <div className={`${isMobile ? 'mt-5' : 'mx-auto mt-7 max-w-xl'} rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-left`}>
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-red-200" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-white">{isLiveNow ? 'Published successfully' : 'What happens next'}</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  {isLiveNow
                    ? 'Verified management content is live immediately. SwingSphere does not hold routine owner, manager, or editor content for moderation; it can still be reviewed later if it is reported or flagged.'
                    : 'Your submission stays under review and is not visible in public discovery until it is approved. You can check its current status from your Contributions page.'}
                </p>
              </div>
            </div>
          </div>

          <div className={`${isMobile ? 'mt-6 grid gap-2' : 'mt-8 flex flex-col justify-center gap-3 sm:flex-row'}`}>
            <button
              type="button"
              onClick={onViewSubmissions}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 text-sm font-bold text-white transition hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-200"
            >
              View my submissions <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onReturn}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.045] px-5 text-sm font-semibold text-white transition hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            >
              Return to SwingSphere
            </button>
            {onAddAnother ? (
              <button
                type="button"
                onClick={onAddAnother}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/[0.08] px-5 text-sm font-semibold text-gray-300 transition hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                Add another
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SubmissionConfirmation;
