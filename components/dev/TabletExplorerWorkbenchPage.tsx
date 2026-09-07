import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Tablet } from 'lucide-react';

type Orientation = 'portrait' | 'landscape';

const PORTRAIT = { width: 768, height: 1024 } as const;
const LANDSCAPE = { width: 1024, height: 768 } as const;
const FRAME_GUTTER = 56;
const TOOLBAR_HEIGHT = 104;

const TabletExplorerWorkbenchPage: React.FC = () => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [scale, setScale] = useState(1);
  const device = orientation === 'portrait' ? PORTRAIT : LANDSCAPE;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateScale = () => {
      const availableWidth = Math.max(1, stage.clientWidth - FRAME_GUTTER);
      const availableHeight = Math.max(1, stage.clientHeight - TOOLBAR_HEIGHT);
      setScale(Math.min(1, availableWidth / device.width, availableHeight / device.height));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [device.height, device.width]);

  const frameLabel = useMemo(
    () => `iPad 8 · ${device.width} × ${device.height} CSS pixels`,
    [device.height, device.width],
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#030407] text-gray-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,54,84,0.11),transparent_34%),linear-gradient(180deg,#080a0f_0%,#030407_72%)]" />

      <header className="relative z-10 flex h-[76px] items-center justify-between gap-4 border-b border-white/[0.07] bg-black/25 px-5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04]">
            <Tablet className="h-5 w-5 text-red-300" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">SwingSphere Tablet Workbench</h1>
            <p className="mt-0.5 text-[11px] text-gray-500">{frameLabel}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="ss-glass ss-glass--liquid hidden h-10 overflow-hidden rounded-xl sm:flex" aria-label="Tablet orientation">
            {(['portrait', 'landscape'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOrientation(value)}
                className={`px-3 text-xs font-semibold capitalize ${orientation === value ? 'bg-white/[0.10] text-white' : 'text-gray-400'}`}
                aria-pressed={orientation === value}
              >
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFrameKey((current) => current + 1)}
            className="ss-glass ss-glass--liquid ss-glass--interactive inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-gray-200"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Reset preview</span>
          </button>
          <a
            href="/tablet/"
            target="_blank"
            rel="noreferrer"
            className="ss-glass ss-glass--liquid ss-glass--interactive inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-gray-200"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Open directly</span>
          </a>
        </div>
      </header>

      <section ref={stageRef} className="relative z-10 flex h-[calc(100vh-76px)] items-center justify-center overflow-hidden p-3 sm:p-6">
        <div
          className="relative shrink-0 origin-center transition-[width,height,transform] duration-300 ease-out"
          style={{
            width: device.width,
            height: device.height,
            transform: `scale(${scale})`,
          }}
        >
          <div className="absolute -inset-[12px] rounded-[34px] border border-white/[0.16] bg-[#111318] shadow-[0_40px_120px_rgba(0,0,0,0.72),0_0_0_1px_rgba(0,0,0,0.9)]" />
          <div className="absolute left-1/2 top-2 z-20 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/[0.06]" />
          <iframe
            key={`${frameKey}-${orientation}`}
            title={`SwingSphere iPad 8 ${orientation} tablet preview`}
            src="/tablet/"
            className="relative overflow-hidden rounded-[24px] border-0 bg-[#030407]"
            style={{ width: device.width, height: device.height }}
          />
        </div>
      </section>
    </main>
  );
};

export default TabletExplorerWorkbenchPage;
