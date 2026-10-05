export const RESERVED_PROFILE_HANDLES = new Set([
  'admin',
  'administrator',
  'api',
  'help',
  'moderator',
  'official',
  'root',
  'security',
  'staff',
  'support',
  'swingsphere',
  'system',
  'user',
  'www',
]);

export const normalizeProfileHandle = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

export const isReservedProfileHandle = (value: string) =>
  RESERVED_PROFILE_HANDLES.has(normalizeProfileHandle(value));

export const isValidProfileHandle = (value: string) => {
  const normalized = normalizeProfileHandle(value);
  return /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(normalized)
    && !isReservedProfileHandle(normalized);
};
