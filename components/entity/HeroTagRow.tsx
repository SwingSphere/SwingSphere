import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const TagPill: React.FC<{ tag: string }> = ({ tag }) => (
  <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-gray-100">
    {tag}
  </span>
);

const HeroTagRow: React.FC<{
  tags: string[];
  mobileVisibleCount?: number;
  desktopVisibleCount?: number;
}> = ({ tags, mobileVisibleCount = 2, desktopVisibleCount = 4 }) => {
  const [expanded, setExpanded] = useState(false);
  const uniqueTags = Array.from(new Set(tags.filter(Boolean)));

  if (!uniqueTags.length) return null;

  if (expanded) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {uniqueTags.map((tag) => <TagPill key={tag} tag={tag} />)}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-xs font-semibold text-gray-300 transition hover:border-white/25 hover:text-white"
          aria-expanded="true"
        >
          Less <ChevronUp size={12} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const mobileTags = uniqueTags.slice(0, mobileVisibleCount);
  const desktopTags = uniqueTags.slice(0, desktopVisibleCount);
  const mobileOverflow = Math.max(0, uniqueTags.length - mobileTags.length);
  const desktopOverflow = Math.max(0, uniqueTags.length - desktopTags.length);

  return (
    <>
      <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden sm:hidden">
        {mobileTags.map((tag) => <TagPill key={tag} tag={tag} />)}
        {mobileOverflow > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-xs font-semibold text-gray-300 transition hover:border-white/25 hover:text-white"
            aria-expanded="false"
            aria-label={`Show ${mobileOverflow} more tags`}
          >
            … {mobileOverflow} more <ChevronDown size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="hidden min-w-0 flex-nowrap items-center gap-2 overflow-hidden sm:flex">
        {desktopTags.map((tag) => <TagPill key={tag} tag={tag} />)}
        {desktopOverflow > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-xs font-semibold text-gray-300 transition hover:border-white/25 hover:text-white"
            aria-expanded="false"
            aria-label={`Show ${desktopOverflow} more tags`}
          >
            … {desktopOverflow} more <ChevronDown size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </>
  );
};

export default HeroTagRow;
