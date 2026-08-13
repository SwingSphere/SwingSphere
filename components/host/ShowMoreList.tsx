import React, { useMemo, useState } from 'react';

type ShowMoreListProps<T> = {
  items: T[];
  initialCount?: number;
  emptyState?: React.ReactNode;
  moreLabel?: string;
  lessLabel?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
};

const ShowMoreList = <T,>({
  items,
  initialCount = 5,
  emptyState,
  moreLabel = 'Show more',
  lessLabel = 'Show less',
  renderItem,
}: ShowMoreListProps<T>) => {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;

  const visibleItems = useMemo(
    () => (expanded ? items : items.slice(0, initialCount)),
    [expanded, initialCount, items],
  );

  if (items.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className="space-y-3">
      {visibleItems.map((item, index) => renderItem(item, index))}
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-xs font-semibold text-gray-300 underline underline-offset-4 hover:text-gray-200"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
};

export default ShowMoreList;
