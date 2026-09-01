import type { BuildingVerificationMeta, Geopoint, Listing } from '../types';
import { getListingPhysicalAddress, getVenueForListing, type EntityCollections } from './entityCompatibility';
import type { IndividualBuildingFootprint } from './buildingGeometry';

export type BuildingAddressCandidate = { houseNumber?: string; road?: string; city?: string; region?: string; postalCode?: string; country?: string };
export type BuildingAddressScore = { score: number; confidence: number; houseNumberMatch: boolean; houseNumberConflict: boolean; streetSimilarity: number; cityMatch: boolean; postalCodeMatch: boolean; countryMatch: boolean; reasons: string[] };
export type BuildingVerificationOutcome = 'verified' | 'probable' | 'ambiguous' | 'address_mismatch' | 'pin_mismatch' | 'no_building_data' | 'needs_location_review' | 'private_or_approximate_skipped' | 'has_verified_asset';
export type VerificationCandidateInput = Pick<IndividualBuildingFootprint, 'fingerprint' | 'providerFeatureIds' | 'source' | 'pinIntersects' | 'pinToFootprintMeters' | 'pinToCentroidMeters'> & { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; address?: BuildingAddressCandidate | null; addressLabel?: string | null };
export type VerificationLocationContext = { listingAddress: Geopoint['address']; locationConfidence?: number | null; geocoderSource?: string | null; manuallyAdjusted?: boolean; existingVerifiedAsset?: boolean; isPrivateOrApproximate?: boolean; coordinateIsValid?: boolean };
export type RankedBuildingCandidate = VerificationCandidateInput & { score: number; confidence: number; addressScore: BuildingAddressScore; reasons: string[] };
export type BuildingVerificationDecision = {
  outcome: BuildingVerificationOutcome;
  confidence: number;
  autoAccept: boolean;
  autoAcceptMethod: 'exact_address_and_pin' | 'authoritative_unique_pin' | null;
  candidate: RankedBuildingCandidate | null;
  runnerUp: RankedBuildingCandidate | null;
  scoreGap: number | null;
  reasons: string[];
  evidence: { candidateCount: number; authoritativeLocation: boolean; locationConfidence: number | null; geocoderSource: string | null };
};

/**
 * Conservative, reviewable policy. Nearest-footprint distance is never enough.
 * The exact-address branch requires independent address, locality, pin and
 * runner-up agreement. The authoritative-pin branch is only for a high-quality
 * manual/official coordinate inside one uniquely dominant footprint when the
 * provider address is incomplete rather than contradictory.
 */
export const BUILDING_AUTO_ACCEPT_POLICY = Object.freeze({
  exactAddress: Object.freeze({ minimumStreetSimilarity: 0.78, maximumPinToFootprintMeters: 6, minimumScoreGap: 18, minimumCandidateScore: 82, minimumLocationMatches: 2 }),
  authoritativePin: Object.freeze({ minimumLocationConfidence: 0.97, maximumPinToFootprintMeters: 1.5, minimumScoreGap: 24, minimumCandidateScore: 76 }),
  ambiguity: Object.freeze({ maximumDefinitiveGap: 12, minimumRunnerUpScore: 55 }),
  probable: Object.freeze({ minimumCandidateScore: 66, maximumPinToFootprintMeters: 35 }),
  pinMismatch: Object.freeze({ minimumDistanceMeters: 60 }),
});

const STREET_ALIASES: Array<[RegExp, string]> = [
  [/\b(st|st\.|street)\b/g, 'street'], [/\b(rd|rd\.|road)\b/g, 'road'],
  [/\b(ave|ave\.|avenue)\b/g, 'avenue'], [/\b(blvd|blvd\.|boulevard)\b/g, 'boulevard'],
  [/\b(hwy|highway)\b/g, 'highway'], [/\b(dr|dr\.|drive)\b/g, 'drive'],
  [/\b(ln|ln\.|lane)\b/g, 'lane'], [/\b(ct|ct\.|court)\b/g, 'court'],
  [/\b(pkwy|parkway)\b/g, 'parkway'],
];

export const normalizeAddressText = (value: string | undefined): string => {
  let normalized = (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [pattern, replacement] of STREET_ALIASES) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim();
};

