import React from 'react';
import { LockKeyhole, Sparkles } from 'lucide-react';
import LandingHeroGlobe from './LandingHeroGlobe';

const ComingSoonPage: React.FC = () => (
    <main data-page="coming-soon" className="ss-bg-geometric relative min-h-screen overflow-x-clip bg-[#050506] text-white">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(220,38,38,0.18),transparent_38%),radial-gradient(circle_at_16%_78%,rgba(255,255,255,0.055),transparent_30%)]" />

    <div className="relative z-20 mx-auto flex w-full max-w-[1560px] items-center px-5 pt-12 sm:px-8 sm:pt-16 lg:min-h-screen lg:px-12 lg:py-12 lg:pr-[52vw] xl:px-16 xl:pr-[54vw]">
      <section className="mx-auto w-full max-w-xl text-center lg:mx-0 lg:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-gray-300 backdrop-blur-xl">
          <Sparkles size={14} className="text-red-300" />
          Private preview in progress
        </div>

        <div className="mt-7 flex items-center justify-center gap-2 sm:gap-4 lg:justify-start lg:gap-5">
          <img
            src="/swingsphere-logo.png"
            alt=""
            aria-hidden="true"
            className="h-[clamp(2.5rem,11vw,3rem)] w-[clamp(2.5rem,11vw,3rem)] shrink-0 object-contain drop-shadow-[0_0_18px_rgba(239,68,68,0.28)] sm:h-16 sm:w-16 lg:h-20 lg:w-20"
          />
          <h1 className="text-[clamp(1.9rem,10vw,2.55rem)] font-black tracking-[-0.06em] sm:text-7xl lg:text-[5.6rem] lg:leading-none">
            <span className="text-red-500">SWING</span><span className="text-white">SPHERE</span>
          </h1>
        </div>

        <p className="mt-7 max-w-xl text-xl font-semibold leading-8 text-gray-100 sm:text-2xl sm:leading-9">
          A more immersive way to discover clubs, events, venues, and communities is coming into view.
        </p>
        <p className="mt-5 max-w-lg text-sm leading-7 text-gray-400 sm:text-base">
          We are quietly building and testing a premium nightlife discovery experience before opening the doors more widely.
        </p>

        <div className="mt-9 inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-gray-400 backdrop-blur-xl">
          <LockKeyhole size={16} className="text-gray-500" />
          Full preview access is invitation-only.
        </div>

        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">Coming soon</p>
      </section>
    </div>

    <section
      className="relative z-10 -mt-4 h-[70svh] min-h-[520px] w-full overflow-visible sm:h-[76svh] sm:min-h-[640px] lg:absolute lg:inset-y-0 lg:left-0 lg:right-[-4vw] lg:mt-0 lg:h-auto lg:min-h-0 lg:w-auto xl:right-[-2vw]"
      aria-label="SwingSphere globe preview"
    >
      <div className="pointer-events-none absolute inset-x-[8%] bottom-[3%] h-[24%] rounded-[50%] bg-red-500/12 blur-[100px] lg:inset-x-[18%]" />
      <div className="absolute inset-x-[-2%] inset-y-[-8%] sm:inset-y-[-10%] lg:inset-0">
        <LandingHeroGlobe autoplay initialDelayMs={5200} idleDurationMs={7500} focusDurationMs={5200} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,6,0.95)_0%,transparent_16%,transparent_82%,rgba(5,5,6,0.75)_100%)] lg:bg-[linear-gradient(90deg,rgba(5,5,6,1)_0%,rgba(5,5,6,0.9)_14%,rgba(5,5,6,0.34)_34%,transparent_58%)]" />
    </section>
  </main>
);

export default ComingSoonPage;
