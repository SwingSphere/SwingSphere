import type { TimeLens } from '../../types';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const PRESET_LABELS: Record<Extract<TimeLens, { mode: 'soon' }>['preset'], string> = {
  today: 'Tonight',
  weekend: 'This Weekend',
  '7d': 'Next 7 Days',
  '30d': 'Next 30 Days',
};

const formatISODate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return DATE_FORMATTER.format(parsed);
};

export const getTimeLensSummary = (lens: TimeLens) => {
  switch (lens.mode) {
    case 'soon':
      return PRESET_LABELS[lens.preset];
    case 'date':
      return formatISODate(lens.date);
    case 'range': {
      const rangeLabel = `${formatISODate(lens.start)} - ${formatISODate(lens.end)}`;
      return rangeLabel;
    }
    default:
      return '';
  }
};
