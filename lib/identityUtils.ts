import type { ClubData, EventData } from '../types';

const BASELINE_LEGACY_KEYS_BY_ID: Record<string, string[]> = {
  'club-twist-sf': ['013mcny4', '008b4lzn', '00outgyj'],
  'club-power-exchange-sf': ['01ygwpjt', '01cqbmog'],
  'club3': ['01t6jj85'],
  'club-club-joi-la': ['013pxx5n'],
  'club-1782366659742': ['00fft0ta'],
  'event-1782943939781': ['00fivrbn'],
  'event-connect-dance-love-2026-10-17': ['01y73uxi'],
  'club-1782957638814': ['017m5pn3'],
  'club-1783117266680': ['00lo3f5z'],
  'club-ice-lounge-wichita': ['00wdox3g'],
  'club-ice-lounge-oklahoma-city': ['00aicobr'],
  'club-eden-dfw': ['0075sx67'],
  'club-eden-san-antonio': ['00gfpdq7'],
  'club-eden-oklahoma-city': ['00vfoojq'],
  'club-colette-dallas': ['00aqqfcd'],
  'club-colette-austin': ['00faw87n'],
  'club-colette-houston': ['00t3skp7'],
  'club-colette-new-orleans': ['00x73wh3'],
  'club-colette-san-antonio': ['01vqb5jz'],
  'club-voluptuous-tokyo': ['00qpnotr'],
  'club-2a2-rio-de-janeiro': ['00zvctnn'],
  'club-fetish-haven-sa-johannesburg': ['003ah86k'],
  'club-kiwiklub-durban': ['00ohdrgv'],
  'club-dungeon-tel-aviv': ['00ga46z9'],
  'event-little-black-dress-santa-cruz-2026-08-29': ['00z3tmjn'],
  'club-taken-paris': ['00878182'],
  'club-black-diamond-belgrade': ['01jf3zfn'],
  'club-sweet-buenos-aires': ['00lr0p7b'],
  'club-dalliance-columbia': ['00c3uapt'],
  'club-zcretclub-lima': ['00yt0qge'],
  'club-lorage-montreal': ['011xp5k8'],
  'club-the-69-las-vegas': ['01wf44yz'],
  'club-le-boudoir-london': ['00wp0kpl'],
  'club-insolitam-spa-bogota': ['004slmqj'],
  'club-lizas-lounge-cape-town': ['00aet7hd'],
  'club-coliseum-mexico-city': ['00wmv0dx'],
  'club-privata-portland': ['015zjych'],
  'club-oasis-aqualounge-toronto': ['003u3ir7'],
  'club-trapeze-atlanta': ['0068tum1'],
  'event-her-fantasy-kink-twist-2026-08-02': ['01ibh3bu'],
  'event-her-fantasy-back-to-school-twist-2026-08-16': ['013cba1a'],
  'event-her-fantasy-white-party-twist-2026-08-30': ['00q4u1rz'],
  'event-bronze-very-little-black-dress-twist-2026-09-06': ['01gd8wv9'],
  'event-bronze-halloween-kickoff-twist-2026-10-24': ['003p2tcc'],
  'club-lussuria-bangkok': ['00ym7ho6'],
  'club-soho-graz': ['01hiar1d'],
  'club-attraction-bucharest': ['00k1bs0x'],
  'club-fun4two-moordrecht': ['01wuz5ec'],
  'club-fata-morgana-muiden': ['00xx0su9'],
  'club-swingland-ishoj': ['01rff1ih'],
  'club-more-helsinki': ['00su80wq'],
  'club-trapeze-fort-lauderdale': ['00qb8wft'],
  'club-sauna-paradise-tel-aviv': ['01m7mbr9'],
  'club-sauna-club-tel-aviv': ['00weitst'],
  'club-rich-moscow': ['01nmv9vv'],
  'club-day-ognya-saint-petersburg': ['01ivuk34'],
  'club-zona-x-costa-rica': ['00uctqjy'],
  'club-la-casa-de-eros-lima': ['00xxg8g2'],
  'club-interspa-bogota': ['01q4zub1'],
  'club-cupids-swinton': ['01mjo4c1'],
  'event-krystal-vicenza-2026-10-02': ['01dpbpnp'],
  'event-krystal-vicenza-2026-10-03': ['01nokutv'],
  'event-krystal-vicenza-2026-10-09': ['000iagks'],
  'event-krystal-vicenza-2026-10-10': ['00j3hmpl'],
  'event-krystal-vicenza-2026-10-16': ['01hhzkzu'],
  'event-krystal-vicenza-2026-10-17': ['01mjicjj'],
  'event-krystal-vicenza-2026-10-23': ['00zi1ud4'],
  'event-krystal-vicenza-2026-10-24': ['00mw5i1q'],
  'event-krystal-vicenza-2026-10-30': ['014ucttz'],
  'event-krystal-vicenza-2026-10-31': ['00lgshpn'],
  'club-krystal-vicenza': ['003n6jmb'],
  'club-syn-tulsa': ['00puczwo'],
  'club-idiza-club-desire-seoul': ['009ze0kr'],
  'club-epicure-cape-town': ['01njyeeg'],
  'club-insomnia-berlin': ['00qc3866'],
  'club-casa-swinger-cdmx': ['01mgu7s5'],
  'club-swingers-oase-ammerzoden': ['017u89e7'],
  'club-tokyo-valentino-lifestyle-atlanta': ['01iihv3q'],
  'event-her-fantasy-90786-2026-09-27': ['005vwosk'],
  'event-bronze-96234-2026-10-02': ['00fhc8f4'],
  'event-her-fantasy-96825-2026-10-04': ['01l4fdun'],
  'event-her-fantasy-93358-2026-10-11': ['008zml9r'],
  'event-her-fantasy-90347-2026-10-25': ['00x8oed6'],
  'event-bronze-93500-2026-10-31': ['00w3gavp'],
  'event-her-fantasy-90348-2026-11-08': ['01sb02wm'],
  'event-her-fantasy-90349-2026-11-22': ['00uitqnn'],
  'event-bronze-93356-2026-11-25': ['01kfusgs'],
  'event-her-fantasy-90355-2026-12-06': ['00ch65ur'],
  'event-bronze-90365-2026-12-12': ['00afm6wj'],
  'club-tucan-club-almind': ['019y95ms'],
  'club-b1-club-escape-cleveland': ['01pae5hm'],
  'event-b1-sameplace-amsterdam-2026-10-09-bdsm-the-game-on-friday': ['01do5qkf'],
  'club-b1-club-nv-muncie': ['00lt0lf9'],
  'club-b1-club-traumpalais-ingelheim': ['008g0zyb'],
  'event-b1-wasteland-2026-10-31-wasteland-halloween-ball': ['01fxs901'],
  'event-b1-wasteland-2026-11-28-wasteland-amsterdam': ['002k1ty3'],
  'event-halloween-party-los-angeles-2026-10-10': ['01jw2etz'],
  'event-enchanted-darkness-halloween-party-san-diego-2026-10-10': ['00u64g3d'],
  'event-halloween-party-denver-2026-10-10': ['01shcqku'],
  'event-tease-cocktail-mixer-las-vegas-2026-10-16': ['00a5j5q0'],
  'event-haunted-circus-halloween-party-las-vegas-2026-10-17': ['00x8el6h'],
  'event-halloween-party-phoenix-2026-10-17': ['00vt55d8'],
  'event-halloween-party-austin-2026-10-17': ['00weqz45'],
  'event-halloween-party-raleigh-2026-10-17': ['01xxqelp'],
  'event-halloween-cruise-san-pedro-2026-10-24': ['00y72f8s'],
  'event-halloween-party-san-jose-2026-10-31': ['00tdqj4w'],
  'event-halloween-party-san-diego-2026-10-31': ['01a2hdfb'],
  'event-pajama-party-seattle-2026-11-07': ['00ao5sku'],
  'event-pajama-party-san-diego-2026-11-14': ['003c4xdw'],
  'event-masquerade-party-brooklyn-2026-11-21': ['00hor8py'],
  'club-ohio-swings-new-carlisle': ['011y5hzc'],
  'club-libert-swinger-club-barcelona': ['0144h79s'],
};

