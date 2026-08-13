const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const isExplicitlyDisabled = (value: string | boolean | undefined): boolean => {
  if (typeof value === 'boolean') return !value;
  if (typeof value !== 'string') return false;
  return FALSE_VALUES.has(value.trim().toLowerCase());
};

export const DEV_TOOLS_ENABLED =
  import.meta.env.DEV &&
  !isExplicitlyDisabled((import.meta.env as Record<string, string | boolean | undefined>).VITE_SHOW_DEV_TOOLS);

export const shouldShowDevTools = (requested: boolean): boolean => requested && DEV_TOOLS_ENABLED;
