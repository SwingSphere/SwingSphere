import React from 'react';

type EntityPageShellProps = {
  hero: React.ReactNode;
  main: React.ReactNode;
  aside?: React.ReactNode;
};

const EntityPageShell: React.FC<EntityPageShellProps> = ({ hero, main, aside }) => {
  const mainClass = aside ? 'lg:col-span-2' : 'lg:col-span-3';
  return (
    <main className="flex-grow overflow-y-auto no-scrollbar">
      <div className="max-w-6xl mx-auto px-4 pb-20">
        {hero}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className={`${mainClass} space-y-6`}>
            {main}
          </div>
          {aside ? (
            <aside className="space-y-6">
              {aside}
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default EntityPageShell;
