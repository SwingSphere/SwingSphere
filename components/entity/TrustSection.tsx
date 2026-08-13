import React from 'react';
import ReactionsSection from './ReactionsSection';

type TrustSectionProps = {
  entityKey: string;
  entityType: 'event' | 'club' | 'host';
  title?: string;
  summary?: string;
  metadataLines?: string[];
  disclaimer?: string;
  asideLabel?: string;
  variant?: 'card' | 'bare';
};

const TrustSection: React.FC<TrustSectionProps> = ({
  entityKey,
  entityType,
  title = 'Trust',
  summary,
  metadataLines,
  disclaimer,
  asideLabel = 'Badges & trust signals coming soon.',
  variant = 'card',
}) => {
  const content = (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-2">{title}</h2>
        {summary ? <p className="text-xs text-gray-400 mb-2">{summary}</p> : null}
        <ReactionsSection entityKey={entityKey} entityType={entityType} variant="bare" hideTitle />
        {metadataLines && metadataLines.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-gray-500">
            {metadataLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {disclaimer ? <p className="mt-3 text-xs text-gray-500">{disclaimer}</p> : null}
      </div>
      <div className="text-xs text-gray-500 border border-gray-700 rounded-lg px-3 py-2 bg-black/30">
        {asideLabel}
      </div>
    </div>
  );

  if (variant === 'bare') {
    return content;
  }

  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      {content}
    </section>
  );
};

export default TrustSection;