const STATE_VARIANTS: Record<string, string[]> = {
  ca: ['ca', 'california'],
  california: ['california', 'ca'],
  ny: ['ny', 'new york'],
  'new york': ['new york', 'ny'],
  tx: ['tx', 'texas'],
  texas: ['texas', 'tx'],
  fl: ['fl', 'florida'],
  florida: ['florida', 'fl'],
  nv: ['nv', 'nevada'],
  nevada: ['nevada', 'nv'],
  il: ['il', 'illinois'],
  illinois: ['illinois', 'il'],
  wa: ['wa', 'washington'],
  washington: ['washington', 'wa'],
  or: ['or', 'oregon'],
  oregon: ['oregon', 'or'],
  az: ['az', 'arizona'],
  arizona: ['arizona', 'az'],
  co: ['co', 'colorado'],
  colorado: ['colorado', 'co'],
  ga: ['ga', 'georgia'],
  georgia: ['georgia', 'ga'],
  nc: ['nc', 'north carolina'],
  'north carolina': ['north carolina', 'nc'],
  oh: ['oh', 'ohio'],
  ohio: ['ohio', 'oh'],
  pa: ['pa', 'pennsylvania'],
  pennsylvania: ['pennsylvania', 'pa'],
};

const COUNTRY_VARIANTS: Record<string, string[]> = {
  us: ['us', 'usa', 'united states'],
  usa: ['usa', 'us', 'united states'],
  'united states': ['united states', 'us', 'usa'],
  uk: ['uk', 'united kingdom', 'gb'],
  'united kingdom': ['united kingdom', 'uk', 'gb'],
};

