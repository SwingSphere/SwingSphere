import React, { useId } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Calendar, Minus } from 'lucide-react';
import {
  computePercentageChange,
  type AnalyticsGranularity,
  type AnalyticsRangePreset,
  type DeltaResult,
  type TrendPoint,
} from '../../../lib/analytics/trendSeries';
import type { AnalyticsContentType, OutboundCategoryKey } from '../../../lib/analytics/routeEntityResolver';

const formatNumber = (value?: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

export const DeltaBadge: React.FC<{
  current?: number;
  previous?: number;
  delta?: DeltaResult;
  suffix?: string;
}> = ({ current, previous, delta: deltaProp, suffix }) => {
  const delta = deltaProp ?? computePercentageChange(current ?? 0, previous ?? 0);

  const badgeTone =
    delta.direction === 'up'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : delta.direction === 'down'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : delta.direction === 'new'
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-slate-100 text-slate-600';

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-semibold tabular-nums ${badgeTone}`}
      >
        {delta.direction === 'up' ? (
          <ArrowUpRight size={12} />
        ) : delta.direction === 'down' ? (
          <ArrowDownRight size={12} />
        ) : (
          <Minus size={11} />
        )}
        {delta.formatted}
      </span>
      {suffix ? <span className="text-[11px] text-slate-500">{suffix}</span> : null}
    </span>
  );
};

export const EntityTypeBadge: React.FC<{ type?: AnalyticsContentType | string | null }> = ({ type }) => {
  const safeType = type || 'Other';
  const normalized = safeType.toLowerCase();
  const styles: Record<string, string> = {
    event: 'border-violet-200 bg-violet-50 text-violet-700',
    'event series': 'border-violet-200 bg-violet-50 text-violet-700',
    club: 'border-rose-200 bg-rose-50 text-rose-700',
    host: 'border-amber-200 bg-amber-50 text-amber-800',
    'host / promoter': 'border-amber-200 bg-amber-50 text-amber-800',
    resort: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    cruise: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    'cruise sailing': 'border-cyan-200 bg-cyan-50 text-cyan-700',
    'cruise series': 'border-cyan-200 bg-cyan-50 text-cyan-700',
    venue: 'border-blue-200 bg-blue-50 text-blue-700',
    globe: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    map: 'border-sky-200 bg-sky-50 text-sky-700',
    directory: 'border-slate-200 bg-slate-100 text-slate-700',
    home: 'border-slate-200 bg-slate-100 text-slate-700',
  };
  const cls = styles[normalized] || 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${cls}`}>
      {safeType}
    </span>
  );
};

