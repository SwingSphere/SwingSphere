import React, { useMemo } from 'react';

type ClubHouseRulesSectionProps = {
  content?: string;
};

const normalizeRule = (value: string): string =>
  value
    .replace(/^[-•*]\s*/, '')
    .trim()
    .replace(/[.;]+$/, '');

const splitRules = (content: string): string[] => {
  const explicitItems = content
    .split(/\r?\n|\s*[•;]\s*/)
    .map(normalizeRule)
    .filter(Boolean);

  if (explicitItems.length > 1) return explicitItems;

  return content
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(normalizeRule)
    .filter(Boolean);
};

const ClubHouseRulesSection: React.FC<ClubHouseRulesSectionProps> = ({ content }) => {
  const rules = useMemo(() => (content?.trim() ? splitRules(content) : []), [content]);

  if (!rules.length) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5 lg:col-span-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Before you go</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-100">House Rules & Practical Notes</h3>
        </div>
        <p className="text-xs text-gray-500">Club-specific guidance</p>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule}
            className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 text-sm leading-5 text-gray-300"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-300/80" aria-hidden="true" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ClubHouseRulesSection;
