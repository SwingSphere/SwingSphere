import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Palmtree, Ship } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import type { CruiseSailingData, CruiseSeriesData, ResortData } from '../../types';
import { DetailContextNav } from '../navigation/DetailContextNav';

const approved = <T extends { status: string }>(items: T[]) => items.filter((item) => item.status === 'approved' || item.status === 'active');

const TravelIndexPage: React.FC = () => {
  const [resorts, setResorts] = useState<ResortData[]>([]);
  const [series, setSeries] = useState<CruiseSeriesData[]>([]);
  const [sailings, setSailings] = useState<CruiseSailingData[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([api.getResorts(), api.getCruiseSeries(), api.getCruiseSailings()])
      .then(([resortRows, seriesRows, sailingRows]) => {
        if (!active) return;
        setResorts(approved(resortRows));
        setSeries(approved(seriesRows));
        setSailings(approved(sailingRows));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const nextSailingBySeries = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, CruiseSailingData>();
    [...sailings]
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .forEach((sailing) => {
        if (!map.has(sailing.cruiseSeriesId) && Date.parse(sailing.endsAt) >= now) map.set(sailing.cruiseSeriesId, sailing);
      });
    return map;
  }, [sailings]);

  return (
    <main className="flex-grow overflow-y-auto no-scrollbar">
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-4 sm:px-6">
        <DetailContextNav
          backTo="/discover"
          breadcrumbs={[{ label: 'Directory', href: '/discover' }, { label: 'Travel' }]}
        />

        <section className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#070a0f] px-6 py-10 sm:px-10 sm:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,rgba(139,92,246,0.22),transparent_28%),radial-gradient(circle_at_16%_88%,rgba(34,197,94,0.18),transparent_30%)]" />
          <div className="relative max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-gray-400">SwingSphere Travel</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">Stay somewhere unforgettable. Sail somewhere unexpected.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-300">Lifestyle resorts and destination cruises now live alongside clubs, events, and hosts—built for multi-day experiences instead of single-night plans.</p>
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200"><Palmtree className="h-5 w-5" /></span>
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">Stay</p><h2 className="text-2xl font-black text-white">Resorts</h2></div>
              </div>
              <span className="text-xs font-semibold text-gray-500">{resorts.length} destination{resorts.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {resorts.map((resort) => (
                <Link key={resort.id} to={`/resorts/${resort.slug}`} className="group relative min-h-[280px] overflow-hidden rounded-[26px] border border-emerald-300/15 bg-[#09110d] shadow-xl shadow-black/25">
                  {resort.headerImageUrl ? <img src={resort.headerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.03]" /> : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/48 to-black/10" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100"><Palmtree className="h-3 w-3" /> Resort</span>
                    <h3 className="mt-3 text-xl font-black text-white">{resort.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-300"><MapPin className="h-3.5 w-3.5 text-emerald-300" /> {[resort.geopoint.address.city, resort.geopoint.address.country].filter(Boolean).join(', ')}</p>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-300">{resort.descriptionShort}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-300/25 bg-violet-400/10 text-violet-200"><Ship className="h-5 w-5" /></span>
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/70">Sail</p><h2 className="text-2xl font-black text-white">Cruises</h2></div>
              </div>
              <span className="text-xs font-semibold text-gray-500">{series.length} cruise brand{series.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {series.map((cruise) => {
                const sailing = nextSailingBySeries.get(cruise.id);
                return (
                  <Link key={cruise.id} to={`/cruises/${cruise.slug}`} className="group relative min-h-[280px] overflow-hidden rounded-[26px] border border-violet-300/15 bg-[#0d0914] shadow-xl shadow-black/25">
                    {(sailing?.headerImageUrl ?? cruise.headerImageUrl) ? <img src={sailing?.headerImageUrl ?? cruise.headerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.03]" /> : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/48 to-black/10" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-400/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-100"><Ship className="h-3 w-3" /> Cruise</span>
                      <h3 className="mt-3 text-xl font-black text-white">{cruise.name}</h3>
                      {sailing ? <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-300"><CalendarDays className="h-3.5 w-3.5 text-violet-300" /> {new Date(sailing.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {sailing.departurePort.city ?? sailing.departurePort.portName}</p> : null}
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-300">{cruise.descriptionShort}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-[26px] border border-white/[0.08] bg-white/[0.025] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Explore spatially</p><h2 className="mt-1 text-xl font-black text-white">Travel is now on the globe.</h2><p className="mt-2 text-sm leading-6 text-gray-400">Green palm markers identify resorts. Purple ship markers sit just offshore from the departure port for the next relevant sailing.</p></div>
          <Link to="/globe" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-bold text-white sm:mt-0">Open globe <ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </main>
  );
};

export default TravelIndexPage;