export const DestinationCategoryBadge: React.FC<{
  categoryKey: OutboundCategoryKey;
  label: string;
  provider?: string | null;
}> = ({ categoryKey, label, provider }) => {
  const styles: Record<OutboundCategoryKey, string> = {
    ticket: 'border-violet-200 bg-violet-50 text-violet-700',
    website: 'border-blue-200 bg-blue-50 text-blue-700',
    social: 'border-pink-200 bg-pink-50 text-pink-700',
    rsvp: 'border-amber-200 bg-amber-50 text-amber-800',
    booking: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    directions: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    calendar: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    email: 'border-slate-200 bg-slate-100 text-slate-700',
    other: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${styles[categoryKey] || styles.other}`}
    >
      {provider && provider.toLowerCase() !== label.toLowerCase() && !provider.includes('.') ? (
        <>
          <span>{provider}</span>
          <span className="opacity-50">·</span>
          <span className="font-medium">{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
};

const RANGE_OPTIONS: Array<{ value: AnalyticsRangePreset; label: string }> = [
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '12m', label: '12M' },
  { value: 'all', label: 'All' },
];

type AnalyticsTrendChartProps = {
  title: string;
  subtitle: string;
  accentColor?: 'indigo' | 'blue';
  points: TrendPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
  showSecondaryLine?: boolean;
  primaryTotal: number;
  previousPrimaryTotal: number;
  secondaryTotal?: number;
  comparisonLabel: string;
  rangePreset: AnalyticsRangePreset;
  onSelectRangePreset: (preset: AnalyticsRangePreset) => void;
  granularity: AnalyticsGranularity;
  onSelectGranularity: (granularity: AnalyticsGranularity) => void;
  showComparison: boolean;
  onToggleComparison: (show: boolean) => void;
  from: string;
  to: string;
  onChangeCustomRange: (from: string, to: string) => void;
  onApplyCustomRange: () => void;
  headerRightExtra?: React.ReactNode;
};

export const AnalyticsTrendChart: React.FC<AnalyticsTrendChartProps> = ({
  title,
  subtitle,
  accentColor = 'indigo',
  points,
  primaryLabel,
  secondaryLabel,
  showSecondaryLine = true,
  primaryTotal,
  previousPrimaryTotal,
  secondaryTotal,
  comparisonLabel,
  rangePreset,
  onSelectRangePreset,
  granularity,
  onSelectGranularity,
  showComparison,
  onToggleComparison,
  from,
  to,
  onChangeCustomRange,
  onApplyCustomRange,
  headerRightExtra,
}) => {
  const gradientId = useId().replace(/:/g, '');
  const primaryStroke = accentColor === 'blue' ? '#2563eb' : '#4f46e5';
  const secondaryStroke = accentColor === 'blue' ? '#0ea5e9' : '#9333ea';
  const activePillClass =
    accentColor === 'blue'
      ? 'bg-blue-600 text-white shadow-xs'
      : 'bg-indigo-600 text-white shadow-xs';

  const availableGranularities: Array<{ value: AnalyticsGranularity; label: string }> =
    rangePreset === '24h'
      ? [
          { value: 'hourly', label: 'Hourly' },
          { value: 'daily', label: 'Daily' },
        ]
      : rangePreset === '12m' || rangePreset === 'all'
        ? [
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ]
        : [
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
          ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              {granularity}
            </span>
          </div>
          <p className="text-xs text-slate-500">{subtitle}</p>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pt-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {primaryLabel}
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-2.5">
                <span className="text-3xl font-black tracking-tight tabular-nums text-slate-950">
                  {formatNumber(primaryTotal)}
                </span>
                {rangePreset !== 'all' ? (
                  <DeltaBadge
                    current={primaryTotal}
                    previous={previousPrimaryTotal}
                    suffix={comparisonLabel}
                  />
                ) : null}
              </div>
            </div>

            {secondaryLabel !== undefined && secondaryTotal !== undefined ? (
              <div className="border-l border-slate-200 pl-5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {secondaryLabel}
                </div>
                <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums text-slate-800">
                  {formatNumber(secondaryTotal)}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              role="group"
              aria-label="Select analytics time range"
              className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1"
            >
              {RANGE_OPTIONS.map((option) => {
                const active = rangePreset === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSelectRangePreset(option.value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      active ? activePillClass : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onSelectRangePreset('custom')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  rangePreset === 'custom'
                    ? activePillClass
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Calendar size={12} />
                Custom
              </button>
            </div>
            {headerRightExtra}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1">
              <span className="px-1.5 text-[11px] font-medium text-slate-400">Interval:</span>
              {availableGranularities.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => onSelectGranularity(g.value)}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                    granularity === g.value
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {rangePreset !== 'all' ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 select-none hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={showComparison}
                  onChange={(e) => onToggleComparison(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                />
                Compare prior period
              </label>
            ) : null}
          </div>

          {rangePreset === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-slate-700">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => onChangeCustomRange(e.target.value, to)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-medium text-slate-700">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => onChangeCustomRange(from, e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                />
              </label>
              <button
                type="button"
                onClick={onApplyCustomRange}
                className="rounded-md bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-800"
              >
                Apply
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="h-[280px] w-full sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryStroke} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={primaryStroke} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as TrendPoint | undefined;
                  if (!point) return null;
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-xs">
                      <div className="font-bold text-slate-900">{point.fullLabel}</div>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-6">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: primaryStroke }}
                            />
                            {primaryLabel}
                          </span>
                          <span className="font-bold tabular-nums text-slate-900">
                            {formatNumber(point.primary)}
                          </span>
                        </div>
                        {showSecondaryLine && secondaryLabel ? (
                          <div className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: secondaryStroke }}
                              />
                              {secondaryLabel}
                            </span>
                            <span className="font-bold tabular-nums text-slate-800">
                              {formatNumber(point.secondary)}
                            </span>
                          </div>
                        ) : null}
                        {showComparison && rangePreset !== 'all' ? (
                          <div className="flex items-center justify-between gap-6 border-t border-slate-100 pt-1.5 text-slate-500">
                            <span>Prior period ({point.previousLabel || 'equivalent'})</span>
                            <span className="font-semibold tabular-nums">
                              {formatNumber(point.previousPrimary)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
              />
              {showComparison && rangePreset !== 'all' ? (
                <Line
                  type="monotone"
                  dataKey="previousPrimary"
                  name={`Prior ${primaryLabel}`}
                  stroke="#94a3b8"
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#94a3b8' }}
                  isAnimationActive={false}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="primary"
                name={primaryLabel}
                stroke={primaryStroke}
                strokeWidth={2.5}
                fill={`url(#fill-${gradientId})`}
                dot={points.length <= 16 ? { r: 3, fill: primaryStroke, strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: primaryStroke, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {showSecondaryLine && secondaryLabel ? (
                <Line
                  type="monotone"
                  dataKey="secondary"
                  name={secondaryLabel}
                  stroke={secondaryStroke}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: secondaryStroke, stroke: '#ffffff', strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryStroke }} />
              {primaryLabel}
            </span>
            {showSecondaryLine && secondaryLabel ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryStroke }} />
                {secondaryLabel}
              </span>
            ) : null}
            {showComparison && rangePreset !== 'all' ? (
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" />
                Prior period ({comparisonLabel})
              </span>
            ) : null}
          </div>
          <span className="tabular-nums text-[11px] text-slate-400">
            Showing {from} → {to} (UTC)
          </span>
        </div>
      </div>
    </section>
  );
};

