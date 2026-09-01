import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Smartphone } from 'lucide-react';

const DEVICE_WIDTH = 390;
const DEVICE_HEIGHT = 844;
const FRAME_GUTTER = 48;
const TOOLBAR_HEIGHT = 92;

const MobileExplorerWorkbenchPage: React.FC = () => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateScale = () => {
      const availableWidth = Math.max(1, stage.clientWidth - FRAME_GUTTER);
      const availableHeight = Math.max(1, stage.clientHeight - TOOLBAR_HEIGHT);
      setScale(Math.min(1, availableWidth / DEVICE_WIDTH, availableHeight / DEVICE_HEIGHT));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#030407] text-gray-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(255,54,84,0.12),transparent_36%),linear-gradient(180deg,#080a0f_0%,#030407_72%)]" />

      <header className="relative z-10 flex h-[76px] items-center justify-between gap-4 border-b border-white/[0.07] bg-black/25 px-5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04]">
            <Smartphone className="h-5 w-5 text-red-300" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">SwingSphere Mobile Workbench</h1>
            <p className="mt-0.5 text-[11px] text-gray-500">iPhone 12 Pro · 390 × 844 CSS pixels</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setFrameKey((current) => current + 1)}
            className="ss-glass ss-glass--liquid ss-glass--interactive inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-gray-200"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Reset preview</span>
          </button>
          <a
            href="/dev/mobile-preview/"
            target="_blank"
            rel="noreferrer"
            className="ss-glass ss-glass--liquid ss-glass--interactive inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-gray-200"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Open directly</span>
          </a>
        </div>
      </header>

      <section ref={stageRef} className="relative z-10 flex h-[calc(100vh-76px)] items-center justify-center overflow-hidden p-3 sm:p-6">
        <div
          className="relative shrink-0 origin-center"
          style={{
            width: DEVICE_WIDTH,
            height: DEVICE_HEIGHT,
            transform: `scale(${scale})`,
          }}
        >
          <div className="absolute -inset-[10px] rounded-[42px] border border-white/[0.16] bg-[#111318] shadow-[0_40px_120px_rgba(0,0,0,0.72),0_0_0_1px_rgba(0,0,0,0.9)]" />
          <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[112px] -translate-x-1/2 rounded-full bg-black shadow-[0_1px_0_rgba(255,255,255,0.05)]" />
          <iframe
            key={frameKey}
            title="SwingSphere iPhone 12 Pro mobile preview"
            src="/dev/mobile-preview/"
            className="relative h-[844px] w-[390px] overflow-hidden rounded-[32px] border-0 bg-[#030407]"
          />
        </div>
      </section>
    </main>
  );
};

export default MobileExplorerWorkbenchPage;
