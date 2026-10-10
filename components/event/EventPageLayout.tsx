import React from 'react';
import EntityLowPolyBackground from '../living-background/EntityLowPolyBackground';

type EventPageLayoutProps = {
  contextNav?: React.ReactNode;
  hero: React.ReactNode;
  mobileTop: React.ReactNode;
  main: React.ReactNode;
  rail: React.ReactNode;
  backgroundImageUrl?: string | null;
};

const EventPageLayout: React.FC<EventPageLayoutProps> = ({ contextNav, hero, mobileTop, main, rail, backgroundImageUrl }) => {
  return (
    <main className="ss-detail-page flex-grow overflow-y-auto no-scrollbar">
      <div className="relative isolate min-h-full">
        <EntityLowPolyBackground imageUrl={backgroundImageUrl} />
        <div className="relative z-10 mx-auto max-w-6xl px-4 pt-4 pb-20">
        {contextNav}
        {hero}
        {mobileTop ? <div className="ss-event-mobile-only-cards mt-6 space-y-4">{mobileTop}</div> : null}
        <div className="ss-event-layout-grid mt-8">
          <section className="space-y-8">{main}</section>
          <aside className="ss-event-desktop-rail space-y-6">{rail}</aside>
        </div>
        </div>
      </div>
    </main>
  );
};

export default EventPageLayout;