export const normalizeIdentityString = (value: string): string => {
  if (!value) return '';
  const ascii = value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '');
  return ascii
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const stableHash = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  const normalized = (hash >>> 0).toString(36);
  return normalized.padStart(8, '0');
};

export const nameSlug = (name: string): string => {
  const normalized = normalizeIdentityString(name);
  return normalized ? normalized.replace(/\s+/g, '-') : 'listing';
};

export const slugify = nameSlug;

const roundedCoords = (lat?: number, lng?: number): string => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
};

export const stableEntityKey = (id: string): string => {
  const normalized = String(id ?? '').trim().toLowerCase();
  return stableHash(normalized);
};

export const legacyClubKey = (club: ClubData): string => {
  const name = normalizeIdentityString(club.name);
  const address = club.geopoint?.address;
  const city = normalizeIdentityString(address?.city ?? '');
  const region = normalizeIdentityString(address?.region ?? '');
  const country = normalizeIdentityString(address?.country ?? '');
  const locationBits = [city, region, country].filter(Boolean);
  let identity = [name, ...locationBits].filter(Boolean).join('|');
  if (!identity) {
    const coords = roundedCoords(club.geopoint?.latitude, club.geopoint?.longitude);
    identity = coords || name;
  } else if (locationBits.length === 0) {
    const coords = roundedCoords(club.geopoint?.latitude, club.geopoint?.longitude);
    if (coords) identity = `${identity}|${coords}`;
  }
  return stableHash(identity);
};

export const clubKey = (club: ClubData): string => {
  if (club.id && club.id.trim()) {
    return stableEntityKey(club.id);
  }
  return legacyClubKey(club);
};

export const matchesClubVenueKey = (club: ClubData, venueKey: string | undefined): boolean => {
  if (!venueKey) return false;
  const trimmed = venueKey.trim();
  if (!trimmed) return false;
  const baselineKeys = club.id ? BASELINE_LEGACY_KEYS_BY_ID[club.id] ?? [] : [];
  return (
    clubKey(club) === trimmed ||
    legacyClubKey(club) === trimmed ||
    baselineKeys.includes(trimmed) ||
    club.id === trimmed ||
    nameSlug(club.name || '') === trimmed
  );
};

export const normalizeHostName = (hostName: string): string => {
  return normalizeIdentityString(hostName);
};

export const hostSlug = (hostName: string): string => {
  return nameSlug(normalizeHostName(hostName));
};

export const legacyEventKey = (
  event: EventData,
  hostName: string = event.hostName ?? '',
): string => {
  const name = normalizeIdentityString(event.name);
  const startIso = event.time?.start ?? '';
  const host = normalizeHostName(hostName);
  const venue = event.venueKey ?? '';
  const city = normalizeIdentityString(event.geopoint?.address?.city ?? '');
  const identity = [name, startIso, venue, host, city].filter(Boolean).join('|');
  return stableHash(identity);
};

export const eventKey = (
  event: EventData,
  hostName: string = event.hostName ?? '',
): string => {
  if (event.id && event.id.trim()) {
    return stableEntityKey(event.id);
  }
  return legacyEventKey(event, hostName);
};