const HOUSE_NUMBER_RE = /\b\d+[a-z]?(?:[-/]\d+[a-z]?)?\b/i;
export const extractHouseNumber = (value: string | undefined): string => (value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .match(HOUSE_NUMBER_RE)?.[0] ?? '';
const stripHouseNumber = (value: string | undefined): string => {
  const houseNumber = extractHouseNumber(value);
  return normalizeAddressText(houseNumber ? (value ?? '').replace(HOUSE_NUMBER_RE, ' ') : value);
};
const parseHouseNumberRange = (value: string): { start: number; end: number; suffix: string } | null => {
  const match = value.match(/^(\d+)([a-z]?)(?:[-/](\d+)[a-z]?)?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[3] ? Number(match[3]) : start;
  return { start: Math.min(start, end), end: Math.max(start, end), suffix: match[2] ?? '' };
};
export const houseNumbersMatch = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  if (left === right) return true;
  const a = parseHouseNumberRange(left);
  const b = parseHouseNumberRange(right);
  return Boolean(a && b && !(a.suffix && b.suffix && a.suffix !== b.suffix) && a.start <= b.end && b.start <= a.end);
};
export const tokenSimilarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(a.split(' ').filter((token) => token.length > 1));
  const bTokens = new Set(b.split(' ').filter((token) => token.length > 1));
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  aTokens.forEach((token) => { if (bTokens.has(token)) intersection += 1; });
  return intersection / Math.max(aTokens.size, bTokens.size);
};
const sameText = (a: string | undefined, b: string | undefined): boolean => {
  const left = normalizeAddressText(a); const right = normalizeAddressText(b);
  return Boolean(left && right && left === right);
};

export const scoreBuildingAddressCandidate = (
  listingAddress: Geopoint['address'], candidate: BuildingAddressCandidate,
  context: { distanceMeters?: number | null; pinIntersects?: boolean } = {},
): BuildingAddressScore => {
  const reasons: string[] = [];
  let score = 0;
  const listingHouse = extractHouseNumber(listingAddress.addressLine1 ?? '');
  const candidateHouse = extractHouseNumber(candidate.houseNumber);
  const streetSimilarity = tokenSimilarity(stripHouseNumber(listingAddress.addressLine1), normalizeAddressText(candidate.road));
  const houseNumberMatch = houseNumbersMatch(listingHouse, candidateHouse);
  const houseNumberConflict = Boolean(listingHouse && candidateHouse && !houseNumberMatch);
  const cityMatch = sameText(listingAddress.city, candidate.city);
  const postalCodeMatch = sameText(listingAddress.postalCode, candidate.postalCode);
  const countryMatch = sameText(listingAddress.country, candidate.country);
  if (houseNumberMatch) { score += 40; reasons.push('house number matches'); }
  else if (houseNumberConflict) { score -= 32; reasons.push(`house number conflicts (${candidate.houseNumber})`); }
  else if (!listingHouse) score += 4;
  else reasons.push('candidate has no mapped house number');
  score += streetSimilarity * 32;
  if (streetSimilarity >= 0.78) reasons.push('street name strongly matches');
  else if (streetSimilarity >= 0.5) reasons.push('street name is similar');
  else if (candidate.road && listingAddress.addressLine1) reasons.push('street name does not match');
  if (postalCodeMatch) { score += 8; reasons.push('postal code matches'); }
  if (cityMatch) { score += 6; reasons.push('city matches'); }
  if (countryMatch) { score += 3; reasons.push('country matches'); }
  if (context.pinIntersects) { score += 8; reasons.push('pin intersects footprint'); }
  const distance = context.distanceMeters;
  if (typeof distance === 'number' && Number.isFinite(distance)) {
    if (distance <= 3) score += 7; else if (distance <= 8) score += 5; else if (distance <= 20) score += 2; else if (distance > 60) score -= 8;
  }
  score = Math.max(0, Math.min(100, score));
  const exactAddress = houseNumberMatch && streetSimilarity >= BUILDING_AUTO_ACCEPT_POLICY.exactAddress.minimumStreetSimilarity;
  const confidence = Math.max(0, Math.min(1, exactAddress ? Math.max(0.9, score / 100) : score / 100));
  return { score, confidence, houseNumberMatch, houseNumberConflict, streetSimilarity, cityMatch, postalCodeMatch, countryMatch, reasons };
};

const AUTHORITATIVE_SOURCE_TOKENS = ['manual', 'google-business', 'google-maps', 'official-site', 'official_club', 'government', 'licensing', 'user-verified'];
export const isAuthoritativeLocationSource = (source: string | null | undefined, manuallyAdjusted = false): boolean => {
  if (manuallyAdjusted) return true;
  const normalized = normalizeAddressText(source ?? '');
  return AUTHORITATIVE_SOURCE_TOKENS.some((token) => normalized.includes(normalizeAddressText(token)));
};