export const AnalyticsTrendCanvas: React.FC<{
  points: TrendPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
  showSecondary?: boolean;
  showComparison?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
  emptyMessage?: string;
}> = ({
  points,
  primaryLabel,
  secondaryLabel,
  showSecondary = true,
  showComparison = true,
  primaryColor = '#4f46e5',
  secondaryColor = '#0ea5e9',
  height = 260,
  emptyMessage = 'No trend data recorded for this period.',
}) => {
  const gradientId = useId().replace(/:/g, '');

  if (!points || points.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={`canvas-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={primaryColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as TrendPoint | undefined;
                if (!point) return null;
                return (
                  <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-xs">
                    <div className="font-bold text-slate-900">{point.fullLabel}</div>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: primaryColor }}
                          />
                          {primaryLabel}
                        </span>
                        <span className="font-bold tabular-nums text-slate-900">
                          {formatNumber(point.primary)}
                        </span>
                      </div>
                      {showSecondary && secondaryLabel ? (
                        <div className="flex items-center justify-between gap-6">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: secondaryColor }}
                            />
                            {secondaryLabel}
                          </span>
                          <span className="font-bold tabular-nums text-slate-800">
                            {formatNumber(point.secondary)}
                          </span>
                        </div>
                      ) : null}
                      {showComparison ? (
                        <div className="flex items-center justify-between gap-6 border-t border-slate-100 pt-1.5 text-slate-500">
                          <span>Prior period ({point.previousLabel || 'equivalent'})</span>
                          <span className="font-semibold tabular-nums">
                            {formatNumber(point.previousPrimary)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }}
            />
            {showComparison ? (
              <Line
                type="monotone"
                dataKey="previousPrimary"
                name={`Prior ${primaryLabel}`}
                stroke="#94a3b8"
                strokeWidth={1.75}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4, fill: '#94a3b8' }}
                isAnimationActive={false}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="primary"
              name={primaryLabel}
              stroke={primaryColor}
              strokeWidth={2.5}
              fill={`url(#canvas-fill-${gradientId})`}
              dot={points.length <= 16 ? { r: 3, fill: primaryColor, strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: primaryColor, stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {showSecondary && secondaryLabel ? (
              <Line
                type="monotone"
                dataKey="secondary"
                name={secondaryLabel}
                stroke={secondaryColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: secondaryColor, stroke: '#ffffff', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
          {primaryLabel}
        </span>
        {showSecondary && secondaryLabel ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryColor }} />
            {secondaryLabel}
          </span>
        ) : null}
        {showComparison ? (
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" />
            Prior equivalent period
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default AnalyticsTrendChart;
