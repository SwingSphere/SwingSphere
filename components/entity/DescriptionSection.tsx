import React from 'react';

type DescriptionSectionProps = {
  title: string;
  content?: string;
  emptyLabel: string;
};

const DescriptionSection: React.FC<DescriptionSectionProps> = ({
  title,
  content,
  emptyLabel,
}) => {
  const hasContent = Boolean(content && content.trim().length > 0);

  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-gray-100 mb-2">{title}</h2>
      {hasContent ? (
        <p className="text-sm text-gray-300 whitespace-pre-line">{content}</p>
      ) : (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      )}
    </section>
  );
};

export default DescriptionSection;
