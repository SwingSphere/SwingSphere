const HOUSE_TOKEN_SOURCE = String.raw`[0-9]+[\p{L}]?(?:\s*[-/]\s*[0-9]+[\p{L}]?)?`;
const EXPLICIT_HOUSE_MARKER = new RegExp(String.raw`(?:#|\b(?:no|nro|num|number|n[º°])\.?\s*)(${HOUSE_TOKEN_SOURCE})`, 'iu');
const LEADING_UNIT_PATTERN = /^\s*(?:unit|suite|apt|apartment|floor|fl|local|shop|office)\b/iu;
const NUMBERED_STREET_ONLY_PATTERN = /^\s*(?:calle|carrera|avenida|avda|rua|rue|via|viale|strada)\s+[0-9]+[\p{L}]?\s*$/iu;

const normalizeHouseToken = (value: string) => value
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, '');

const matchHouseAtStart = (value: string) => value.match(new RegExp(`^\\s*(${HOUSE_TOKEN_SOURCE})(?=\\s|,|$)`, 'iu'))?.[1] ?? '';
const matchHouseAtEnd = (value: string) => value.match(new RegExp(`(${HOUSE_TOKEN_SOURCE})\\s*$`, 'iu'))?.[1] ?? '';

/**
 * Extract the premise/house number rather than the first number that happens to
 * occur in an address. This matters for numbered streets and Colombian grid
 * addresses such as "Calle 82 #19A-05" and "Carrera 18 No. 78-50".
 */
export const extractAddressHouseNumber = (value: string | undefined | null): string => {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  const explicit = raw.match(EXPLICIT_HOUSE_MARKER)?.[1];
  if (explicit) return normalizeHouseToken(explicit);

  const segments = raw.split(',').map((segment) => segment.trim()).filter(Boolean);
  let primary = segments[0] ?? raw;
  let nextIndex = 1;
  if (LEADING_UNIT_PATTERN.test(primary) && segments[1]) {
    primary = segments[1];
    nextIndex = 2;
  }

  const leading = matchHouseAtStart(primary);
  if (leading) return normalizeHouseToken(leading);

  if (!NUMBERED_STREET_ONLY_PATTERN.test(primary)) {
    const trailing = matchHouseAtEnd(primary);
    if (trailing) return normalizeHouseToken(trailing);
  }

  // Some international formats put the street first and the premise number in
  // the next comma-delimited segment, e.g. "Rua Visconde de Caravelas, 176".
  const next = segments[nextIndex];
  if (next) {
    const isolated = next.match(new RegExp(`^\\s*(${HOUSE_TOKEN_SOURCE})\\s*$`, 'iu'))?.[1];
    if (isolated) return normalizeHouseToken(isolated);
  }
  return '';
};

export const stripAddressHouseNumber = (value: string | undefined | null): string => {
  const raw = value ?? '';
  const houseNumber = extractAddressHouseNumber(raw);
  if (!houseNumber) return raw;

  if (EXPLICIT_HOUSE_MARKER.test(raw)) {
    return raw.replace(EXPLICIT_HOUSE_MARKER, ' ');
  }

  const flexible = houseNumber
    .split(/([-/])/)
    .map((part) => {
      if (part === '-') return '\\s*[-–—]\\s*';
      if (part === '/') return '\\s*\\/\\s*';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const tokenPattern = new RegExp(`(^|[,\\s])${flexible}(?=\\s|,|$)`, 'iu');
  return raw.replace(tokenPattern, '$1 ');
};
