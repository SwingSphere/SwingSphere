import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/appStore';

type TimeLensModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const TimeLensModal: React.FC<TimeLensModalProps> = ({ isOpen, onClose }) => {
  const { timeLens, setTimeLens, clearTimeLens } = useAppStore();
  const [date, setDate] = useState('');
  const [sliderDays, setSliderDays] = useState(7);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const toISODate = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const addDays = (value: Date, days: number) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  };

  const parseISODate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const startOfToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const getSliderRange = (offset: number) => {
    const center = addDays(startOfToday(), offset);
    const start = addDays(center, -1);
    const end = addDays(center, 1);
    return { center, start, end };
  };

  const getCenterOffsetFromRange = (startValue: string, endValue: string) => {
    if (!startValue || !endValue) return 0;
    const startDate = parseISODate(startValue);
    const center = addDays(startDate, 1);
    const diffMs = center.getTime() - startOfToday().getTime();
    return Math.max(0, Math.min(30, Math.round(diffMs / MS_PER_DAY)));
  };

  useEffect(() => {
    if (!isOpen) return;
    if (timeLens.mode === 'date') {
      setDate(timeLens.date);
      setSliderDays(7);
      return;
    }
    if (timeLens.mode === 'range') {
      setDate('');
      setSliderDays(getCenterOffsetFromRange(timeLens.start, timeLens.end));
      return;
    }
    setDate('');
    setSliderDays(7);
  }, [isOpen, timeLens]);

  if (!isOpen) return null;

  const handleClear = () => {
    clearTimeLens();
    onClose();
  };

  const handlePickDay = () => {
    const input = dateInputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
    } else {
      input.focus();
    }
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextDate = event.target.value;
    if (!nextDate) return;
    setDate(nextDate);
    setTimeLens({ mode: 'date', date: nextDate });
    onClose();
  };

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextDays = Number(event.target.value);
    setSliderDays(nextDays);
    const range = getSliderRange(nextDays);
    setTimeLens({
      mode: 'range',
      start: toISODate(range.start),
      end: toISODate(range.end),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-20">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Close time lens"
      />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-gray-800 bg-[#0b0b0b] shadow-2xl">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Time Lens</h2>
        </div>

        <div className="px-6 pt-5 space-y-4">
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Pick a Day</p>
                <p className="text-xs text-gray-400">One-off nights and special occasions.</p>
              </div>
              <button
                type="button"
                onClick={handlePickDay}
                className="rounded-full border border-gray-700 bg-black/60 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
              >
                Pick a Day
              </button>
            </div>
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={handleDateChange}
              className="absolute opacity-0 pointer-events-none"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Time Scrubber</p>
              <span className="text-xs text-gray-400">Now to 30 days</span>
            </div>
            <div className="mt-3 text-sm text-gray-200">
              {(() => {
                const range = getSliderRange(sliderDays);
                return `${DATE_FORMATTER.format(range.start)} - ${DATE_FORMATTER.format(range.end)}`;
              })()}
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
              <span>Now</span>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={sliderDays}
                onChange={handleSliderChange}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gray-700/60 accent-red-500"
              />
              <span>30 days</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-5 border-t border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {timeLens.mode !== 'none' && (
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-gray-400 hover:text-white"
              >
                Clear Time Lens
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-gray-700 text-gray-300 hover:border-gray-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TimeLensModal;
