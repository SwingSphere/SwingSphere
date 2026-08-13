import React from 'react';
import { Link } from 'react-router-dom';

type NextUpItem = {
  id: string;
  title: string;
  subtitle?: string;
  to?: string;
};

type NextUpSectionProps = {
  title: string;
  items: NextUpItem[];
  emptyLabel?: string;
};

const NextUpSection: React.FC<NextUpSectionProps> = ({
  title,
  items,
  emptyLabel = 'Nothing scheduled yet.',
}) => {
  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-gray-100 mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
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
                <div className="text-xs text-gray-400 mt-1">{item.subtitle}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NextUpSection;
