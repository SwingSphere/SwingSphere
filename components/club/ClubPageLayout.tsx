import React from 'react';

type ClubPageLayoutProps = {
  hero: React.ReactNode;
  main: React.ReactNode;
  rail: React.ReactNode;
};

const ClubPageLayout: React.FC<ClubPageLayoutProps> = ({ hero, main, rail }) => {
  return (
    <main className="ss-detail-page flex-grow overflow-y-auto no-scrollbar">
      <div className="mx-auto max-w-6xl px-4 pb-20">
        {hero}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-8">
            {main}
          </section>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {rail}
          </aside>
        </div>
      </div>
    </main>
  );
};

export default ClubPageLayout;
