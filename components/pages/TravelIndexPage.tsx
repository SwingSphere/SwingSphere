import React from 'react';
import { ArrowRight, Building2, Ship } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cruiseSeries, resorts } from '../../data/travelExperiences';

const TravelIndexPage: React.FC = () => (
  <main className="flex-grow overflow-y-auto no-scrollbar">
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10">
      <section className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#070a0f] p-7 sm:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(61,190,221,0.18),transparent_28%),radial-gradient(circle_at_20%_85%,rgba(119,77,255,0.15),transparent_30%)]" />
        <div className="relative">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/70">Travel</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.035em] text-white sm:text-6xl">Stay longer. Go farther.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-gray-300">Discover destination resorts and recurring cruises without forcing multi-day travel experiences into ordinary club or event pages.</p>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="ss-glass ss-glass--liquid overflow-hidden rounded-[26px] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-3 text-violet-100"><Building2 className="h-6 w-6" /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Permanent destinations</p><h2 className="text-2xl font-black text-white">Resorts</h2></div>
          </div>
          <div className="mt-5 space-y-3">
            {resorts.map((resort) => (
              <Link key={resort.id} to={`/resorts/${resort.slug}`} className="ss-glass ss-glass--interactive flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="min-w-0 flex-1"><div className="font-bold text-white">{resort.name}</div><div className="mt-1 text-xs text-gray-400">{resort.geopoint.address.city}, {resort.geopoint.address.region} · {resort.accommodationSummary}</div></div>
                <ArrowRight className="h-5 w-5 text-violet-200" />
              </Link>
            ))}
          </div>
        </section>

        <section className="ss-glass ss-glass--liquid overflow-hidden rounded-[26px] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><Ship className="h-6 w-6" /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Recurring sailings</p><h2 className="text-2xl font-black text-white">Cruises</h2></div>
          </div>
          <div className="mt-5 space-y-3">
            {cruiseSeries.map((series) => (
              <Link key={series.id} to={`/cruises/${series.slug}`} className="ss-glass ss-glass--interactive flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="min-w-0 flex-1"><div className="font-bold text-white">{series.name}</div><div className="mt-1 text-xs text-gray-400">{series.audienceLabel} · Multiple sailings</div></div>
                <ArrowRight className="h-5 w-5 text-cyan-200" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  </main>
);

export default TravelIndexPage;