const addClubLegacyVariants = (targetClub: ClubData, keys: Set<string>) => {
  const legacy = legacyClubKey(targetClub);
  if (legacy) keys.add(legacy);
  if (targetClub.id?.trim()) {
    keys.add(targetClub.id.trim());
    for (const k of BASELINE_LEGACY_KEYS_BY_ID[targetClub.id.trim()] ?? []) {
      keys.add(k);
    }
  }

  const rawName = (targetClub.name ?? '').trim();
  const nameVariants = new Set<string>([rawName]);
  if (rawName) {
    nameVariants.add(rawName.replace(/['’`]/g, ''));
    const withoutResortSpa = rawName.replace(/\s+resort\s*(?:&|and)\s*spa$/i, '').trim();
    if (withoutResortSpa) nameVariants.add(withoutResortSpa);
  }

  const address = targetClub.geopoint?.address;
  const city = address?.city?.trim() ?? '';
  const normRegion = normalizeIdentityString(address?.region ?? '');
  const normCountry = normalizeIdentityString(address?.country ?? '');
  const regionVariants = STATE_VARIANTS[normRegion] ?? [normRegion];
  const countryVariants = COUNTRY_VARIANTS[normCountry] ?? [normCountry];

  if (city && rawName) {
    for (const variant of Array.from(nameVariants)) {
      const lowerName = variant.toLowerCase();
      const lowerCity = city.toLowerCase();
      if (lowerName.endsWith(` ${lowerCity}`)) {
        const strippedName = variant.slice(0, -(city.length + 1)).trim();
        if (strippedName) nameVariants.add(strippedName);
      } else {
        nameVariants.add(`${variant} ${city}`);
      }
    }
  }

  for (const variantName of nameVariants) {
    if (!variantName) continue;
    keys.add(legacyClubKey({ ...targetClub, name: variantName }));
    for (const r of regionVariants) {
      for (const c of countryVariants) {
        keys.add(
          legacyClubKey({
            ...targetClub,
            name: variantName,
            geopoint: {
              ...targetClub.geopoint,
              address: {
                ...(targetClub.geopoint?.address ?? {}),
                region: r,
                country: c,
              },
            },
          }),
        );
      }
    }
  }
};

export const getCandidateClubKeys = (
  club: ClubData,
  extraClubs: ClubData[] = [],
): string[] => {
  const keys = new Set<string>();
  const primary = clubKey(club);
  if (primary) keys.add(primary);

  addClubLegacyVariants(club, keys);

  for (const extra of extraClubs) {
    addClubLegacyVariants(extra, keys);
  }

  return Array.from(keys);
};

const addEventLegacyVariants = (
  targetEvent: EventData,
  resolvedHostName: string,
  extraVenueKeys: string[],
  keys: Set<string>,
) => {
  if (targetEvent.id?.trim()) {
    for (const k of BASELINE_LEGACY_KEYS_BY_ID[targetEvent.id.trim()] ?? []) {
      keys.add(k);
    }
  }
  const rawName = (targetEvent.name ?? '').trim();
  const nameVariants = Array.from(
    new Set([rawName, rawName.replace(/['’`]/g, '')].filter(Boolean)),
  );
  const hostVariants = Array.from(
    new Set(
      [
        resolvedHostName,
        targetEvent.hostName ?? '',
        resolvedHostName.replace(/['’`]/g, ''),
        (targetEvent.hostName ?? '').replace(/['’`]/g, ''),
        '',
      ].map((h) => h.trim()),
    ),
  );
  const venueVariants = Array.from(
    new Set([targetEvent.venueKey ?? '', '', ...extraVenueKeys].map((v) => v.trim())),
  );

  for (const n of nameVariants) {
    for (const h of hostVariants) {
      for (const v of venueVariants) {
        keys.add(legacyEventKey({ ...targetEvent, name: n, venueKey: v || undefined }, h));
      }
    }
  }
};

export const getCandidateEventKeys = (
  event: EventData,
  resolvedHostName: string = event.hostName ?? '',
  extraEvents: EventData[] = [],
  extraVenueKeys: string[] = [],
): string[] => {
  const keys = new Set<string>();
  const primary = eventKey(event, resolvedHostName);
  if (primary) keys.add(primary);
  if (event.id?.trim()) keys.add(event.id.trim());

  addEventLegacyVariants(event, resolvedHostName, extraVenueKeys, keys);

  for (const extra of extraEvents) {
    addEventLegacyVariants(extra, resolvedHostName, extraVenueKeys, keys);
    if (extra.id?.trim()) keys.add(extra.id.trim());
  }

  return Array.from(keys);
};

export const parsePrettyKeyParam = (param: string): string => {
  if (!param) return '';
  const trimmed = param.trim();
  const parts = trimmed.split('--').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : trimmed;
};

export const hasExplicitKeyParam = (param: string): boolean => {
  if (!param) return false;
  return param.trim().includes('--');
};