const rankCandidate = (candidate: VerificationCandidateInput, context: VerificationLocationContext): RankedBuildingCandidate => {
  const addressScore = scoreBuildingAddressCandidate(context.listingAddress, candidate.address ?? {}, { distanceMeters: candidate.pinToFootprintMeters, pinIntersects: candidate.pinIntersects });
  let score = addressScore.score;
  const reasons = [...addressScore.reasons];
  if (candidate.pinIntersects) { score += 10; reasons.push('stored coordinate falls inside this individual footprint'); }
  else if (candidate.pinToFootprintMeters <= 3) score += 7;
  else if (candidate.pinToFootprintMeters <= 8) score += 4;
  else if (candidate.pinToFootprintMeters > BUILDING_AUTO_ACCEPT_POLICY.pinMismatch.minimumDistanceMeters) score -= 12;
  if (candidate.pinToCentroidMeters <= 30) score += 3;
  if ((context.locationConfidence ?? 0) >= 0.95) score += 2;
  score = Math.max(0, Math.min(100, score));
  return { ...candidate, score, confidence: Math.max(addressScore.confidence, score / 100), addressScore, reasons };
};

export const evaluateBuildingVerification = (candidates: VerificationCandidateInput[], context: VerificationLocationContext): BuildingVerificationDecision => {
  const authoritativeLocation = isAuthoritativeLocationSource(context.geocoderSource, context.manuallyAdjusted);
  const evidence = { candidateCount: candidates.length, authoritativeLocation, locationConfidence: context.locationConfidence ?? null, geocoderSource: context.geocoderSource ?? null };
  const result = (outcome: BuildingVerificationOutcome, confidence: number, reasons: string[], candidate: RankedBuildingCandidate | null = null, runnerUp: RankedBuildingCandidate | null = null, autoAccept = false, autoAcceptMethod: BuildingVerificationDecision['autoAcceptMethod'] = null): BuildingVerificationDecision => ({ outcome, confidence, autoAccept, autoAcceptMethod, candidate, runnerUp, scoreGap: candidate ? (runnerUp ? candidate.score - runnerUp.score : null) : null, reasons, evidence });
  if (context.isPrivateOrApproximate) return result('private_or_approximate_skipped', 1, ['precise private or intentionally approximate locations are excluded']);
  if (context.existingVerifiedAsset) return result('has_verified_asset', 1, ['an existing verified or manually authored asset is preserved']);
  if (context.coordinateIsValid === false) return result('needs_location_review', 0, ['stored coordinate is missing or invalid']);
  if (!candidates.length) return result('no_building_data', 0, ['provider returned no usable individual building footprints']);
  const ranked = candidates.map((item) => rankCandidate(item, context)).sort((a, b) => b.score - a.score || a.pinToFootprintMeters - b.pinToFootprintMeters || a.fingerprint.localeCompare(b.fingerprint));
  const candidate = ranked[0]; const runnerUp = ranked[1] ?? null;
  const scoreGap = runnerUp ? candidate.score - runnerUp.score : Number.POSITIVE_INFINITY;
  const address = candidate.addressScore;
  const localityMatches = [address.cityMatch, address.postalCodeMatch, address.countryMatch].filter(Boolean).length;
  const noContradiction = !address.houseNumberConflict && !(candidate.address?.road && address.streetSimilarity < 0.35);
  const exactAddressTier = address.houseNumberMatch && address.streetSimilarity >= BUILDING_AUTO_ACCEPT_POLICY.exactAddress.minimumStreetSimilarity && localityMatches >= BUILDING_AUTO_ACCEPT_POLICY.exactAddress.minimumLocationMatches && (candidate.pinIntersects || candidate.pinToFootprintMeters <= BUILDING_AUTO_ACCEPT_POLICY.exactAddress.maximumPinToFootprintMeters) && candidate.score >= BUILDING_AUTO_ACCEPT_POLICY.exactAddress.minimumCandidateScore && scoreGap >= BUILDING_AUTO_ACCEPT_POLICY.exactAddress.minimumScoreGap && noContradiction;
  if (exactAddressTier) return result('verified', candidate.confidence, ['exact normalized address agrees with the footprint address', 'pin agrees within the strict tolerance', runnerUp ? `candidate outranks runner-up by ${scoreGap.toFixed(1)} points` : 'no competing footprint has comparable evidence'], candidate, runnerUp, true, 'exact_address_and_pin');
  const authoritativePinTier = authoritativeLocation && (context.locationConfidence ?? 0) >= BUILDING_AUTO_ACCEPT_POLICY.authoritativePin.minimumLocationConfidence && candidate.pinIntersects && candidate.pinToFootprintMeters <= BUILDING_AUTO_ACCEPT_POLICY.authoritativePin.maximumPinToFootprintMeters && candidate.score >= BUILDING_AUTO_ACCEPT_POLICY.authoritativePin.minimumCandidateScore && scoreGap >= BUILDING_AUTO_ACCEPT_POLICY.authoritativePin.minimumScoreGap && noContradiction;
  if (authoritativePinTier) return result('verified', Math.max(0.96, candidate.confidence), ['authoritative coordinate falls inside one unique footprint', 'mapped address is incomplete but not contradictory', runnerUp ? `candidate outranks runner-up by ${scoreGap.toFixed(1)} points` : 'no competing footprint has comparable evidence'], candidate, runnerUp, true, 'authoritative_unique_pin');
  if (address.houseNumberConflict && address.streetSimilarity >= 0.5) return result('address_mismatch', candidate.confidence, ['candidate is on the expected street but has a conflicting house number'], candidate, runnerUp);
  if (runnerUp && runnerUp.score >= BUILDING_AUTO_ACCEPT_POLICY.ambiguity.minimumRunnerUpScore && scoreGap < BUILDING_AUTO_ACCEPT_POLICY.ambiguity.maximumDefinitiveGap) return result('ambiguous', candidate.confidence, [`top two footprints are separated by only ${scoreGap.toFixed(1)} points`], candidate, runnerUp);
  if (candidate.pinToFootprintMeters >= BUILDING_AUTO_ACCEPT_POLICY.pinMismatch.minimumDistanceMeters) return result('pin_mismatch', candidate.confidence, [`best footprint is ${candidate.pinToFootprintMeters.toFixed(1)}m from the stored pin`], candidate, runnerUp);
  if (candidate.score >= BUILDING_AUTO_ACCEPT_POLICY.probable.minimumCandidateScore && candidate.pinToFootprintMeters <= BUILDING_AUTO_ACCEPT_POLICY.probable.maximumPinToFootprintMeters && noContradiction) return result('probable', candidate.confidence, ['evidence favors one footprint but does not satisfy auto-accept'], candidate, runnerUp);
  return result('needs_location_review', candidate.confidence, ['available evidence is insufficient for a building-level decision'], candidate, runnerUp);
};

