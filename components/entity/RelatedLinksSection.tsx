import React from 'react';
import { Link } from 'react-router-dom';

type RelatedItem = {
  id: string;
  title: string;
  to?: string;
  subtitle?: string;
};

type RelatedGroup = {
  title: string;
  items: RelatedItem[];
  emptyLabel: string;
};

type RelatedLinksSectionProps = {
  title: string;
  groups: RelatedGroup[];
};

const RelatedLinksSection: React.FC<RelatedLinksSectionProps> = ({ title, groups }) => {
  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-gray-100 mb-3">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="text-sm font-semibold text-gray-200 mb-2">{group.title}</div>
            {group.items.length === 0 ? (
              <p className="text-xs text-gray-500">{group.emptyLabel}</p>
            ) : (
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.id} className="text-sm">
                    {item.to ? (
                      <Link
                        to={item.to}
                        className="text-gray-100 hover:text-red-200 transition-colors"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="text-gray-100">{item.title}</span>
                    )}
                    {item.subtitle && (
                      <div className="text-xs text-gray-400">{item.subtitle}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default RelatedLinksSection;
