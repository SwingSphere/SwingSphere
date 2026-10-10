export type AnalyticsRangePreset = '24h' | '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';
export type AnalyticsGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type TrendPoint = {
  key: string;
  label: string;
  fullLabel: string;
  primary: number;
  secondary: number;
  previousPrimary: number;
  previousLabel?: string;
};

export type DeltaResult = {
  percent: number | null;
  formatted: string;
  direction: 'up' | 'down' | 'flat' | 'new';
};

export const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

export const shiftUtcDays = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateInput(d);
};

export const resolveRangeDates = (
  preset: AnalyticsRangePreset,
  todayStr: string,
  firstRecordedDay?: string | null,
): { from: string; to: string; defaultGranularity: AnalyticsGranularity; comparisonLabel: string } => {
  switch (preset) {
    case '24h':
      return {
        from: shiftUtcDays(todayStr, -1),
        to: todayStr,
        defaultGranularity: 'hourly',
        comparisonLabel: 'vs previous 24h',
      };
    case '7d':
      return {
        from: shiftUtcDays(todayStr, -6),
        to: todayStr,
        defaultGranularity: 'daily',
        comparisonLabel: 'vs previous 7 days',
      };
    case '30d':
      return {
        from: shiftUtcDays(todayStr, -29),
        to: todayStr,
        defaultGranularity: 'daily',
        comparisonLabel: 'vs previous 30 days',
      };
    case '90d':
      return {
        from: shiftUtcDays(todayStr, -89),
        to: todayStr,
        defaultGranularity: 'daily',
        comparisonLabel: 'vs previous 90 days',
      };
    case '12m':
      return {
        from: shiftUtcDays(todayStr, -364),
        to: todayStr,
        defaultGranularity: 'weekly',
        comparisonLabel: 'vs previous 12 months',
      };
    case 'all': {
      const start = firstRecordedDay && firstRecordedDay <= todayStr
        ? firstRecordedDay
        : shiftUtcDays(todayStr, -179);
      const spanDays = Math.max(
        1,
        Math.round((new Date(`${todayStr}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1,
      );
      return {
        from: start,
        to: todayStr,
        defaultGranularity: spanDays > 120 ? 'weekly' : 'daily',
        comparisonLabel: 'all recorded history',
      };
    }
    case 'custom':
    default:
      return {
        from: shiftUtcDays(todayStr, -29),
        to: todayStr,
        defaultGranularity: 'daily',
        comparisonLabel: 'vs previous period',
      };
  }
};

export const computePercentageChange = (current: number, previous: number): DeltaResult => {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);

  if (prev <= 0) {
    if (curr <= 0) {
      return { percent: 0, formatted: '0.0%', direction: 'flat' };
    }
    return { percent: null, formatted: 'New', direction: 'new' };
  }

  const rawPct = ((curr - prev) / prev) * 100;
  const rounded = Math.round(rawPct * 10) / 10;

  if (Math.abs(rounded) < 0.05) {
    return { percent: 0, formatted: '0.0%', direction: 'flat' };
  }

  return {
    percent: rounded,
    formatted: `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`,
    direction: rounded > 0 ? 'up' : 'down',
  };
};

const formatShortDay = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const formatFullDay = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const formatHourLabel = (isoHour: string): { short: string; full: string } => {
  const d = new Date(isoHour);
  if (Number.isNaN(d.getTime())) return { short: isoHour, full: isoHour };
  return {
    short: d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
    full: d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  };
};

export const buildAnalyticsTrendPoints = ({
  from,
  to,
  granularity,
  daily,
  previousDaily = [],
  hourly = [],
}: {
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
  daily: Array<{ day: string; primary: number; secondary: number }>;
  previousDaily?: Array<{ day: string; primary: number; secondary?: number }>;
  hourly?: Array<{ hour: string; primary: number; secondary: number }>;
}): TrendPoint[] => {
  if (granularity === 'hourly') {
    const hourMap = new Map<string, { primary: number; secondary: number }>();
    for (const item of hourly) {
      const normalized = `${item.hour.slice(0, 13)}:00:00Z`;
      hourMap.set(normalized, {
        primary: Number(item.primary || 0),
        secondary: Number(item.secondary || 0),
      });
    }

    // Anchor at current UTC hour (or latest hour in hourly array if present)
    const now = new Date();
    now.setUTCMinutes(0, 0, 0);
    const anchorMs = now.getTime();

    const points: TrendPoint[] = [];
    for (let offset = 23; offset >= 0; offset -= 1) {
      const currDate = new Date(anchorMs - offset * 3_600_000);
      const prevDate = new Date(anchorMs - (offset + 24) * 3_600_000);
      const currIso = `${currDate.toISOString().slice(0, 13)}:00:00Z`;
      const prevIso = `${prevDate.toISOString().slice(0, 13)}:00:00Z`;
      const currVal = hourMap.get(currIso) ?? { primary: 0, secondary: 0 };
      const prevVal = hourMap.get(prevIso) ?? { primary: 0, secondary: 0 };
      const labels = formatHourLabel(currIso);
      const prevLabels = formatHourLabel(prevIso);

      points.push({
        key: currIso,
        label: labels.short,
        fullLabel: labels.full,
        primary: currVal.primary,
        secondary: currVal.secondary,
        previousPrimary: prevVal.primary,
        previousLabel: prevLabels.full,
      });
    }

    // If hourly raw table had no events yet but today/yesterday daily rollup has counts,
    // distribute the daily counts onto the corresponding day's noon/current bucket so the chart isn't blank.
    const totalHourly = points.reduce((acc, p) => acc + p.primary + p.secondary, 0);
    if (totalHourly === 0 && daily.length > 0) {
      const latestDay = daily[daily.length - 1];
      if (latestDay && (latestDay.primary > 0 || latestDay.secondary > 0) && points.length > 0) {
        points[points.length - 1].primary = latestDay.primary;
        points[points.length - 1].secondary = latestDay.secondary;
      }
    }

    return points;
  }

  // Build continuous daily sequence first
  const dayMap = new Map<string, { primary: number; secondary: number }>();
  for (const d of daily) {
    dayMap.set(d.day, {
      primary: Number(d.primary || 0),
      secondary: Number(d.secondary || 0),
    });
  }

  const prevDayMap = new Map<string, { primary: number; secondary: number }>();
  for (const d of previousDaily) {
    prevDayMap.set(d.day, {
      primary: Number(d.primary || 0),
      secondary: Number(d.secondary ?? d.primary ?? 0),
    });
  }

  const startMs = new Date(`${from}T00:00:00Z`).getTime();
  const endMs = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }

  const spanDays = Math.min(1500, Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1));
  const prevStartMs = startMs - spanDays * 86_400_000;

  const dailyPoints: TrendPoint[] = [];
  for (let i = 0; i < spanDays; i += 1) {
    const dayStr = toDateInput(new Date(startMs + i * 86_400_000));
    const prevDayStr = toDateInput(new Date(prevStartMs + i * 86_400_000));
    const curr = dayMap.get(dayStr) ?? { primary: 0, secondary: 0 };
    const prev = prevDayMap.get(prevDayStr) ?? { primary: 0, secondary: 0 };

    dailyPoints.push({
      key: dayStr,
      label: formatShortDay(dayStr),
      fullLabel: formatFullDay(dayStr),
      primary: curr.primary,
      secondary: curr.secondary,
      previousPrimary: prev.primary,
      previousLabel: formatFullDay(prevDayStr),
    });
  }

  if (granularity === 'daily' || dailyPoints.length <= 14) {
    return dailyPoints;
  }

  if (granularity === 'weekly') {
    const weeks: TrendPoint[] = [];
    for (let i = 0; i < dailyPoints.length; i += 7) {
      const slice = dailyPoints.slice(i, i + 7);
      const first = slice[0];
      const last = slice[slice.length - 1];
      weeks.push({
        key: first.key,
        label: first.label,
        fullLabel: `${first.label} – ${last.label}`,
        primary: slice.reduce((acc, p) => acc + p.primary, 0),
        secondary: slice.reduce((acc, p) => acc + p.secondary, 0),
        previousPrimary: slice.reduce((acc, p) => acc + p.previousPrimary, 0),
        previousLabel: first.previousLabel ? `Prior week (${first.previousLabel})` : undefined,
      });
    }
    return weeks;
  }

  // Monthly aggregation
  const monthBuckets = new Map<string, TrendPoint>();
  for (const pt of dailyPoints) {
    const monthKey = pt.key.slice(0, 7); // YYYY-MM
    const d = new Date(`${monthKey}-01T00:00:00Z`);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const fullLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const existing = monthBuckets.get(monthKey);
    if (existing) {
      existing.primary += pt.primary;
      existing.secondary += pt.secondary;
      existing.previousPrimary += pt.previousPrimary;
    } else {
      monthBuckets.set(monthKey, {
        key: monthKey,
        label,
        fullLabel,
        primary: pt.primary,
        secondary: pt.secondary,
        previousPrimary: pt.previousPrimary,
        previousLabel: 'Equivalent prior month',
      });
    }
  }
  return Array.from(monthBuckets.values());
};
