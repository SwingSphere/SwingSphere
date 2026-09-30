import React from 'react';
import EntityLowPolyBackground from '../living-background/EntityLowPolyBackground';

type HostPageLayoutProps = {
  contextNav?: React.ReactNode;
  hero: React.ReactNode;
  main: React.ReactNode;
  rail: React.ReactNode;
  backgroundImageUrl?: string | null;
};

const HostPageLayout: React.FC<HostPageLayoutProps> = ({ contextNav, hero, main, rail, backgroundImageUrl }) => {
  return (
    <main className="ss-detail-page flex-grow overflow-y-auto no-scrollbar">
      <div className="relative isolate min-h-full">
        <EntityLowPolyBackground imageUrl={backgroundImageUrl} />
        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-4 pb-20 sm:px-6">
        {contextNav}
        {hero}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-6">
            {main}
          </section>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {rail}
          </aside>
        </div>
        </div>
      </div>
    </main>
  );
};

export default HostPageLayout;
