import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import TimeLensModal from './TimeLensModal';
import { getTimeLensSummary } from './timeLensSummary';

const PRESETS = [
  { id: 'today', label: 'Tonight' },
  { id: 'weekend', label: 'This Weekend' },
] as const;

const TimeLensBar: React.FC = () => {
  const { timeLens, setTimeLens, clearTimeLens } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isPresetActive = timeLens.mode === 'soon';
  const summaryLabel = getTimeLensSummary(timeLens);
  const showSummaryChip = timeLens.mode === 'date' || timeLens.mode === 'range';

  return (
    <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 pointer-events-none">
      <div className="flex flex-wrap items-center justify-center gap-2 pointer-events-auto">
        {PRESETS.map((preset) => {
          const isActive = isPresetActive && timeLens.preset === preset.id;
          if (isActive) {
            return (
              <div
                key={preset.id}
                className="flex items-center rounded-full border border-red-500 bg-red-600/80 text-white"
              >
                <button
                  type="button"
                  onClick={() => setTimeLens({ mode: 'soon', preset: preset.id })}
                  className="px-4 py-2 text-sm font-semibold"
                >
                  {preset.label}
                </button>
                <button
                  type="button"
                  onClick={clearTimeLens}
                  className="px-3 py-2 text-sm font-semibold text-white/80 hover:text-white"
                  aria-label="Clear time lens"
                >
                  x
                </button>
              </div>
            );
          }

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setTimeLens({ mode: 'soon', preset: preset.id })}
              className="rounded-full border border-gray-700 bg-black/50 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
            >
              {preset.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-full border border-gray-700 bg-black/60 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
        >
          Pick a Day
        </button>

        {/* Summary chip only appears for non-preset lenses and reopens the modal. */}
        {showSummaryChip && (
          <div className="flex items-center rounded-full border border-red-500 bg-red-600/80 text-white">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 text-sm font-semibold"
            >
              {summaryLabel}
            </button>
            <button
              type="button"
              onClick={clearTimeLens}
              className="px-3 py-2 text-sm font-semibold text-white/80 hover:text-white"
              aria-label="Clear time lens"
            >
              x
            </button>
          </div>
        )}
      </div>

      <TimeLensModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

export default TimeLensBar;
