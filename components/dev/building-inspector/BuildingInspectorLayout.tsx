import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight } from 'lucide-react';
import type { BuildingInspectorLayoutState } from './types';

const STORAGE_KEY = 'swingsphere:building-inspector:layout';

const DEFAULT_LEFT_WIDTH = 340;
const MIN_LEFT_WIDTH = 280;
const MAX_LEFT_WIDTH = 460;

const DEFAULT_RIGHT_WIDTH = 390;
const MIN_RIGHT_WIDTH = 340;
const MAX_RIGHT_WIDTH = 520;

const MIN_CENTER_WIDTH = 380;

interface BuildingInspectorLayoutProps {
  leftPane: React.ReactNode;
  centerPane: React.ReactNode;
  rightPane: React.ReactNode;
}

export const BuildingInspectorLayout: React.FC<BuildingInspectorLayoutProps> = ({
  leftPane,
  centerPane,
  rightPane,
}) => {
  const [layout, setLayout] = useState<BuildingInspectorLayoutState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          leftWidth: typeof parsed.leftWidth === 'number'
            ? Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, parsed.leftWidth))
            : DEFAULT_LEFT_WIDTH,
          rightWidth: typeof parsed.rightWidth === 'number'
            ? Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, parsed.rightWidth))
            : DEFAULT_RIGHT_WIDTH,
          isLeftCollapsed: Boolean(parsed.isLeftCollapsed),
          isRightCollapsed: Boolean(parsed.isRightCollapsed),
        };
      }
    } catch {
      // ignore JSON parse errors
    }
    return {
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      isLeftCollapsed: false,
      isRightCollapsed: false,
    };
  });

  const [activeSplitter, setActiveSplitter] = useState<'left' | 'right' | null>(null);

  // Persist layout to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // ignore write errors
    }
  }, [layout]);

  // Dragging splitters
  const startDrag = useCallback((splitter: 'left' | 'right', startEvent: React.PointerEvent) => {
    startEvent.preventDefault();
    setActiveSplitter(splitter);

    const startX = startEvent.clientX;
    const startLeftWidth = layout.leftWidth;
    const startRightWidth = layout.rightWidth;

    const handlePointerMove = (e: PointerEvent) => {
      const delta = e.clientX - startX;
      const windowWidth = window.innerWidth;

      setLayout((prev) => {
        if (splitter === 'left') {
          const maxAllowed = Math.min(
            MAX_LEFT_WIDTH,
            windowWidth - (prev.isRightCollapsed ? 0 : prev.rightWidth) - MIN_CENTER_WIDTH
          );
          const nextWidth = Math.max(MIN_LEFT_WIDTH, Math.min(maxAllowed, startLeftWidth + delta));
          return { ...prev, leftWidth: nextWidth, isLeftCollapsed: false };
        } else {
          const maxAllowed = Math.min(
            MAX_RIGHT_WIDTH,
            windowWidth - (prev.isLeftCollapsed ? 0 : prev.leftWidth) - MIN_CENTER_WIDTH
          );
          const nextWidth = Math.max(MIN_RIGHT_WIDTH, Math.min(maxAllowed, startRightWidth - delta));
          return { ...prev, rightWidth: nextWidth, isRightCollapsed: false };
        }
      });
    };

    const handlePointerUp = () => {
      setActiveSplitter(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [layout.leftWidth, layout.rightWidth]);

  const handleLeftDoubleClick = useCallback(() => {
    setLayout((prev) => ({ ...prev, leftWidth: DEFAULT_LEFT_WIDTH, isLeftCollapsed: false }));
  }, []);

  const handleRightDoubleClick = useCallback(() => {
    setLayout((prev) => ({ ...prev, rightWidth: DEFAULT_RIGHT_WIDTH, isRightCollapsed: false }));
  }, []);

  const toggleLeftCollapse = useCallback(() => {
    setLayout((prev) => ({ ...prev, isLeftCollapsed: !prev.isLeftCollapsed }));
  }, []);

  const toggleRightCollapse = useCallback(() => {
    setLayout((prev) => ({ ...prev, isRightCollapsed: !prev.isRightCollapsed }));
  }, []);

  return (
    <div
      className={`relative flex h-full w-full overflow-hidden select-none bg-[#050608] ${
        activeSplitter ? 'cursor-col-resize' : ''
      }`}
    >
      {/* LEFT PANE: Place Browser */}
      <div
        style={{
          width: layout.isLeftCollapsed ? 0 : layout.leftWidth,
          minWidth: layout.isLeftCollapsed ? 0 : MIN_LEFT_WIDTH,
          maxWidth: layout.isLeftCollapsed ? 0 : MAX_LEFT_WIDTH,
        }}
        className={`relative flex h-full flex-col border-r border-white/10 bg-[#08090d]/98 shadow-2xl ${
          activeSplitter ? 'transition-none' : 'transition-[width] duration-150 ease-out'
        } select-text ${
          layout.isLeftCollapsed ? 'overflow-hidden border-r-0' : 'overflow-hidden'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {leftPane}
        </div>
      </div>

      {/* LEFT SPLITTER */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Left Place Browser"
        title="Drag to resize · Double-click to reset width"
        onPointerDown={(e) => startDrag('left', e)}
        onDoubleClick={handleLeftDoubleClick}
        className={`group relative z-30 flex w-2.5 shrink-0 cursor-col-resize items-center justify-center transition-colors ${
          activeSplitter === 'left'
            ? 'bg-red-500/30'
            : 'bg-transparent hover:bg-white/10'
        }`}
      >
        <div
          className={`h-12 w-0.5 rounded-full transition-colors ${
            activeSplitter === 'left' ? 'bg-red-400' : 'bg-white/20 group-hover:bg-white/50'
          }`}
        />
        {/* Quick collapse/expand button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleLeftCollapse();
          }}
          title={layout.isLeftCollapsed ? 'Expand Place Browser' : 'Collapse Place Browser'}
          className="absolute top-4 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-[#0a0b0f] text-zinc-400 opacity-0 shadow-lg transition-opacity hover:text-white group-hover:opacity-100"
        >
          {layout.isLeftCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* CENTER PANE: Spatial Workspace */}
      <div className="relative flex min-w-[360px] flex-1 flex-col overflow-hidden bg-[#050608]">
        {/* Toggle buttons overlay if collapsed */}
        {layout.isLeftCollapsed && (
          <button
            type="button"
            onClick={toggleLeftCollapse}
            title="Expand Place Browser"
            className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a0b0f]/90 px-2.5 py-1.5 text-xs text-zinc-300 shadow-xl backdrop-blur-md hover:bg-white/10 hover:text-white"
          >
            <PanelLeft size={14} />
            <span>Places</span>
          </button>
        )}
        {layout.isRightCollapsed && (
          <button
            type="button"
            onClick={toggleRightCollapse}
            title="Expand Inspector"
            className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a0b0f]/90 px-2.5 py-1.5 text-xs text-zinc-300 shadow-xl backdrop-blur-md hover:bg-white/10 hover:text-white"
          >
            <span>Inspector</span>
            <PanelRight size={14} />
          </button>
        )}

        {centerPane}
      </div>

      {/* RIGHT SPLITTER */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Right Inspector"
        title="Drag to resize · Double-click to reset width"
        onPointerDown={(e) => startDrag('right', e)}
        onDoubleClick={handleRightDoubleClick}
        className={`group relative z-30 flex w-2.5 shrink-0 cursor-col-resize items-center justify-center transition-colors ${
          activeSplitter === 'right'
            ? 'bg-red-500/30'
            : 'bg-transparent hover:bg-white/10'
        }`}
      >
        <div
          className={`h-12 w-0.5 rounded-full transition-colors ${
            activeSplitter === 'right' ? 'bg-red-400' : 'bg-white/20 group-hover:bg-white/50'
          }`}
        />
        {/* Quick collapse/expand button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleRightCollapse();
          }}
          title={layout.isRightCollapsed ? 'Expand Inspector' : 'Collapse Inspector'}
          className="absolute top-4 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-[#0a0b0f] text-zinc-400 opacity-0 shadow-lg transition-opacity hover:text-white group-hover:opacity-100"
        >
          {layout.isRightCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {/* RIGHT PANE: Inspector & Actions */}
      <div
        style={{
          width: layout.isRightCollapsed ? 0 : layout.rightWidth,
          minWidth: layout.isRightCollapsed ? 0 : MIN_RIGHT_WIDTH,
          maxWidth: layout.isRightCollapsed ? 0 : MAX_RIGHT_WIDTH,
        }}
        className={`relative flex h-full flex-col border-l border-white/10 bg-[#08090d]/98 shadow-2xl ${
          activeSplitter ? 'transition-none' : 'transition-[width] duration-150 ease-out'
        } select-text ${
          layout.isRightCollapsed ? 'overflow-hidden border-l-0' : 'overflow-hidden'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {rightPane}
        </div>
      </div>
    </div>
  );
};

export default BuildingInspectorLayout;
