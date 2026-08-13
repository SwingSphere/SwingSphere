import React from 'react';

type ContextItem = {
  label: string;
  value: string;
  detail?: string;
};

type ContextSectionProps = {
  title: string;
  items: ContextItem[];
  emptyLabel: string;
};

const ContextSection: React.FC<ContextSectionProps> = ({ title, items, emptyLabel }) => {
  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-gray-100 mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-2 text-sm text-gray-200">
          {items.map((item) => (
            <div key={item.label}>
              <div className="text-xs uppercase tracking-wide text-gray-500">{item.label}</div>
              <div className="text-sm text-gray-200">{item.value}</div>
              {item.detail && (
                <div className="text-xs text-gray-400 mt-1">{item.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ContextSection;
