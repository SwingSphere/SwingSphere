const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const toBoolean = (value: string | boolean | undefined): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
};

export const isDevRouteEnabled = (): boolean => {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return (
    import.meta.env.DEV ||
    toBoolean(env.NEXT_PUBLIC_ENABLE_DEV_ROUTES) ||
    toBoolean(env.VITE_ENABLE_DEV_ROUTES)
  );
};