export type AutoPersistencePlan = { shouldPersist: boolean; mode: 'shadow' | 'enabled'; reason: string; candidateFingerprint: string | null; method: BuildingVerificationDecision['autoAcceptMethod'] };
export const planAutomaticBuildingPersistence = (decision: BuildingVerificationDecision, options: { mode?: 'shadow' | 'enabled'; existingAsset?: boolean; isPrivateOrApproximate?: boolean } = {}): AutoPersistencePlan => {
  const mode = options.mode ?? 'shadow';
  if (options.isPrivateOrApproximate) return { shouldPersist: false, mode, reason: 'private or approximate listing is never persisted precisely', candidateFingerprint: null, method: null };
  if (options.existingAsset) return { shouldPersist: false, mode, reason: 'existing manually authored asset is never replaced automatically', candidateFingerprint: null, method: null };
  if (!decision.autoAccept || !decision.candidate) return { shouldPersist: false, mode, reason: 'decision does not satisfy the definitive acceptance policy', candidateFingerprint: decision.candidate?.fingerprint ?? null, method: null };
  if (mode === 'shadow') return { shouldPersist: false, mode, reason: 'shadow mode records the proposal without writing', candidateFingerprint: decision.candidate.fingerprint, method: decision.autoAcceptMethod };
  return { shouldPersist: true, mode, reason: 'definitive tier enabled and no preservation guard applies', candidateFingerprint: decision.candidate.fingerprint, method: decision.autoAcceptMethod };
};

export const toBuildingVerificationMeta = (decision: BuildingVerificationDecision, checkedAt = new Date().toISOString()): BuildingVerificationMeta => ({
  status: decision.outcome === 'verified' ? 'confirmed' : decision.outcome === 'probable' ? 'probable' : decision.outcome === 'private_or_approximate_skipped' ? 'skipped' : decision.outcome === 'address_mismatch' || decision.outcome === 'pin_mismatch' ? 'mismatch' : 'unconfirmed',
  checkedAt, confidence: decision.confidence, candidateAddress: decision.candidate?.addressLabel ?? undefined,
  distanceMeters: decision.candidate?.pinToFootprintMeters, pinIntersects: decision.candidate?.pinIntersects,
  providerFeatureIds: decision.candidate?.providerFeatureIds, footprintFingerprint: decision.candidate?.fingerprint,
  method: decision.autoAcceptMethod ?? 'human_review', outcome: decision.outcome, scoreGap: decision.scoreGap ?? undefined,
  notes: decision.reasons,
});

export const getBuildingVerificationForListing = (listing: Listing, collections: EntityCollections = {}): BuildingVerificationMeta | undefined => getVenueForListing(listing, collections)?.locationMeta?.buildingVerification ?? listing.locationMeta?.buildingVerification;
export const buildingVerificationNeedsReview = (verification: BuildingVerificationMeta | undefined): boolean => verification?.status === 'mismatch' || verification?.status === 'unconfirmed';
export const listingHasExactBuildingAddress = (listing: Listing, collections: EntityCollections = {}): boolean => {
  const address = getListingPhysicalAddress(listing, collections);
  return Boolean(address.addressLine1?.trim() && extractHouseNumber(address.addressLine1));
};
