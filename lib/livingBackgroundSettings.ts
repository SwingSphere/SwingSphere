export const LIVING_BACKGROUND_STORAGE_KEY = 'swingsphere:dev:living-background-state';
export const LIVING_BACKGROUND_SETTINGS_EVENT = 'swingsphere:living-background-settings';

export type LivingBackgroundSettings = {
  opacity: number;
  morph: number;
  morphSpeed: number;
  panelSpeed: number;
  panelPulse: number;
  panelFlicker: number;
  lines: number;
  glow: number;
  blur: number;
  density: number;
};

export type LivingBackgroundStoredState = LivingBackgroundSettings & {
  showContent?: boolean;
};

// Production baseline. Existing browser-saved values override these.
export const DEFAULT_LIVING_BACKGROUND_SETTINGS: LivingBackgroundSettings = {
  opacity: 64,
  morph: 101,
  morphSpeed: 160,
  panelSpeed: 99,
  panelPulse: 100,
  panelFlicker: 7,
  lines: 0,
  glow: 41,
  blur: 2,
  density: 100,
};

const finiteNumber = (value: unknown, fallback: number) => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const normalizeSettings = (value: Partial<LivingBackgroundStoredState> | null | undefined): LivingBackgroundStoredState => ({
  opacity: finiteNumber(value?.opacity, DEFAULT_LIVING_BACKGROUND_SETTINGS.opacity),
  morph: finiteNumber(value?.morph, DEFAULT_LIVING_BACKGROUND_SETTINGS.morph),
  morphSpeed: finiteNumber(value?.morphSpeed, DEFAULT_LIVING_BACKGROUND_SETTINGS.morphSpeed),
  panelSpeed: finiteNumber(value?.panelSpeed, DEFAULT_LIVING_BACKGROUND_SETTINGS.panelSpeed),
  panelPulse: finiteNumber(value?.panelPulse, DEFAULT_LIVING_BACKGROUND_SETTINGS.panelPulse),
  panelFlicker: finiteNumber(value?.panelFlicker, DEFAULT_LIVING_BACKGROUND_SETTINGS.panelFlicker),
  lines: finiteNumber(value?.lines, DEFAULT_LIVING_BACKGROUND_SETTINGS.lines),
  glow: finiteNumber(value?.glow, DEFAULT_LIVING_BACKGROUND_SETTINGS.glow),
  blur: finiteNumber(value?.blur, DEFAULT_LIVING_BACKGROUND_SETTINGS.blur),
  density: finiteNumber(value?.density, DEFAULT_LIVING_BACKGROUND_SETTINGS.density),
  showContent: typeof value?.showContent === 'boolean' ? value.showContent : undefined,
});

export const readLivingBackgroundStoredState = (): LivingBackgroundStoredState => {
  if (typeof window === 'undefined') return normalizeSettings(undefined);

  try {
    const raw = window.localStorage.getItem(LIVING_BACKGROUND_STORAGE_KEY);
    if (!raw) return normalizeSettings(undefined);
    return normalizeSettings(JSON.parse(raw) as Partial<LivingBackgroundStoredState>);
  } catch {
    return normalizeSettings(undefined);
  }
};

export const readLivingBackgroundSettings = (): LivingBackgroundSettings => {
  const { showContent: _showContent, ...settings } = readLivingBackgroundStoredState();
  return settings;
};

export const saveLivingBackgroundStoredState = (state: LivingBackgroundStoredState) => {
  if (typeof window === 'undefined') return false;

  try {
    const normalized = normalizeSettings(state);
    window.localStorage.setItem(LIVING_BACKGROUND_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(LIVING_BACKGROUND_SETTINGS_EVENT, { detail: normalized }));
    return true;
  } catch {
    return false;
  }
};

export const subscribeToLivingBackgroundSettings = (listener: (settings: LivingBackgroundSettings) => void) => {
  if (typeof window === 'undefined') return () => {};

  const emit = () => listener(readLivingBackgroundSettings());
  const handleCustomEvent = () => emit();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LIVING_BACKGROUND_STORAGE_KEY) emit();
  };

  window.addEventListener(LIVING_BACKGROUND_SETTINGS_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(LIVING_BACKGROUND_SETTINGS_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorage);
  };
};

export const toLivingBackgroundProps = (settings: LivingBackgroundSettings) => ({
  opacity: settings.opacity / 100,
  morphStrength: settings.morph / 100,
  morphSpeed: settings.morphSpeed / 100,
  colorSpeed: settings.panelSpeed / 100,
  colorStrength: settings.panelPulse / 100,
  panelFlicker: settings.panelFlicker / 100,
  lineStrength: settings.lines / 100,
  glowStrength: settings.glow / 100,
  blurPx: settings.blur,
  density: settings.density,
});
