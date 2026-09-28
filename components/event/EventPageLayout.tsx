import React from 'react';

type EventPageLayoutProps = {
  contextNav?: React.ReactNode;
  hero: React.ReactNode;
  mobileTop: React.ReactNode;
  main: React.ReactNode;
  rail: React.ReactNode;
};

const EventPageLayout: React.FC<EventPageLayoutProps> = ({ contextNav, hero, mobileTop, main, rail }) => {
  return (
    <main className="ss-detail-page flex-grow overflow-y-auto no-scrollbar">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-20">
        {contextNav}
        {hero}
        <div className="mt-6 space-y-4 lg:hidden">{mobileTop}</div>
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-8">{main}</section>
          <aside className="hidden space-y-6 lg:sticky lg:top-24 lg:block lg:self-start">{rail}</aside>
        </div>
      </div>
    </main>
  );
};

export default EventPageLayout;
