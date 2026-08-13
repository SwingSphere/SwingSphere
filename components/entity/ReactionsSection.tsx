import React, { useEffect, useState } from 'react';

type ReactionsSectionProps = {
  entityKey: string;
  entityType: 'event' | 'club' | 'host';
  title?: string;
  variant?: 'card' | 'bare';
  hideTitle?: boolean;
};

type ReactionCounts = {
  up: number;
  down: number;
};

const getStorageKey = (entityType: string, entityKey: string) =>
  `reactions:${entityType}:${entityKey}`;

const ReactionsSection: React.FC<ReactionsSectionProps> = ({
  entityKey,
  entityType,
  title = 'Reactions',
  variant = 'card',
  hideTitle = false,
}) => {
  const [counts, setCounts] = useState<ReactionCounts>({ up: 0, down: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(getStorageKey(entityType, entityKey));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ReactionCounts;
        if (typeof parsed.up === 'number' && typeof parsed.down === 'number') {
          setCounts(parsed);
        }
      } catch {
        // ignore corrupt data
      }
    }
  }, [entityKey, entityType]);

  const handleVote = (direction: 'up' | 'down') => {
    const next = {
      up: counts.up + (direction === 'up' ? 1 : 0),
      down: counts.down + (direction === 'down' ? 1 : 0),
    };
    setCounts(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getStorageKey(entityType, entityKey), JSON.stringify(next));
    }
  };

  const content = (
    <>
      {!hideTitle && (
        <h2 className="text-lg font-semibold text-gray-100 mb-3">{title}</h2>
      )}
      <div className="flex items-center gap-4">
        <button
          onClick={() => handleVote('up')}
          className="flex items-center gap-2 text-sm text-green-300 bg-green-900/20 border border-green-800/50 px-3 py-2 rounded-lg hover:bg-green-900/40 transition-colors"
        >
          <span aria-hidden="true">👍</span>
          <span>Helpful ({counts.up})</span>
        </button>
        <button
          onClick={() => handleVote('down')}
          className="flex items-center gap-2 text-sm text-red-300 bg-red-900/20 border border-red-800/50 px-3 py-2 rounded-lg hover:bg-red-900/40 transition-colors"
        >
          <span aria-hidden="true">👎</span>
          <span>Not Great ({counts.down})</span>
        </button>
      </div>
    </>
  );

  if (variant === 'bare') {
    return <div>{content}</div>;
  }

  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      {content}
    </section>
  );
};

export default ReactionsSection;
