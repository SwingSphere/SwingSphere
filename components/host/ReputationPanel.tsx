import React from 'react';
import TrustSection from '../entity/TrustSection';

type ReputationPanelProps = {
  entityKey: string;
  eventsListed: number;
  hostingSince?: string;
};

const ReputationPanel: React.FC<ReputationPanelProps> = ({
  entityKey,
  eventsListed,
  hostingSince,
}) => {
  return (
    <section className="ss-glass ss-glass--ambient rounded-2xl p-5">
      <h2 className="text-lg font-semibold text-gray-100">Reputation</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="ss-glass ss-glass--ambient rounded-xl p-3">
          <div className="text-2xl font-bold text-gray-100">{eventsListed}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">Events listed</div>
        </div>
        <div className="ss-glass ss-glass--ambient rounded-xl p-3">
          <div className="text-sm font-semibold text-gray-100">{hostingSince ? hostingSince : '—'}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">Hosting since</div>
        </div>
      </div>
      <div className="mt-4 border-t border-gray-800 pt-4">
        <TrustSection
          entityKey={entityKey}
          entityType="host"
          variant="bare"
          title="Community Signals"
          summary="Aggregated signals from community usage over time."
          disclaimer="Signals are not reviews and do not imply endorsement."
          asideLabel="Additional reliability markers are planned."
        />
      </div>
    </section>
  );
};

export default ReputationPanel;
