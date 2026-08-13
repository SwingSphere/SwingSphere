import countryIso2Aliases from '../data/country_iso2.json';

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "UNITED STATES": "US",
  USA: "US",
  US: "US",
  "UNITED KINGDOM": "GB",
  UK: "GB",
  ENGLAND: "GB",
  SCOTLAND: "GB",
  WALES: "GB",
  CANADA: "CA",
  MEXICO: "MX",
  BRAZIL: "BR",
  GERMANY: "DE",
  FRANCE: "FR",
  SPAIN: "ES",
  ITALY: "IT",
  IRELAND: "IE",
  AUSTRALIA: "AU",
  JAPAN: "JP",
  CHINA: "CN",
  "SOUTH KOREA": "KR",
  "KOREA, SOUTH": "KR",
  "REPUBLIC OF KOREA": "KR",
};

const US_REGION_ABBREVIATIONS: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
  HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
  KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
  MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO",
  MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH",
  OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

export const formatAddressRegion = (region: string, country: string): string => {
  const trimmedRegion = region?.trim() ?? "";
  if (!trimmedRegion) return "";
  const normalizedCountry = country?.trim().toUpperCase() ?? "";
  const countryCode = normalizedCountry.length === 2
    ? normalizedCountry
    : COUNTRY_NAME_TO_CODE[normalizedCountry];
  if (countryCode !== "US") return trimmedRegion;
  if (/^[A-Z]{2}$/.test(trimmedRegion.toUpperCase())) return trimmedRegion.toUpperCase();
  return US_REGION_ABBREVIATIONS[trimmedRegion.toUpperCase()] ?? trimmedRegion;
};

const COUNTRY_ALIAS_MAP = (countryIso2Aliases as { aliases?: Record<string, string> }).aliases ?? {};

const normalizeCountryAlias = (value: string): string => value
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s_]+/g, '-')
  .replace(/[^a-z0-9-]/g, '')
  .replace(/-+/g, '-')
  .replace(/(^-|-$)/g, '');

export const resolveCountryCode = (country: string): string => {
  if (!country) return '';
  const trimmed = country.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const mapped = COUNTRY_NAME_TO_CODE[upper] ?? COUNTRY_ALIAS_MAP[normalizeCountryAlias(trimmed)]?.toUpperCase();
  return mapped ?? '';
};

export const countryCodeToEmoji = (code: string): string => {
  const cc = resolveCountryCode(code);
  if (!cc) return '';
  const first = 0x1f1e6 + (cc.charCodeAt(0) - 65);
  const second = 0x1f1e6 + (cc.charCodeAt(1) - 65);
  return String.fromCodePoint(first, second);
};

export const resolveCountryFlagEmoji = (country: string): string => countryCodeToEmoji(resolveCountryCode(country));

export const getCountryFlagImageUrl = (country: string): string => {
  const code = resolveCountryCode(country);
  return code ? `https://flagcdn.com/${code.toLowerCase()}.svg` : '';
};

export const formatClockTime = (value: string, locale = "en-US"): string => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;

  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: minutes === 0 ? undefined : "2-digit",
    hour12: true,
  }).format(date);
};

export const formatEventTimeRange = (
  startIso: string,
  endIso: string,
  locale = "en-US",
): string => {
  if (!startIso || !endIso) return "";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);

  const oneDayMs = 24 * 60 * 60 * 1000;
  const durationMs = end.getTime() - start.getTime();
  const showEndDate = durationMs > oneDayMs;
  const dateSeparator = " \u00b7 ";
  const timeSeparator = " \u2013 ";

  if (showEndDate) {
    return `${startDate}${dateSeparator}${startTime}${timeSeparator}${endDate}${dateSeparator}${endTime}`;
  }

  return `${startDate}${dateSeparator}${startTime}${timeSeparator}${endTime}`;
};
