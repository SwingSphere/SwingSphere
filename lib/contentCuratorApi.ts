import type { ClubData, EventData, Listing } from '../types';
import { makeEventPublicSlug } from './eventPublicSlug';

export type CuratorCommandType =
  | 'candidate_approve'
  | 'candidate_stage_submission'
  | 'candidate_mark_ready_to_publish'
  | 'candidate_record_publication'
  | 'candidate_record_publication_failure'
  | 'candidate_reject'
  | 'candidate_request_changes'
  | 'candidate_defer'
  | 'candidate_update_fields'
  | 'candidate_override_significance'
  | 'community_candidate_approve'
  | 'community_candidate_reject'
  | 'community_candidate_defer'
  | 'artwork_approve'
  | 'artwork_reject'
  | 'artwork_regenerate'
  | 'artwork_select_version'
  | 'artwork_select_extracted'
  | 'candidate_select_extracted_media'
  | 'media_record_upload'
  | 'source_update_schedule'
  | 'source_request_scan'
  | 'agent_run_discovery'
  | 'agent_sync_bridge'
  | 'job_pause_all'
  | 'job_resume_all';

export interface CuratorPlayPartyEligibility {
  status: 'qualifying_play_party' | 'ambiguous_requires_human_review' | 'excluded_non_play_event' | 'non_play_flagged' | string;
  activityCategory?: string;
  qualified: boolean;
  requiresHumanReview: boolean;
  suppressFromIngestion?: boolean;
  confidence: 'high' | 'medium' | 'low' | string;
  matchedSignals: string[];
  ambiguitySignals: string[];
  exclusionReasons?: string[];
  missingEvidence?: string[];
  registrationMethod?: string | null;
  registrationMethodLabel?: string | null;
  sourceQuality?: {
    classification: 'limited_detail_calendar' | 'standard_calendar' | string;
    label: string;
    requiresStricterVerification: boolean;
    lacksDedicatedEventPages?: boolean;
    lacksDirectPublicTicketUrls?: boolean;
    lacksPromotionalFlyers?: boolean;
    defaultRegistrationMethod?: string | null;
    defaultRegistrationLabel?: string | null;
    defaultRegistrationUrl?: string | null;
  } | null;
  rationale?: string;
  reason: string;
}

export type CuratorSignificanceCategory =
  | 'special_event'
  | 'monthly_signature'
  | 'weekly_signature'
  | 'routine_club_night'
  | 'needs_human_review';

export type CuratorQueueSignificanceFilter =
  | 'recommended'
  | 'special_event'
  | 'monthly_signature'
  | 'weekly_signature'
  | 'routine_club_night'
  | 'needs_human_review'
  | 'all';

export interface CuratorEventSignificance {
  category: CuratorSignificanceCategory;
  categoryLabel: string;
  fullCategoryLabel: string;
  priorityRank: number;
  confidence: 'high' | 'medium' | 'low' | string;
  recurrenceFrequency:
    | 'one_time'
    | 'annual'
    | 'quarterly'
    | 'monthly'
    | 'biweekly'
    | 'weekly'
    | 'multiple_per_week'
    | 'irregular'
    | 'unknown'
    | string;
  recurrenceLabel: string;
  seriesKey?: string;
  seriesOccurrenceCount?: number;
  observedDates?: string[];
  medianIntervalDays?: number | null;
  descriptionRepeatRatio?: number;
  fallsOnRegularWeeklySlot?: boolean;
  lacksAdequateEvidence: boolean;
  requiresHumanReview: boolean;
  playPartyEligible: boolean;
  recommendedForQueue: boolean;
  summaryReason: string;
  missingInformationExplanation?: string | null;
  missingEvidenceItems?: string[];
  registrationMethod?: string | null;
  registrationMethodLabel?: string | null;
  sourceQuality?: {
    classification: 'limited_detail_calendar' | 'standard_calendar' | string;
    label?: string;
    requiresStricterVerification?: boolean;
    lacksDedicatedEventPages?: boolean;
    lacksDirectPublicTicketUrls?: boolean;
    lacksPromotionalFlyers?: boolean;
  } | null;
  supportingEvidence: string[];
  routineSignals: string[];
  uncertaintyReasons: string[];
  weeklySignatureEvaluation?: {
    explicitlyPlayParty: boolean;
    dedicatedBrandingOrAudience: boolean;
    programmingBeyondNormalAdmission: boolean;
    presentedAsSignificantGathering: boolean;
    credibleReasonForSeparateListing: boolean;
  } | null;
  classifiedAt: string;
  classifierVersion: string;
  manualOverride?: {
    overridden: boolean;
    category: CuratorSignificanceCategory;
    notes?: string | null;
    overriddenBy?: string;
    overriddenAt?: string;
    commandId?: string;
  } | null;
}

export const SIGNIFICANCE_CATEGORY_META: Record<
  CuratorSignificanceCategory,
  {
    id: CuratorSignificanceCategory;
    shortLabel: string;
    fullLabel: string;
    priorityRank: number;
    badgeTone: 'red' | 'emerald' | 'sky' | 'amber' | 'slate';
  }
> = {
  special_event: {
    id: 'special_event',
    shortLabel: 'Special Event',
    fullLabel: 'Special Event — High Priority',
    priorityRank: 1,
    badgeTone: 'red',
  },
  monthly_signature: {
    id: 'monthly_signature',
    shortLabel: 'Monthly / Periodic',
    fullLabel: 'Monthly or Periodic Signature Event — Include',
    priorityRank: 2,
    badgeTone: 'emerald',
  },
  weekly_signature: {
    id: 'weekly_signature',
    shortLabel: 'Weekly Signature',
    fullLabel: 'Weekly Signature Event — Conditional',
    priorityRank: 3,
    badgeTone: 'sky',
  },
  needs_human_review: {
    id: 'needs_human_review',
    shortLabel: 'Needs Review',
    fullLabel: 'Needs Human Review',
    priorityRank: 4,
    badgeTone: 'amber',
  },
  routine_club_night: {
    id: 'routine_club_night',
    shortLabel: 'Routine Night',
    fullLabel: 'Routine Club Night — Low Priority',
    priorityRank: 5,
    badgeTone: 'slate',
  },
};

export interface CuratorCommunityCandidateRecord {
  id: string;
  name: string;
  entityType: 'club' | 'promoter' | 'community' | 'host' | string;
  website: string | null;
  calendarUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  location: string | null;
  qualifyingEventEvidence: Array<{
    eventTitle: string;
    eventDate: string | null;
    sourceUrl: string | null;
    playPartySignals: string[];
    eligibilityStatus: string;
    snippet: string;
  }>;
  discoveryStrategy: string;
  discoverySource: {
    url: string | null;
    profileId?: string | null;
    profileName?: string | null;
    method: string;
    discoveredAt: string;
  };
  confidence: 'high' | 'medium' | 'low' | string;
  verificationStatus: string;
  possibleDatabaseMatches: Array<{
    id: string;
    name: string;
    entityType: string;
    similarity: number;
    matchReason: string;
  }>;
  reviewState: 'pending_review' | 'approved' | 'rejected' | 'deferred' | string;
  reviewDecision?: {
    status: string;
    reviewedBy: string;
    reviewedAt: string;
    notes?: string;
    commandId?: string;
  } | null;
  publicChangeAuthorized: boolean;
  firstDiscoveredAt: string;
  updatedAt: string;
}

export interface CuratorFieldDiff {
  field: string;
  label: string;
  originalValue: unknown;
  proposedValue: unknown;
  changed: boolean;
  inferred: boolean;
  evidence: {
    sourceUrl: string | null;
    context: string | null;
    rawValue: string | null;
    verifiedAt: string | null;
    method: string | null;
  } | null;
}

export interface CuratorCandidateWarning {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface CuratorDiscoveredImage {
  url: string;
  originalUrl?: string | null;
  highResUrl: string | null;
  previewUrl?: string | null;
  associatedEventUrl: string | null;
  sourcePageUrl?: string | null;
  mediaClassification?:
    | 'official_event_flyer'
    | 'event_promo'
    | 'event_hero'
    | 'organizer_logo'
    | 'venue_logo'
    | 'event_photo_gallery'
    | 'venue_promo'
    | 'generic_decoration'
    | string;
  priorityRank?: number;
  confidenceScore?: number;
  extractionMethod?: string | null;
  width: number | null;
  height: number | null;
  dimensions?: string | null;
  aspectRatio: string | null;
  localFilename?: string | null;
  localPath?: string | null;
  fileHash?: string | null;
  sourceRole: string;
  relevance: 'event_specific' | 'series_specific' | 'generic_club' | string;
  associationType?: 'event' | 'organizer' | 'venue' | string;
  rightsStatus: string;
  alt: string | null;
  evidence: {
    sourceUrl: string | null;
    context: string | null;
    rawValue: string | null;
    verifiedAt: string | null;
    method: string | null;
  } | null;
  visualAnalysis?: {
    inferredTheme: string;
    atmosphere: string;
    visualMotifs: string[];
    paletteCues: string[];
    stylisticDirection: string;
  } | null;
}

export type CuratorMediaExtractionStatus =
  | 'Official Flyer Found'
  | 'Additional Images Found'
  | 'No Official Flyer Available'
  | 'Image Extraction Failed'
  | 'Image Requires Review'
  | string;

export interface CuratorMediaExtractionSummary {
  platform?: string | null;
  status: CuratorMediaExtractionStatus;
  statusCode?: string | null;
  secondaryStatuses?: string[];
  hasOfficialFlyer?: boolean;
  hasAdditionalImages?: boolean;
  requiresReview?: boolean;
  officialFlyer?: CuratorDiscoveredImage | null;
  additionalMedia?: CuratorDiscoveredImage[];
  candidates?: CuratorDiscoveredImage[];
  diagnostics?: {
    totalCandidatesInspected?: number;
    validCandidatesCount?: number;
    excludedDecorationCount?: number;
    extractionFailed?: boolean;
    failureReason?: string | null;
    requiresJsRendering?: boolean;
    lowConfidenceSelection?: boolean;
    noRelevantMediaDiscovered?: boolean;
  } | null;
}

export interface CuratorSelectedExtractedMedia {
  url: string;
  highResUrl?: string | null;
  originalUrl?: string | null;
  previewUrl?: string | null;
  classification: string;
  dimensions?: string | null;
  aspectRatio?: string | null;
  localPath?: string | null;
  fileHash?: string | null;
  previewRole?: string | null;
  selectedBy?: string;
  selectedAt?: string;
}

export interface CuratorStatusMatrix {
  discovery: 'discovered';
  eventData: 'incomplete' | 'partially_complete' | 'complete' | 'excluded_non_event';
  artwork:
    | 'not_started'
    | 'official_reference_found'
    | 'brief_ready'
    | 'generated_pending_review'
    | 'regeneration_requested'
    | 'approved'
    | 'rejected';
  publication:
    | 'not_published'
    | 'already_published'
    | 'correction_pending'
    | 'ready_for_admin_approval'
    | 'approved_for_publication'
    | 'ready_to_publish'
    | 'published'
    | 'publish_failed'
    | 'pending_review'
    | 'excluded'
    | string;
  updatedAt?: string;
}

export interface CuratorEventDetails {
  theme?: string | null;
  atmosphere?: string | null;
  activities?: string[];
  dressCode?: string | null;
  eligibility?: string | null;
  membershipRequirement?: string | null;
  admission?: {
    raw: string | null;
    tiers: Array<{ category: string; label: string; price: string }>;
  } | string | null;
  rsvpRequirement?: string | null;
  ageRequirement?: string | null;
  scheduleChanges?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface CuratorCandidateRecord {
  id: string;
  title: string;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  clubId: string | null;
  clubName: string;
  hostId: string | null;
  hostName: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  sourceUrl: string | null;
  ticketUrl: string | null;
  rsvpUrl: string | null;
  registrationMethod?: string | null;
  registrationMethodLabel?: string | null;
  sourceQuality?: {
    classification: 'limited_detail_calendar' | 'standard_calendar' | string;
    label?: string;
    requiresStricterVerification?: boolean;
    lacksDedicatedEventPages?: boolean;
    lacksDirectPublicTicketUrls?: boolean;
    lacksPromotionalFlyers?: boolean;
  } | null;
  flyerUrl: string | null;
  description: string | null;
  displayDescription?: string | null;
  sourceDescription?: {
    text: string;
    rawText: string;
    paragraphs: string[];
    sourceUrl: string | null;
    context: string | null;
    method: string | null;
    capturedAt: string | null;
  } | null;
  eventDetails?: CuratorEventDetails | null;
  theme?: string | null;
  atmosphere?: string | null;
  activities?: string[];
  dressCode?: string | null;
  membershipRequirement?: string | null;
  rsvpRequirement?: string | null;
  ageRequirement?: string | null;
  scheduleChanges?: string | null;
  discoveredImages?: CuratorDiscoveredImage[];
  platform?: string | null;
  mediaExtractionStatus?: CuratorMediaExtractionStatus | null;
  mediaExtractionStatusCode?: string | null;
  mediaExtraction?: CuratorMediaExtractionSummary | null;
  extractedMedia?: CuratorMediaExtractionSummary | null;
  selectedExtractedMedia?: CuratorSelectedExtractedMedia | null;
  statusMatrix?: CuratorStatusMatrix;
  mediaPriority?: {
    score: number;
    tier: 'high' | 'medium' | 'low' | 'excluded' | string;
    reasons: string[];
  } | null;
  admission: string | null;
  restrictions: string | null;
  series: string | null;
  recurrence: string | null;
  candidateType: 'event' | 'closure_notice' | 'duplicate_translation' | string;
  isClosureNotice: boolean;
  reconciliationState: 'new' | 'correction_proposed' | 'possible_duplicate' | 'duplicate_translation' | string;
  duplicateClassification?:
    | 'canonical_destination_event'
    | 'canonical_branch_event'
    | 'canonical_event'
    | 'affiliate_referral_duplicate'
    | 'multi_branch_shared_domain_duplicate'
    | 'same_club_duplicate'
    | 'cross_source_duplicate'
    | 'duplicate_translation'
    | string
    | null;
  canonicalCandidateId?: string | null;
  duplicateOfCandidateId?: string | null;
  affiliateDuplicateIds?: string[];
  affiliatePromoters?: Array<{
    profileId: string;
    name: string | null;
    city: string | null;
    referralUrl: string | null;
    referralCode: string | null;
    role: string | null;
  }>;
  canonicalOrganizerUrl?: string | null;
  entityAttribution?: {
    role?: string;
    officialOrganizer?: string | null;
    venueOperator?: string | null;
    isExternalDestinationEvent?: boolean;
    isAffiliateReferral?: boolean;
    isMultiBranchMismatch?: boolean;
    canonicalMlEventId?: string | null;
    affiliateReferralCode?: string | null;
  } | null;
  matchedExistingId: string | null;
  matchedExistingTitle: string | null;
  auditCategory: string | null;
  auditReason: string | null;
  missingFields: string[];
  inferredFields: Array<{
    field: string;
    method: string;
    rawValue: string | null;
    verifiedAt: string | null;
    beyondSixMonthsReview: boolean;
  }>;
  warnings: CuratorCandidateWarning[];
  fieldDiffs: CuratorFieldDiff[];
  evidenceSummary: Array<{
    field: string;
    sourceUrl: string | null;
    context: string | null;
    rawValue: string | null;
    verifiedAt: string | null;
    method: string | null;
  }>;
  capturePages: Array<{
    url: string | null;
    capturedAt: string | null;
    sha256: string | null;
  }>;
  reviewState:
    | 'pending_review'
    | 'approved'
    | 'ready_to_publish'
    | 'published'
    | 'publish_failed'
    | 'staged_in_submissions'
    | 'rejected'
    | 'deferred'
    | 'changes_requested'
    | 'possible_duplicate'
    | 'not_for_publication'
    | 'historical_not_for_publication'
    | 'excluded_closure_notice'
    | 'excluded_duplicate_translation';
  publicSlug?: string | null;
  playPartyEligibility?: CuratorPlayPartyEligibility | null;
  eventSignificance?: CuratorEventSignificance | null;
  customFlyerUrl?: string | null;
  customHeaderUrl?: string | null;
  customArtworkLocked?: boolean;
  replaceExistingArtwork?: boolean;
  publishEligible?: boolean;
  archivedAsHistorical?: boolean;
  archivedAt?: string | null;
  archivedReason?: string | null;
  reviewFlags?: string[];
  contentHash?: string | null;
  needsPublish?: boolean;
  explicitUpdateApproved?: boolean;
  manuallyEditedFields?: string[];
  unreviewedSourceUpdates?: Array<Record<string, unknown>>;
  publicationRecord?: {
    status: 'ready_to_publish' | 'published' | 'publish_failed' | string;
    publishedListingId?: string | null;
    publishedAt?: string | null;
    publishedBy?: string | null;
    publishedContentHash?: string | null;
    operationType?: 'insert' | 'update' | string;
    uploadedMedia?: {
      mediaId?: string;
      versionId?: string;
      flyerUrl?: string | null;
      heroUrl?: string | null;
    } | null;
    lastAttemptedAt?: string | null;
    lastError?: string | null;
    attemptCount?: number;
    history?: Array<Record<string, unknown>>;
  } | null;
  reviewDecision: {
    status: string;
    reviewedBy: string;
    reviewedAt: string;
    notes?: string;
    deferredUntil?: string | null;
    overridePlayPartyEligibility?: boolean;
    publishedListingId?: string | null;
    approvedContentHash?: string | null;
    lastPublishError?: string | null;
    lastPublishAttemptAt?: string | null;
    moderationWorkflow?: string;
    flaggedFields?: string[];
    commandId?: string;
  } | null;
  publicChangeAuthorized: boolean;
  stagedMedia: {
    id: string;
    status: string;
    source?: string | null;
    mediaExtractionStatus?: CuratorMediaExtractionStatus | null;
    mediaExtractionStatusCode?: string | null;
    creativeProcess?: 'reference_first' | 'description_first' | string;
    styleFamily: string | null;
    medium?: string | null;
    layoutTemplate?: string | null;
    layoutTemplateName?: string | null;
    selectedVersionId: string;
    selectedFlyerVersionId?: string | null;
    selectedHeroVersionId?: string | null;
    flyerStyleCategory?: string | null;
    heroStyleCategory?: string | null;
    generationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
    flyerGenerationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
    heroGenerationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
    hasGeneratedPair: boolean;
    flyerSha256?: string | null;
    heroSha256?: string | null;
    uploadedAssets?: Record<
      string,
      {
        versionId?: string;
        uploadedAt?: string;
        flyer?: { deliveryUrl?: string | null; sha256?: string | null } | null;
        hero?: { deliveryUrl?: string | null; sha256?: string | null } | null;
      }
    > | null;
    flyerPreviewUrl: string | null;
    officialFlyerPreviewUrl?: string | null;
    additionalExtractedImages?: CuratorDiscoveredImage[];
    heroPreviewUrl: string | null;
  } | null;
  updatedAt: string | null;
}

export interface CuratorVisualCriterion {
  id: string;
  number: number;
  category?: 'technical' | 'aesthetic' | string;
  question: string;
  passed: boolean;
  status: string;
  notes: string;
}

export interface CuratorAppliedFacts {
  title: string;
  clubName: string;
  hostName: string | null;
  venueName: string;
  city: string | null;
  presentingLine: string;
  dateIso: string | null;
  dateFormatted: string;
  dateBadge: string;
  weekdayShort: string;
  timeFormatted: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  themeKicker: string | null;
  dressCode: string | null;
  eligibility: string | null;
  admission: string | null;
  rsvpOrMembership: string | null;
  calloutPills: string[];
  missingRequiredFacts: string[];
  hasMissingFacts: boolean;
}

export interface CuratorLogoSource {
  status: 'canonical_logo_loaded' | 'canonical_logo_url_configured' | 'missing_canonical_logo' | string;
  logoUrl: string | null;
  clubId: string | null;
  clubName: string | null;
  missingLogoFlag: boolean;
  fallbackTreatment: string | null;
  localCachePath?: string | null;
}

export interface CuratorQualityEvaluation {
  evaluatedAt: string;
  allPassed: boolean;
  passedCount: number;
  totalCriteria: number;
  technicalValidation: {
    passed: boolean;
    passedCount: number;
    total: number;
    checks: CuratorVisualCriterion[];
  };
  aestheticEvaluation: {
    passed: boolean;
    passedCount: number;
    total: number;
    checks: CuratorVisualCriterion[];
  };
  criteria: CuratorVisualCriterion[];
}

export interface CuratorClubIdentitySummary {
  clubId: string | null;
  clubName: string;
  hostName: string | null;
  city?: string | null;
  logoUrl: string | null;
  heroUrl: string | null;
  existingFlyerUrls: string[];
  brandColors: string[];
  brandMotifs: string[];
  officialReferences: string[];
  mediaPresentation: string;
  atmosphereSummary: string;
  usagePolicy: string;
}

export interface CuratorSensualityDirection {
  mode: string;
  rationale: string;
  atmosphereCues: string[];
  clubAlignment: string;
  sfwBoundary: string;
  avoidSubjects: string[];
}

export interface CuratorMediaVersion {
  versionId: string;
  versionNumber: number;
  createdAt: string | null;
  targetRole?: 'flyer' | 'hero' | 'both' | string;
  styleCategory?: string | null;
  styleCategoryLabel?: string | null;
  styleFamily: string | null;
  medium?: string | null;
  layoutTemplate?: string | null;
  layoutTemplateName?: string | null;
  regenerationLevel?: 'artwork' | 'layout' | 'typography' | string;
  generationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
  flyerGenerationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
  heroGenerationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
  flyerSha256?: string | null;
  heroSha256?: string | null;
  flyerPath?: string | null;
  heroPath?: string | null;
  composition: string | null;
  palette: string[];
  sensualityMode: string | null;
  status: string;
  feedback: Record<string, unknown> | null;
  visualEvaluation: {
    evaluatedAt: string;
    allPassed: boolean;
    passedCount: number;
    totalCriteria: number;
    readyForApproval: boolean;
    criteria: CuratorVisualCriterion[];
  } | null;
  qualityEvaluation?: CuratorQualityEvaluation | null;
  previewUrls: {
    flyer: string | null;
    hero: string | null;
    portraitOriginal: string | null;
    landscapeOriginal: string | null;
  } | null;
  assets: {
    flyer: { width: number; height: number; role: string; targetRatio: string; sha256: string | null } | null;
    hero: { width: number; height: number; role: string; targetRatio: string; sha256: string | null } | null;
  } | null;
}

export interface CuratorMediaItem {
  id: string;
  candidateId: string | null;
  eventId: string | null;
  eventTitle: string;
  eventDate: string | null;
  clubId: string | null;
  clubName: string;
  hostId: string | null;
  hostName: string | null;
  city: string | null;
  validationOnly: boolean;
  source: string;
  officialSourceArtworkUrl: string | null;
  discoveredImages?: CuratorDiscoveredImage[];
  designSkill?: string;
  designMode?: string;
  creativeProcess?: 'reference_first' | 'description_first' | string;
  officialImageAnalysis?: {
    inferredTheme: string;
    atmosphere: string;
    visualMotifs: string[];
    paletteCues: string[];
    stylisticDirection: string;
    referenceImageUrl?: string | null;
    sourceUrl?: string | null;
  } | null;
  descriptionAnalysis?: {
    theme: string;
    atmosphere: string;
    dressCode: string | null;
    activities: string[];
    audience: string | null;
    membershipRequirement: string | null;
    derivedMotifs: string[];
    styleSelectionRationale: string;
  } | null;
  existingCatalogArtwork: {
    flyer: string | null;
    hero: string | null;
  } | null;
  styleFamily: string | null;
  medium?: string | null;
  layoutTemplate?: string | null;
  layoutTemplateName?: string | null;
  composition: string | null;
  palette: string[];
  technique: string | null;
  motifs: string[];
  rationale: string | null;
  appliedFacts?: CuratorAppliedFacts | null;
  logoSource?: CuratorLogoSource | null;
  clubIdentity: CuratorClubIdentitySummary;
  sensualityDirection: CuratorSensualityDirection;
  provenance: string;
  status: string;
  selectedVersionId: string;
  selectedFlyerVersionId?: string | null;
  selectedHeroVersionId?: string | null;
  flyerStyleCategory?: string | null;
  heroStyleCategory?: string | null;
  generationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
  flyerGenerationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
  heroGenerationMode?: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' | string | null;
  hasGeneratedPair: boolean;
  generatedAt: string | null;
  attempts: number;
  knownLimitations: string[];
  nearDuplicates: string[];
  previewUrls: {
    flyer: string | null;
    hero: string | null;
    portraitOriginal: string | null;
    landscapeOriginal: string | null;
  } | null;
  dimensions: {
    flyer: { width: number; height: number; ratio: string } | null;
    hero: { width: number; height: number; ratio: string } | null;
  } | null;
  visualEvaluation: {
    evaluatedAt: string;
    allPassed: boolean;
    passedCount: number;
    totalCriteria: number;
    readyForApproval: boolean;
    criteria: CuratorVisualCriterion[];
  };
  qualityEvaluation?: CuratorQualityEvaluation | null;
  visualReview: {
    decision: string;
    artworkApproved?: boolean;
    reviewedAt?: string;
    reviewer?: string;
    notes?: string;
    versionId?: string;
    publicPublishingAuthorized: boolean;
  } | null;
  visualReviewNotes: Record<string, unknown> | null;
  versionHistory: CuratorMediaVersion[];
  revisionRequests: Array<{
    revisionId: string;
    requestedAt: string;
    requestedBy: string;
    regenerationLevel?: string;
    feedback: Record<string, unknown>;
    generatedImmediately: boolean;
    resultingVersionId: string | null;
    preservedEventTitle: string;
    preservedEventDate: string | null;
  }>;
  brief: Record<string, unknown>;
  eventReviewState: string;
  publicPublishingAuthorized: boolean;
}

export interface CuratorMonitoredSource {
  id: string;
  name: string;
  entityType: 'club' | 'promoter';
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  website: string | null;
  calendarUrl: string | null;
  missingWebsiteUrl?: boolean;
  missingEventSourceUrl?: boolean;
  alternativeSources: string[];
  allowedDomains: string[];
  adapter: string;
  classification: string | null;
  monitoringTier: 'high' | 'moderate' | 'normal' | 'low' | 'static';
  monitoringTierDescription: string | null;
  currentIntervalDays: number;
  scanFrequencyHours: number;
  adaptiveSchedulingEnabled: boolean;
  paused: boolean;
  isDueNow: boolean;
  lastSuccessfulScan: string | null;
  lastAttemptedScan: string | null;
  nextScanAt: string | null;
  discoveredEventsCount: number;
  upcomingCandidatesCount: number;
  correctionCandidatesCount: number;
  extractionStatus: 'ok' | 'partial' | 'failed' | 'unattempted' | 'paused';
  consecutiveFailures: number;
  consecutiveNoChangeScans: number;
  failureBackoffDays: number;
  pendingUrlsCount: number;
  cycleFailures: Array<{ url: string; reason: string }>;
  knownLimitations: string[];
  manualOverride: {
    intervalDays?: number | null;
    tier?: string | null;
    adaptiveEnabled?: boolean;
    paused?: boolean;
    forcedScanPending?: boolean;
    reason?: string;
    updatedAt?: string;
  } | null;
  scheduleAdjustmentHistory: Array<{
    at: string;
    type: string;
    previousTier?: string;
    nextTier?: string;
    previousIntervalDays?: number;
    nextIntervalDays?: number;
    reason?: string;
  }>;
  recentScans: Array<{
    attemptedAt: string | null;
    completedAt: string | null;
    status: string;
    discoveredCount: number;
    failureCount: number;
    failures: Record<string, string>;
  }>;
}

export interface CuratorCronJobSummary {
  id: string;
  name: string;
  command: string;
  description: string;
  enabled: boolean;
  schedule: {
    kind: string;
    expr: string;
    tz: string;
    humanLabel: string;
  };
  timeouts: {
    wallClockSeconds: number;
    noOutputSeconds: number;
  };
  schedulerOutcome: {
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastStatus: string;
    lastDurationMs: number | null;
    consecutiveErrors: number;
    lastError: string | null;
  };
  extractionOutcome: {
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    observedAt: string | null;
    failedSources: number;
    failedMedia: number;
    consecutiveErrors: number;
    error: string | null;
  };
  statusDistinctionNote: string;
}

export interface CuratorImageProviderInfo {
  provider: string;
  cliCommand: string;
  agent: string;
  model: string;
  requiresSeparateApiIntegration: boolean;
  description: string;
}

export interface CuratorCommandRecord {
  id: string;
  idempotencyKey: string;
  commandType: CuratorCommandType;
  targetId: string;
  status: 'queued' | 'processing' | 'acknowledged' | 'failed';
  createdAt: string;
  updatedAt: string;
  actor: string;
  attempts?: number;
  recoveredFromInterruption?: boolean;
  retriedAfterFailure?: boolean;
  auditTrail?: Array<{
    at: string;
    event: string;
    actor: string;
    status: string;
    idempotencyKey?: string;
    error?: string;
  }>;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface CuratorBridgeSyncSchedule {
  id?: string;
  name?: string;
  intervalMinutes: number;
  intervalMs?: number;
  cronExpression: string;
  timezone?: string;
  command?: string;
  triggersWebsiteScans: boolean;
  triggersEventExtraction: boolean;
  triggersImageGeneration: boolean;
  respectsWorkflowLocks?: boolean;
  deltaMetadataPushOnly: boolean;
  preservesLastSuccessTimestamp?: boolean;
  supportedAuthModes?: string[];
}

export interface CuratorDashboardSnapshot {
  connection: {
    agentId: string;
    displayName: string;
    status: 'connected' | 'degraded' | 'offline';
    bridgeMode: string;
    authoritativeOperationalStore: string;
    authoritativePublishedStore: string;
    lastSynchronizedAt: string;
    catalogSyncedAt: string | null;
    lastDeltaHash?: string | null;
    bridgeSyncSchedule?: CuratorBridgeSyncSchedule;
    bridgeSyncState?: Record<string, unknown> | null;
    machineCredentialStatus?: {
      activeTokenCount: number;
      lastUsedAt: string | null;
    };
    directPublishingEnabled: boolean;
    imageProvider?: CuratorImageProviderInfo;
    offlineReason?: string | null;
    activeLocks?: Array<{ name: string; pid: number; expires: number }>;
  };
  summary: {
    reviewQueue: {
      totalStaged: number;
      actionableEventCandidates: number;
      pendingReview: number;
      newEvents: number;
      proposedCorrections: number;
      possibleDuplicates: number;
      duplicateTranslations: number;
      closureNotices: number;
      historicalEvents: number;
      alreadyInCatalog: number;
      incompleteFacts: number;
      inferredYearCount: number;
      ambiguousPlayPartyCount?: number;
      approvedCount: number;
      readyToPublishCount?: number;
      publishedCount?: number;
      publishFailedCount?: number;
      pendingPublishCount?: number;
      rejectedCount: number;
      deferredCount?: number;
      changesRequestedCount: number;
    };
    communityCandidates?: {
      total: number;
      pendingReview: number;
      approved: number;
      rejected: number;
      deferred: number;
    };
    artwork: {
      total: number;
      generatedPairs: number;
      candidateGeneratedPairs: number;
      validationDiversityPairs: number;
      officialArtworkReview: number;
      briefReady: number;
      pendingVisualReview: number;
      approvedArtwork: number;
      rejectedArtwork: number;
      regenerationRequested: number;
    };
    sources: {
      total: number;
      clubs: number;
      promoters: number;
      dueNow: number;
      clubsCheckedRolling7d: number;
      sourcesCheckedRolling7d?: number;
      missingEventSourceUrlCount?: number;
      missingWebsiteCount?: number;
      successfulTotal: number;
      partialTotal: number;
      failedTotal: number;
      unattemptedTotal: number;
      pausedTotal: number;
      manualOverridesTotal: number;
      tierBreakdown: Record<string, number>;
    };
    jobs: {
      totalCronJobs: number;
      enabledCronJobs: number;
      openAlerts: number;
      resolvedAlerts: number;
      integrityWarnings: number;
      commandsAcknowledged: number;
    };
  };
  candidates: CuratorCandidateRecord[];
  communityCandidates?: CuratorCommunityCandidateRecord[];
  mediaItems: CuratorMediaItem[];
  creativeCatalog: {
    styles: Array<{
      id?: string;
      family: string;
      medium?: string;
      defaultTemplate?: string;
      themes: string[];
      palette: string[];
      paletteHex?: string[];
      composition: string;
      technique: string;
      motifs: string[];
      sensualityMode?: string;
      sensualityCues?: string[];
    }>;
    layoutTemplates?: Array<{
      id: string;
      name: string;
      category: string;
      description: string;
      stageACompositionCue?: string;
    }>;
    supportedDesignModes?: Array<{
      id: string;
      label: string;
      dimensions: string;
      description: string;
    }>;
    visualRelevanceCriteria: Array<{
      id: string;
      number: number;
      question: string;
      category: string;
    }>;
    qualityCriteria?: {
      technicalValidation: Array<{
        id: string;
        number: number;
        question: string;
        category: string;
      }>;
      aestheticEvaluation: Array<{
        id: string;
        number: number;
        question: string;
        category: string;
      }>;
    };
    sensualityTechniques: Array<{
      id: string;
      label: string;
      cues: string[];
    }>;
    imageProvider?: CuratorImageProviderInfo;
    monitoringTiers: Record<
      string,
      {
        defaultDays: number;
        minDays: number;
        maxDays: number;
        description: string;
      }
    >;
  };
  monitoredSources: CuratorMonitoredSource[];
  agentAndJobs: {
    cronJobs: CuratorCronJobSummary[];
    alerts: Array<{
      id: string;
      severity: string;
      type: string;
      clubId?: string;
      candidateId?: string;
      message: string;
      status: string;
      createdAt: string;
    }>;
    integrity: {
      checkedAt: string | null;
      warnings: Array<{ type: string; id: string; message?: string }>;
    };
    recentOperations: Array<Record<string, unknown>>;
    commandQueue: CuratorCommandRecord[];
  };
  viewerAdmin?: {
    userId: string;
    email: string | null;
  };
}

const SNAPSHOT_STORAGE_KEY = 'swingsphere:curator-last-snapshot';
let inMemoryCachedSnapshot: CuratorDashboardSnapshot | null = null;

export const setLastCachedCuratorSnapshot = (snapshot: CuratorDashboardSnapshot | null): void => {
  inMemoryCachedSnapshot = snapshot;
  if (typeof window !== 'undefined' && snapshot) {
    try {
      window.sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota errors
    }
  }
};

export const getLastCachedCuratorSnapshot = (): CuratorDashboardSnapshot | null => {
  if (inMemoryCachedSnapshot) return inMemoryCachedSnapshot;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CuratorDashboardSnapshot;
        inMemoryCachedSnapshot = parsed;
        return parsed;
      }
    } catch {
      // Ignore invalid cached JSON
    }
  }
  return null;
};

export const toOfflineSnapshotFallback = (
  previousSnapshot: CuratorDashboardSnapshot,
  reason = 'Local OpenClaw gateway is unreachable; displaying last synchronized snapshot.',
): CuratorDashboardSnapshot => {
  return {
    ...previousSnapshot,
    connection: {
      ...previousSnapshot.connection,
      status: 'offline',
      bridgeMode: 'supabase-mirror-offline-fallback',
      lastSynchronizedAt: previousSnapshot.connection.lastSynchronizedAt,
      offlineReason: reason,
    },
  };
};

const getCuratorRequestHeaders = async (): Promise<Headers> => {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });

  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token?.trim();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {
    // Continue to check dev-admin fallback in local development
  }

  if (
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    (window.localStorage.getItem('swingsphere:dev-admin') === 'true' ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname))
  ) {
    headers.set('X-SwingSphere-Dev-Admin', 'true');
  }

  return headers;
};

const ensureLocalPreviewUrl = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== 'string') return url ?? null;
  if (
    url.startsWith('/api/admin/curator/media-preview') &&
    !url.includes('adminPreview=1') &&
    isLocalCuratorEnvironment()
  ) {
    return `${url}${url.includes('?') ? '&' : '?'}adminPreview=1`;
  }
  return url;
};

export const normalizeCuratorDashboardSnapshot = (
  raw: Partial<CuratorDashboardSnapshot> | null | undefined,
): CuratorDashboardSnapshot => {
  const s = (raw || {}) as any;
  const rawCandidates: CuratorCandidateRecord[] = Array.isArray(s.candidates) ? s.candidates : [];
  const candidates: CuratorCandidateRecord[] = rawCandidates.map((c) => {
    const normalizedWarnings = Array.isArray(c.warnings)
      ? c.warnings.map((w: unknown) =>
          typeof w === 'string'
            ? w
            : w && typeof w === 'object'
              ? String((w as any).message || (w as any).reason || (w as any).type || JSON.stringify(w))
              : String(w || ''),
        )
      : [];
    const rawExtracted = (c.extractedMedia || c.mediaExtraction || null) as CuratorMediaExtractionSummary | null;
    const normalizedExtractedMedia: CuratorMediaExtractionSummary | null = rawExtracted
      ? {
          ...rawExtracted,
          officialFlyer: rawExtracted.officialFlyer
            ? {
                ...rawExtracted.officialFlyer,
                previewUrl:
                  ensureLocalPreviewUrl(
                    rawExtracted.officialFlyer.previewUrl ||
                      rawExtracted.officialFlyer.highResUrl ||
                      rawExtracted.officialFlyer.originalUrl ||
                      rawExtracted.officialFlyer.url,
                  ) || null,
              }
            : null,
          additionalMedia: Array.isArray(rawExtracted.additionalMedia)
            ? rawExtracted.additionalMedia.map((img) => ({
                ...img,
                previewUrl:
                  ensureLocalPreviewUrl(
                    img?.previewUrl || img?.highResUrl || img?.originalUrl || img?.url,
                  ) || null,
              }))
            : [],
        }
      : null;

    return {
      ...c,
      warnings: normalizedWarnings,
      mediaExtractionStatus:
        c.mediaExtractionStatus ||
        c.mediaExtraction?.status ||
        c.extractedMedia?.status ||
        (c.flyerUrl
          ? 'Official Flyer Found'
          : c.discoveredImages?.length
            ? 'Additional Images Found'
            : 'No Official Flyer Available'),
      mediaExtraction: c.mediaExtraction || normalizedExtractedMedia,
      extractedMedia: normalizedExtractedMedia,
      selectedExtractedMedia: c.selectedExtractedMedia
        ? {
            ...c.selectedExtractedMedia,
            previewUrl:
              ensureLocalPreviewUrl(
                c.selectedExtractedMedia.previewUrl ||
                  c.selectedExtractedMedia.highResUrl ||
                  c.selectedExtractedMedia.url,
              ) || null,
          }
        : null,
      stagedMedia: c.stagedMedia
        ? {
            ...c.stagedMedia,
            flyerPreviewUrl: ensureLocalPreviewUrl(c.stagedMedia.flyerPreviewUrl) || '',
            officialFlyerPreviewUrl:
              ensureLocalPreviewUrl(c.stagedMedia.officialFlyerPreviewUrl) || null,
            additionalExtractedImages: Array.isArray(c.stagedMedia.additionalExtractedImages)
              ? c.stagedMedia.additionalExtractedImages.map((img) => ({
                  ...img,
                  previewUrl:
                    ensureLocalPreviewUrl(
                      img?.previewUrl || img?.highResUrl || img?.originalUrl || img?.url,
                    ) || null,
                }))
              : [],
            heroPreviewUrl: ensureLocalPreviewUrl(c.stagedMedia.heroPreviewUrl) || '',
          }
        : c.stagedMedia,
    };
  });
  const communityCandidates: CuratorCommunityCandidateRecord[] = Array.isArray(s.communityCandidates)
    ? s.communityCandidates
    : [];
  const rawMediaItems: CuratorMediaItem[] = Array.isArray(s.mediaItems) ? s.mediaItems : [];
  const mediaItems: CuratorMediaItem[] = rawMediaItems.map((m) => ({
    ...m,
    previewUrls: m.previewUrls
      ? {
          ...m.previewUrls,
          flyer: ensureLocalPreviewUrl(m.previewUrls.flyer) || '',
          hero: ensureLocalPreviewUrl(m.previewUrls.hero) || '',
          portraitOriginal: ensureLocalPreviewUrl(m.previewUrls.portraitOriginal) || '',
          landscapeOriginal: ensureLocalPreviewUrl(m.previewUrls.landscapeOriginal) || '',
        }
      : m.previewUrls,
    versionHistory: Array.isArray(m.versionHistory)
      ? m.versionHistory.map((v) => ({
          ...v,
          previewUrls: v.previewUrls
            ? {
                ...v.previewUrls,
                flyer: ensureLocalPreviewUrl(v.previewUrls.flyer) || '',
                hero: ensureLocalPreviewUrl(v.previewUrls.hero) || '',
                portraitOriginal: ensureLocalPreviewUrl(v.previewUrls.portraitOriginal) || '',
                landscapeOriginal: ensureLocalPreviewUrl(v.previewUrls.landscapeOriginal) || '',
              }
            : v.previewUrls,
        }))
      : m.versionHistory,
  }));
  const monitoredSources: CuratorMonitoredSource[] = Array.isArray(s.monitoredSources)
    ? s.monitoredSources
    : [];
  const rq = s.summary?.reviewQueue || s.summary?.candidates || {};
  const art = s.summary?.artwork || {};
  const src = s.summary?.sources || {};
  const jobs = s.summary?.jobs || {};
  const ccSum = s.summary?.communityCandidates || {};

  return {
    ...s,
    connection: {
      agentId: s.connection?.agentId || 'swingsphere-content-curator',
      displayName: s.connection?.displayName || 'SwingSphere Content Curator',
      status: s.connection?.status || 'connected',
      bridgeMode: s.connection?.bridgeMode || 'narrow_scoped_sanitized_bridge',
      authoritativeOperationalStore:
        s.connection?.authoritativeOperationalStore || 'OpenClaw SQLite (state/curator.sqlite)',
      authoritativePublishedStore:
        s.connection?.authoritativePublishedStore || 'SwingSphere Production Catalog (Supabase)',
      lastSynchronizedAt: s.connection?.lastSynchronizedAt || new Date().toISOString(),
      catalogSyncedAt: s.connection?.catalogSyncedAt ?? null,
      directPublishingEnabled: false,
      ...(s.connection || {}),
    },
    summary: {
      ...(s.summary || {}),
      reviewQueue: {
        totalStaged: rq.totalStaged ?? candidates.length,
        actionableEventCandidates: rq.actionableEventCandidates ?? 0,
        pendingReview: rq.pendingReview ?? 0,
        newEvents: rq.newEvents ?? 0,
        proposedCorrections: rq.proposedCorrections ?? 0,
        possibleDuplicates: rq.possibleDuplicates ?? 0,
        duplicateTranslations: rq.duplicateTranslations ?? 0,
        closureNotices: rq.closureNotices ?? 0,
        historicalEvents: rq.historicalEvents ?? 0,
        alreadyInCatalog: rq.alreadyInCatalog ?? 0,
        incompleteFacts: rq.incompleteFacts ?? 0,
        inferredYearCount: rq.inferredYearCount ?? 0,
        ambiguousPlayPartyCount: rq.ambiguousPlayPartyCount ?? 0,
        approvedCount: rq.approvedCount ?? 0,
        readyToPublishCount: rq.readyToPublishCount ?? candidates.filter((c) => c.reviewState === 'ready_to_publish').length,
        publishedCount: rq.publishedCount ?? candidates.filter((c) => c.reviewState === 'published').length,
        publishFailedCount: rq.publishFailedCount ?? candidates.filter((c) => c.reviewState === 'publish_failed').length,
        pendingPublishCount: rq.pendingPublishCount ?? candidates.filter((c) => Boolean(c.needsPublish)).length,
        rejectedCount: rq.rejectedCount ?? 0,
        deferredCount: rq.deferredCount ?? 0,
        changesRequestedCount: rq.changesRequestedCount ?? 0,
        ...rq,
      },
      communityCandidates: {
        total: ccSum.total ?? communityCandidates.length,
        pendingReview: ccSum.pendingReview ?? communityCandidates.filter((c) => c.reviewState === 'pending_review').length,
        approved: ccSum.approved ?? communityCandidates.filter((c) => c.reviewState === 'approved').length,
        rejected: ccSum.rejected ?? communityCandidates.filter((c) => c.reviewState === 'rejected').length,
        deferred: ccSum.deferred ?? communityCandidates.filter((c) => c.reviewState === 'deferred').length,
        ...ccSum,
      },
      artwork: {
        total: art.total ?? mediaItems.length,
        generatedPairs: art.generatedPairs ?? 0,
        candidateGeneratedPairs: art.candidateGeneratedPairs ?? 0,
        validationDiversityPairs: art.validationDiversityPairs ?? 0,
        officialArtworkReview: art.officialArtworkReview ?? 0,
        briefReady: art.briefReady ?? 0,
        pendingVisualReview: art.pendingVisualReview ?? 0,
        approvedArtwork: art.approvedArtwork ?? 0,
        rejectedArtwork: art.rejectedArtwork ?? 0,
        regenerationRequested: art.regenerationRequested ?? 0,
        ...art,
      },
      sources: {
        total: src.total ?? monitoredSources.length,
        clubs: src.clubs ?? 0,
        promoters: src.promoters ?? 0,
        dueNow: src.dueNow ?? 0,
        clubsCheckedRolling7d: src.clubsCheckedRolling7d ?? 0,
        sourcesCheckedRolling7d: src.sourcesCheckedRolling7d ?? src.clubsCheckedRolling7d ?? 0,
        missingEventSourceUrlCount: src.missingEventSourceUrlCount ?? 0,
        missingWebsiteCount: src.missingWebsiteCount ?? 0,
        successfulTotal: src.successfulTotal ?? 0,
        partialTotal: src.partialTotal ?? 0,
        failedTotal: src.failedTotal ?? 0,
        unattemptedTotal: src.unattemptedTotal ?? 0,
        pausedTotal: src.pausedTotal ?? 0,
        manualOverridesTotal: src.manualOverridesTotal ?? 0,
        tierBreakdown: src.tierBreakdown || { high: 0, moderate: 0, normal: 0, low: 0, static: 0 },
        ...src,
      },
      jobs: {
        totalCronJobs: jobs.totalCronJobs ?? 0,
        enabledCronJobs: jobs.enabledCronJobs ?? 0,
        openAlerts: jobs.openAlerts ?? 0,
        resolvedAlerts: jobs.resolvedAlerts ?? 0,
        integrityWarnings: jobs.integrityWarnings ?? 0,
        commandsAcknowledged: jobs.commandsAcknowledged ?? 0,
        ...jobs,
      },
    },
    candidates,
    communityCandidates,
    mediaItems,
    creativeCatalog: {
      styles: s.creativeCatalog?.styles || [],
      layoutTemplates: s.creativeCatalog?.layoutTemplates || [],
      supportedDesignModes: s.creativeCatalog?.supportedDesignModes || [],
      visualRelevanceCriteria: s.creativeCatalog?.visualRelevanceCriteria || [],
      sensualityTechniques: s.creativeCatalog?.sensualityTechniques || [],
      monitoringTiers: s.creativeCatalog?.monitoringTiers || {},
      ...(s.creativeCatalog || {}),
    },
    monitoredSources,
    agentAndJobs: {
      cronJobs: Array.isArray(s.agentAndJobs?.cronJobs) ? s.agentAndJobs.cronJobs : [],
      alerts: Array.isArray(s.agentAndJobs?.alerts) ? s.agentAndJobs.alerts : [],
      integrity: s.agentAndJobs?.integrity || { checkedAt: null, warnings: [] },
      recentOperations: Array.isArray(s.agentAndJobs?.recentOperations) ? s.agentAndJobs.recentOperations : [],
      commandQueue: Array.isArray(s.agentAndJobs?.commandQueue) ? s.agentAndJobs.commandQueue : [],
      ...(s.agentAndJobs || {}),
    },
  };
};

export const buildCommandIdempotencyKey = (
  commandType: CuratorCommandType,
  targetId: string,
  discriminator: string = '',
): string => {
  const cleanDisc = discriminator.trim().replace(/\s+/g, '_').slice(0, 80);
  return `curator:${commandType}:${targetId}${cleanDisc ? `:${cleanDisc}` : ''}`;
};

const hydrateRemoteSnapshotMediaPreviews = (
  snapshot: CuratorDashboardSnapshot,
): CuratorDashboardSnapshot => {
  const mediaItems = Array.isArray(snapshot.mediaItems)
    ? snapshot.mediaItems.map((m: any) => {
        const inlineFlyer = m.inlinePreviewDataUrls?.flyer || null;
        const inlineHero = m.inlinePreviewDataUrls?.hero || null;
        const versionHistory = Array.isArray(m.versionHistory)
          ? m.versionHistory.map((v: any) => {
              const vFlyer = v.inlinePreviewDataUrls?.flyer || inlineFlyer;
              const vHero = v.inlinePreviewDataUrls?.hero || inlineHero;
              return {
                ...v,
                previewUrls: v.previewUrls
                  ? {
                      flyer: vFlyer || v.previewUrls.flyer,
                      hero: vHero || v.previewUrls.hero,
                      portraitOriginal: vFlyer || v.previewUrls.portraitOriginal,
                      landscapeOriginal: vHero || v.previewUrls.landscapeOriginal,
                    }
                  : null,
              };
            })
          : [];
        return {
          ...m,
          previewUrls: m.previewUrls
            ? {
                flyer: inlineFlyer || m.previewUrls.flyer,
                hero: inlineHero || m.previewUrls.hero,
                portraitOriginal: inlineFlyer || m.previewUrls.portraitOriginal,
                landscapeOriginal: inlineHero || m.previewUrls.landscapeOriginal,
              }
            : null,
          versionHistory,
        };
      })
    : [];

  const candidates = Array.isArray(snapshot.candidates)
    ? snapshot.candidates.map((c: any) => ({
        ...c,
        stagedMedia: c.stagedMedia
          ? {
              ...c.stagedMedia,
              flyerPreviewUrl: c.stagedMedia.flyerInlineDataUrl || c.stagedMedia.flyerPreviewUrl,
              heroPreviewUrl: c.stagedMedia.heroInlineDataUrl || c.stagedMedia.heroPreviewUrl,
            }
          : null,
      }))
    : [];

  return {
    ...snapshot,
    candidates,
    mediaItems,
  };
};

export const isLocalCuratorEnvironment = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return Boolean(
    import.meta.env.DEV &&
      ['localhost', '127.0.0.1'].includes(window.location.hostname),
  );
};

const assertLocalCuratorEnvironment = (): void => {
  if (!isLocalCuratorEnvironment()) {
    throw new Error('Content Curator is disabled in production builds and only available on localhost.');
  }
};

export const fetchCuratorDashboardSnapshot = async (options?: {
  mirrorSupabase?: boolean;
  timeoutMs?: number;
}): Promise<CuratorDashboardSnapshot> => {
  assertLocalCuratorEnvironment();
  const headers = await getCuratorRequestHeaders();
  const timeoutMs = options?.timeoutMs ?? 15000;
  try {
    const response = await fetch('/api/admin/curator/snapshot', {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const liveSnapshot = normalizeCuratorDashboardSnapshot((await response.json()) as CuratorDashboardSnapshot);
      setLastCachedCuratorSnapshot(liveSnapshot);
      return liveSnapshot;
    }
    if (contentType.includes('application/json')) {
      const errBody = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        throw new Error(errBody?.error || 'Active administrator authentication is required.');
      }
      throw new Error(errBody?.error || `Failed to load local Content Curator snapshot (${response.status}).`);
    }
  } catch (err) {
    if (err instanceof Error && /Active administrator authentication/i.test(err.message)) {
      throw err;
    }
    const cached = getLastCachedCuratorSnapshot();
    if (cached) {
      return toOfflineSnapshotFallback(
        cached,
        'Local OpenClaw Content Curator backend is temporarily unreachable; displaying last cached local snapshot.',
      );
    }
    throw err instanceof Error
      ? err
      : new Error('Local OpenClaw Content Curator backend is unreachable.');
  }

  const cached = getLastCachedCuratorSnapshot();
  if (cached) {
    return toOfflineSnapshotFallback(
      cached,
      'Local OpenClaw Content Curator backend is offline; displaying last cached local snapshot.',
    );
  }
  throw new Error('Unable to load local Content Curator dashboard snapshot.');
};

export const sendCuratorCommand = async (input: {
  idempotencyKey?: string;
  commandType: CuratorCommandType;
  targetId: string;
  payload?: Record<string, unknown>;
  recoverInterrupted?: boolean;
  retryFailed?: boolean;
}): Promise<{
  ok: boolean;
  duplicate: boolean;
  acknowledged: boolean;
  recoveredFromInterruption?: boolean;
  retriedAfterFailure?: boolean;
  command: CuratorCommandRecord;
  snapshot?: CuratorDashboardSnapshot;
}> => {
  assertLocalCuratorEnvironment();
  const headers = await getCuratorRequestHeaders();
  const idempotencyKey =
    input.idempotencyKey ||
    buildCommandIdempotencyKey(
      input.commandType,
      input.targetId,
      JSON.stringify(input.payload || {}),
    );

  const response = await fetch('/api/admin/curator/command', {
    method: 'POST',
    headers,
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(30000) : undefined,
    body: JSON.stringify({
      idempotencyKey,
      commandType: input.commandType,
      targetId: input.targetId,
      payload: input.payload || {},
      recoverInterrupted: input.recoverInterrupted,
      retryFailed: input.retryFailed,
    }),
  });
  const contentType = response.headers.get('content-type') || '';
  if (response.ok && contentType.includes('application/json')) {
    const body = await response.json();
    if (body?.snapshot) {
      body.snapshot = normalizeCuratorDashboardSnapshot(body.snapshot);
      setLastCachedCuratorSnapshot(body.snapshot);
    }
    return body;
  }
  if (contentType.includes('application/json')) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error || `Command failed with status ${response.status}.`);
  }
  throw new Error(`Local Content Curator command endpoint failed with status ${response.status}.`);
};

export const selectCandidateExtractedMedia = async (
  candidateId: string,
  selection: {
    url?: string | null;
    highResUrl?: string | null;
    originalUrl?: string | null;
    index?: number | null;
    classification?: string | null;
  },
) => {
  const targetUrl = selection.url || selection.highResUrl || selection.originalUrl || '';
  return sendCuratorCommand({
    idempotencyKey: buildCommandIdempotencyKey(
      'artwork_select_extracted',
      candidateId,
      `${targetUrl || selection.index || 0}:${Date.now()}`,
    ),
    commandType: 'artwork_select_extracted',
    targetId: candidateId,
    payload: {
      url: targetUrl || null,
      highResUrl: selection.highResUrl || targetUrl || null,
      originalUrl: selection.originalUrl || targetUrl || null,
      index: typeof selection.index === 'number' ? selection.index : null,
      classification: selection.classification || null,
    },
  });
};

const buildIsoStartEnd = (candidate: CuratorCandidateRecord): { start: string; end: string } => {
  const baseDate = candidate.date || new Date().toISOString().slice(0, 10);
  const startTime = candidate.startTime || '20:00:00';
  const endDate = candidate.endDate || baseDate;
  const endTime = candidate.endTime || '23:59:00';
  const startIso = `${baseDate}T${startTime.length === 5 ? `${startTime}:00` : startTime}`;
  const endIso = `${endDate}T${endTime.length === 5 ? `${endTime}:00` : endTime}`;
  return { start: startIso, end: endIso };
};

const isLocalPreviewOrDataUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return (
    url.startsWith('/api/admin/curator/media-preview') ||
    url.startsWith('data:')
  );
};

export const computeClientCandidatePublishHash = (candidate: CuratorCandidateRecord): string => {
  if (candidate.contentHash && typeof candidate.contentHash === 'string' && candidate.contentHash.trim()) {
    return candidate.contentHash.trim();
  }
  const rawParts = [
    candidate.id || '',
    candidate.title || '',
    candidate.date || '',
    candidate.startTime || '',
    candidate.endDate || '',
    candidate.endTime || '',
    candidate.timezone || '',
    candidate.clubId || '',
    candidate.hostId || '',
    candidate.venue || '',
    candidate.address || '',
    candidate.city || '',
    candidate.region || '',
    candidate.country || '',
    candidate.sourceUrl || '',
    candidate.ticketUrl || '',
    candidate.rsvpUrl || '',
    candidate.displayDescription || candidate.description || '',
    candidate.theme || candidate.eventDetails?.theme || '',
    candidate.dressCode || candidate.eventDetails?.dressCode || '',
    candidate.restrictions || candidate.eventDetails?.eligibility || '',
    candidate.admission || '',
    candidate.customFlyerUrl || '',
    candidate.customHeaderUrl || '',
    candidate.replaceExistingArtwork ? 'replace_art' : 'preserve_art',
    candidate.stagedMedia?.id || '',
    candidate.stagedMedia?.selectedVersionId || 'v1',
    candidate.stagedMedia?.flyerSha256 || '',
    candidate.stagedMedia?.heroSha256 || '',
    candidate.stagedMedia?.status === 'approved' ? 'approved' : 'unapproved',
  ].join('|');

  let h1 = 0xdeadbeef ^ rawParts.length;
  let h2 = 0x41c6ce57 ^ rawParts.length;
  for (let i = 0; i < rawParts.length; i += 1) {
    const ch = rawParts.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `hash-${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
};

export const buildAuthorizedEventDraftFromCandidate = (
  candidate: CuratorCandidateRecord,
  listings: Listing[],
  options?: {
    uploadedMediaUrls?: {
      flyerUrl?: string | null;
      heroUrl?: string | null;
    } | null;
  },
): EventData => {
  const existingEvent = candidate.matchedExistingId
    ? listings.find((l): l is EventData => l.type === 'event' && l.id === candidate.matchedExistingId)
    : undefined;
  const parentClub = candidate.clubId
    ? listings.find((l): l is ClubData => l.type === 'club' && l.id === candidate.clubId)
    : undefined;

  const { start, end } = buildIsoStartEnd(candidate);

  const cleanDescription = candidate.displayDescription || candidate.description;
  const selVer = candidate.stagedMedia?.selectedVersionId || 'v1';
  const uploadedVersionAssets = candidate.stagedMedia?.uploadedAssets?.[selVer];
  const uploadedFlyerUrl =
    options?.uploadedMediaUrls?.flyerUrl ||
    uploadedVersionAssets?.flyer?.deliveryUrl ||
    null;
  const uploadedHeroUrl =
    options?.uploadedMediaUrls?.heroUrl ||
    uploadedVersionAssets?.hero?.deliveryUrl ||
    null;

  const nonLocalStagedFlyer =
    candidate.stagedMedia?.flyerPreviewUrl && !isLocalPreviewOrDataUrl(candidate.stagedMedia.flyerPreviewUrl)
      ? candidate.stagedMedia.flyerPreviewUrl
      : undefined;
  const nonLocalStagedHero =
    candidate.stagedMedia?.heroPreviewUrl && !isLocalPreviewOrDataUrl(candidate.stagedMedia.heroPreviewUrl)
      ? candidate.stagedMedia.heroPreviewUrl
      : undefined;

  const officialExtractedFlyer =
    candidate.selectedExtractedMedia?.url ||
    candidate.extractedMedia?.officialFlyer?.highResUrl ||
    candidate.extractedMedia?.officialFlyer?.originalUrl ||
    candidate.mediaExtraction?.officialFlyer?.highResUrl ||
    candidate.mediaExtraction?.officialFlyer?.originalUrl ||
    (!isLocalPreviewOrDataUrl(candidate.flyerUrl) ? candidate.flyerUrl : undefined) ||
    undefined;

  const hasApprovedGeneratedPair = Boolean(
    candidate.stagedMedia?.status === 'approved' && candidate.stagedMedia?.hasGeneratedPair,
  );

  const proposedFlyer = hasApprovedGeneratedPair
    ? candidate.customFlyerUrl ||
      uploadedFlyerUrl ||
      nonLocalStagedFlyer ||
      officialExtractedFlyer ||
      undefined
    : candidate.selectedExtractedMedia?.url ||
      candidate.customFlyerUrl ||
      officialExtractedFlyer ||
      uploadedFlyerUrl ||
      nonLocalStagedFlyer ||
      undefined;
  const proposedHeader =
    candidate.customHeaderUrl ||
    uploadedHeroUrl ||
    nonLocalStagedHero ||
    parentClub?.headerImageUrl ||
    undefined;

  if (existingEvent) {
    // Preserve manually selected / existing artwork unless administrator explicitly requested replacement
    const allowArtworkOverwrite = Boolean(candidate.replaceExistingArtwork) && !candidate.customArtworkLocked;
    return {
      ...existingEvent,
      publicSlug: existingEvent.publicSlug,
      name: candidate.title || existingEvent.name,
      hostName: candidate.hostName || candidate.clubName || existingEvent.hostName,
      description_full: cleanDescription || existingEvent.description_full,
      website: candidate.sourceUrl || candidate.ticketUrl || existingEvent.website,
      time: {
        start: candidate.date ? start : existingEvent.time.start,
        end: candidate.date ? end : existingEvent.time.end,
      },
      flyerImageUrl: allowArtworkOverwrite
        ? proposedFlyer || existingEvent.flyerImageUrl
        : existingEvent.flyerImageUrl || proposedFlyer,
      headerImageUrl: allowArtworkOverwrite
        ? proposedHeader || existingEvent.headerImageUrl
        : existingEvent.headerImageUrl || proposedHeader,
    };
  }

  const defaultGeopoint = parentClub?.geopoint || {
    latitude: 36.1699,
    longitude: -115.1398,
    address: {
      addressLine1: candidate.address || undefined,
      city: candidate.city || 'Las Vegas',
      region: candidate.region || 'NV',
      country: candidate.country || 'USA',
    },
  };

  const deterministicListingId = candidate.matchedExistingId || `event-curated-${candidate.id.replace(/^candidate-/, '')}`;

  const draftWithoutSlug: EventData = {
    id: deterministicListingId,
    type: 'event',
    name: candidate.title,
    hostName: candidate.hostName || parentClub?.name || candidate.clubName || 'SwingSphere Host',
    description_full:
      cleanDescription ||
      `${candidate.title} hosted at ${candidate.venue || parentClub?.name || candidate.clubName}. Verified from official source calendar.`,
    location:
      candidate.address ||
      parentClub?.location ||
      [candidate.city, candidate.region, candidate.country].filter(Boolean).join(', ') ||
      candidate.clubName,
    website: candidate.sourceUrl || candidate.ticketUrl || parentClub?.website,
    contactEmail: parentClub?.contactEmail || 'events@swingsphere.com',
    venueId: parentClub?.primaryVenueId,
    organizerOrganizationId: parentClub?.ownerOrganizationId,
    time: { start, end },
    geopoint: defaultGeopoint,
    tags: ['Curated Event', ...(candidate.series ? [candidate.series] : [])],
    logoImageUrl: parentClub?.logoImageUrl,
    flyerImageUrl: proposedFlyer,
    headerImageUrl: proposedHeader,
    status: 'pending_approval',
    postedByUserId: 'admin',
  };

  const existingEvents = listings.filter((l): l is EventData => l.type === 'event');
  const computedSlug = makeEventPublicSlug(draftWithoutSlug, existingEvents) || candidate.publicSlug || undefined;

  return {
    ...draftWithoutSlug,
    publicSlug: computedSlug,
  };
};

export interface CuratorModerationWorkflowAdapter {
  saveEvent: (event: EventData, options?: { requireExisting?: boolean }) => Promise<EventData>;
  approveSubmission: (id: string) => Promise<Listing>;
}

export interface CuratorPublishPreviewItem {
  candidate: CuratorCandidateRecord;
  operationType: 'insert' | 'update';
  targetListingId: string;
  existingListing: EventData | null;
  proposedDraft: EventData;
  changedFields: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }>;
  contentHash: string;
  mediaAction: 'upload_approved_pair' | 'use_custom_url' | 'preserve_existing' | 'none';
  mediaStatusLabel: string;
  validationErrors: string[];
  warnings: string[];
}

export interface CuratorManualPublishPreview {
  generatedAt: string;
  readyItems: CuratorPublishPreviewItem[];
  invalidItems: CuratorPublishPreviewItem[];
  alreadyPublishedItems: Array<{
    candidate: CuratorCandidateRecord;
    publishedListingId: string;
    publishedAt: string | null;
    contentHash: string;
  }>;
  counts: {
    totalApprovedConsidered: number;
    readyToPublish: number;
    inserts: number;
    updates: number;
    mediaUploadsRequired: number;
    blockedByValidation: number;
    skippedAlreadyPublished: number;
  };
}

export interface CuratorManualPublishItemOutcome {
  candidateId: string;
  title: string;
  operationType: 'insert' | 'update';
  status: 'published' | 'failed' | 'skipped';
  publishedListingId: string | null;
  publishedAt: string | null;
  contentHash: string;
  mediaUploaded: boolean;
  flyerUrl?: string | null;
  heroUrl?: string | null;
  reason?: string | null;
}

export interface CuratorManualPublishSummary {
  startedAt: string;
  completedAt: string;
  batchSize: number;
  totalBatches: number;
  succeeded: CuratorManualPublishItemOutcome[];
  failed: CuratorManualPublishItemOutcome[];
  skipped: CuratorManualPublishItemOutcome[];
  snapshot?: CuratorDashboardSnapshot;
}

export const validateCandidateForManualPublish = (
  candidate: CuratorCandidateRecord,
  listings: Listing[],
  options?: { referenceTime?: Date | string },
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (candidate.isClosureNotice || candidate.candidateType === 'closure_notice' || candidate.reviewState === 'excluded_closure_notice') {
    errors.push('Closure notices cannot be published as public events.');
  }
  if (candidate.reconciliationState === 'duplicate_translation' || candidate.reviewState === 'excluded_duplicate_translation') {
    errors.push('Duplicate translation records cannot be published; publish the canonical event instead.');
  }
  if (isCandidateExcludedDuplicate(candidate)) {
    errors.push(
      `Non-canonical duplicate candidate (${candidate.duplicateClassification || candidate.reviewState || 'possible_duplicate'}) cannot be published; publish the canonical event (${candidate.canonicalCandidateId || candidate.duplicateOfCandidateId || 'canonical sibling'}) instead.`,
    );
  }
  if (
    candidate.auditCategory === 'historical_event' ||
    candidate.reviewState === 'historical_not_for_publication' ||
    candidate.archivedAsHistorical ||
    isCandidateDateExpired(candidate.date, candidate.timezone, options?.referenceTime)
  ) {
    errors.push('Historical past events are excluded from publication.');
  }
  if (!String(candidate.title || '').trim()) {
    errors.push('Event title is required.');
  }
  if (!candidate.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(candidate.date).trim())) {
    errors.push('Verified event date (YYYY-MM-DD) is required.');
  }
  if (!String(candidate.startTime || '').trim()) {
    errors.push('Event start time is required.');
  }
  if (!String(candidate.timezone || '').trim()) {
    errors.push('Event timezone is required.');
  }
  if (!String(candidate.venue || candidate.clubName || '').trim()) {
    errors.push('Venue or host club name is required.');
  }
  if (
    candidate.playPartyEligibility?.requiresHumanReview &&
    !candidate.reviewDecision?.overridePlayPartyEligibility
  ) {
    errors.push('Ambiguous play-party eligibility must be explicitly verified before publishing.');
  }
  if (candidate.clubId) {
    const matchedClub = listings.find((l) => l.type === 'club' && l.id === candidate.clubId);
    if (!matchedClub) {
      warnings.push(`Associated club ID "${candidate.clubId}" was not found in loaded listings; using candidate address fallback.`);
    }
  }
  if (candidate.stagedMedia?.hasGeneratedPair && candidate.stagedMedia.status !== 'approved') {
    warnings.push('Generated artwork pair has not been approved in Artwork Studio yet; publication will proceed without generated flyer unless approved first.');
  }

  return { errors, warnings };
};

export const gatherPublishableApprovedCandidates = (
  snapshot: CuratorDashboardSnapshot,
  listings: Listing[],
  options?: { referenceTime?: Date | string },
): CuratorManualPublishPreview => {
  const readyItems: CuratorPublishPreviewItem[] = [];
  const invalidItems: CuratorPublishPreviewItem[] = [];
  const alreadyPublishedItems: CuratorManualPublishPreview['alreadyPublishedItems'] = [];

  const candidatePool = (snapshot.candidates || []).filter(
    (c) =>
      ['approved', 'ready_to_publish', 'publish_failed', 'published'].includes(c.reviewState) &&
      !isCandidateExcludedDuplicate(c) &&
      (c.reviewState === 'published' || !isCandidateArchivedOrExpired(c, options)),
  );

  for (const candidate of candidatePool) {
    const contentHash = computeClientCandidatePublishHash(candidate);
    const pubRecord = candidate.publicationRecord || null;
    const publishedListingId =
      pubRecord?.publishedListingId ||
      candidate.reviewDecision?.publishedListingId ||
      null;
    const isAlreadyPublishedUnchanged = Boolean(
      (pubRecord?.status === 'published' &&
        publishedListingId &&
        pubRecord?.publishedContentHash === contentHash &&
        !candidate.explicitUpdateApproved) ||
        (candidate.reviewState === 'published' &&
          !candidate.explicitUpdateApproved &&
          (!pubRecord?.publishedContentHash || pubRecord.publishedContentHash === contentHash)),
    );

    if (isAlreadyPublishedUnchanged && publishedListingId) {
      alreadyPublishedItems.push({
        candidate,
        publishedListingId,
        publishedAt: pubRecord?.publishedAt || candidate.reviewDecision?.reviewedAt || null,
        contentHash,
      });
      continue;
    }

    const matchedId = publishedListingId || candidate.matchedExistingId || null;
    const existingListing = matchedId
      ? listings.find((l): l is EventData => l.type === 'event' && l.id === matchedId) || null
      : null;
    const operationType: 'insert' | 'update' = existingListing || matchedId ? 'update' : 'insert';
    const proposedDraft = buildAuthorizedEventDraftFromCandidate(
      matchedId ? { ...candidate, matchedExistingId: matchedId } : candidate,
      listings,
    );

    const changedFields: CuratorPublishPreviewItem['changedFields'] = [];
    if (existingListing) {
      const comparePairs: Array<[string, string, string | null, string | null]> = [
        ['name', 'Event Title', existingListing.name || null, proposedDraft.name || null],
        ['time.start', 'Start Time', existingListing.time?.start || null, proposedDraft.time?.start || null],
        ['time.end', 'End Time', existingListing.time?.end || null, proposedDraft.time?.end || null],
        ['hostName', 'Host Name', existingListing.hostName || null, proposedDraft.hostName || null],
        ['location', 'Location', existingListing.location || null, proposedDraft.location || null],
        ['website', 'Website / Ticket URL', existingListing.website || null, proposedDraft.website || null],
        ['description_full', 'Description', existingListing.description_full || null, proposedDraft.description_full || null],
        ['flyerImageUrl', 'Flyer Image', existingListing.flyerImageUrl || null, proposedDraft.flyerImageUrl || null],
      ];
      for (const [field, label, before, after] of comparePairs) {
        if (String(before || '') !== String(after || '')) {
          changedFields.push({ field, label, before, after });
        }
      }
    } else {
      for (const diff of candidate.fieldDiffs || []) {
        if (diff.changed) {
          changedFields.push({
            field: diff.field,
            label: diff.label,
            before: diff.originalValue != null ? String(diff.originalValue) : null,
            after: diff.proposedValue != null ? String(diff.proposedValue) : null,
          });
        }
      }
    }

    let mediaAction: CuratorPublishPreviewItem['mediaAction'] = 'none';
    let mediaStatusLabel = 'No custom or generated event artwork attached';
    if (candidate.customFlyerUrl || candidate.customHeaderUrl) {
      mediaAction = 'use_custom_url';
      mediaStatusLabel = 'Using custom administrator artwork URL';
    } else if (existingListing?.flyerImageUrl && !candidate.replaceExistingArtwork) {
      mediaAction = 'preserve_existing';
      mediaStatusLabel = 'Preserving existing published event artwork';
    } else if (
      candidate.stagedMedia?.hasGeneratedPair &&
      candidate.stagedMedia.status === 'approved'
    ) {
      mediaAction = 'upload_approved_pair';
      mediaStatusLabel = `Upload approved generated pair (${candidate.stagedMedia.selectedVersionId || 'v1'}) to production storage`;
    }

    const { errors, warnings } = validateCandidateForManualPublish(candidate, listings, options);
    const previewItem: CuratorPublishPreviewItem = {
      candidate,
      operationType,
      targetListingId: proposedDraft.id,
      existingListing,
      proposedDraft,
      changedFields,
      contentHash,
      mediaAction,
      mediaStatusLabel,
      validationErrors: errors,
      warnings,
    };

    if (errors.length > 0) {
      invalidItems.push(previewItem);
    } else {
      readyItems.push(previewItem);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    readyItems,
    invalidItems,
    alreadyPublishedItems,
    counts: {
      totalApprovedConsidered: candidatePool.length,
      readyToPublish: readyItems.length,
      inserts: readyItems.filter((i) => i.operationType === 'insert').length,
      updates: readyItems.filter((i) => i.operationType === 'update').length,
      mediaUploadsRequired: readyItems.filter((i) => i.mediaAction === 'upload_approved_pair').length,
      blockedByValidation: invalidItems.length,
      skippedAlreadyPublished: alreadyPublishedItems.length,
    },
  };
};

export const uploadApprovedCuratorMedia = async (input: {
  mediaId: string;
  candidateId?: string;
  versionId?: string;
  ownerId?: string;
}): Promise<{
  uploaded: boolean;
  reusedExistingUpload?: boolean;
  mediaId: string;
  versionId?: string;
  flyerUrl: string | null;
  heroUrl: string | null;
  reason?: string;
}> => {
  assertLocalCuratorEnvironment();
  const headers = await getCuratorRequestHeaders();
  const response = await fetch('/api/admin/curator/upload-media', {
    method: 'POST',
    headers,
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(30000) : undefined,
    body: JSON.stringify(input),
  });
  const contentType = response.headers.get('content-type') || '';
  if (response.ok && contentType.includes('application/json')) {
    return await response.json();
  }
  if (contentType.includes('application/json')) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error || `Media upload failed with status ${response.status}.`);
  }
  throw new Error(`Media upload endpoint failed with status ${response.status}.`);
};

const isRetryablePublishError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /\b(429|502|503|504|521|522|timeout|timed out|network|fetch failed|temporarily unavailable)\b/i.test(msg);
};

const runWithBoundedRetry = async <T>(
  operation: () => Promise<T>,
  maxAttempts = 2,
  baseDelayMs = 400,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryablePublishError(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
};

export const publishApprovedCuratorChanges = async (
  preview: CuratorManualPublishPreview,
  listings: Listing[],
  options: {
    moderationApi: CuratorModerationWorkflowAdapter;
    batchSize?: number;
    mediaUploader?: typeof uploadApprovedCuratorMedia;
    commandSender?: typeof sendCuratorCommand;
    onProgress?: (progress: { completed: number; total: number; currentTitle: string }) => void;
  },
): Promise<CuratorManualPublishSummary> => {
  assertLocalCuratorEnvironment();
  const startedAt = new Date().toISOString();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 3, 5));
  const uploadMedia = options.mediaUploader || uploadApprovedCuratorMedia;
  const recordCommand = options.commandSender || sendCuratorCommand;

  const succeeded: CuratorManualPublishItemOutcome[] = [];
  const failed: CuratorManualPublishItemOutcome[] = [];
  const skipped: CuratorManualPublishItemOutcome[] = [];

  for (const already of preview.alreadyPublishedItems) {
    skipped.push({
      candidateId: already.candidate.id,
      title: already.candidate.title,
      operationType: 'update',
      status: 'skipped',
      publishedListingId: already.publishedListingId,
      publishedAt: already.publishedAt,
      contentHash: already.contentHash,
      mediaUploaded: false,
      reason: 'Already published with matching content hash.',
    });
  }

  for (const invalid of preview.invalidItems) {
    skipped.push({
      candidateId: invalid.candidate.id,
      title: invalid.candidate.title,
      operationType: invalid.operationType,
      status: 'skipped',
      publishedListingId: null,
      publishedAt: null,
      contentHash: invalid.contentHash,
      mediaUploaded: false,
      reason: `Blocked by validation: ${invalid.validationErrors.join('; ')}`,
    });
  }

  const seenHashesInRun = new Set<string>();
  const itemsToProcess = preview.readyItems;
  const totalBatches = Math.ceil(itemsToProcess.length / batchSize);
  let lastSnapshot: CuratorDashboardSnapshot | undefined;
  let completedCount = 0;

  for (let batchIdx = 0; batchIdx < itemsToProcess.length; batchIdx += batchSize) {
    const batch = itemsToProcess.slice(batchIdx, batchIdx + batchSize);
    for (const item of batch) {
      const { candidate, contentHash, operationType } = item;
      const dedupeKey = `${candidate.id}:${contentHash}`;
      if (
        seenHashesInRun.has(dedupeKey) ||
        (candidate.publicationRecord?.status === 'published' &&
          candidate.publicationRecord?.publishedListingId &&
          candidate.publicationRecord?.publishedContentHash === contentHash &&
          !candidate.explicitUpdateApproved)
      ) {
        skipped.push({
          candidateId: candidate.id,
          title: candidate.title,
          operationType,
          status: 'skipped',
          publishedListingId: candidate.publicationRecord?.publishedListingId || item.targetListingId,
          publishedAt: candidate.publicationRecord?.publishedAt || null,
          contentHash,
          mediaUploaded: false,
          reason: 'Duplicate publication prevented by idempotency check.',
        });
        completedCount += 1;
        options.onProgress?.({
          completed: completedCount,
          total: itemsToProcess.length,
          currentTitle: candidate.title,
        });
        continue;
      }

      seenHashesInRun.add(dedupeKey);

      try {
        const { errors } = validateCandidateForManualPublish(candidate, listings);
        if (errors.length > 0) {
          throw new Error(errors.join('; '));
        }

        let uploadedMediaUrls: { flyerUrl?: string | null; heroUrl?: string | null } | null = null;
        let mediaUploaded = false;

        if (item.mediaAction === 'upload_approved_pair' && candidate.stagedMedia?.id) {
          const uploadRes = await runWithBoundedRetry(() =>
            uploadMedia({
              mediaId: candidate.stagedMedia!.id,
              candidateId: candidate.id,
              versionId: candidate.stagedMedia!.selectedVersionId || 'v1',
              ownerId: item.targetListingId,
            }),
          );
          if (uploadRes.uploaded && (uploadRes.flyerUrl || uploadRes.heroUrl)) {
            uploadedMediaUrls = {
              flyerUrl: uploadRes.flyerUrl,
              heroUrl: uploadRes.heroUrl,
            };
            mediaUploaded = true;
          }
        }

        const matchedId =
          candidate.publicationRecord?.publishedListingId ||
          candidate.matchedExistingId ||
          null;
        const finalDraft = buildAuthorizedEventDraftFromCandidate(
          matchedId ? { ...candidate, matchedExistingId: matchedId } : candidate,
          listings,
          { uploadedMediaUrls },
        );

        let savedListing = await runWithBoundedRetry(() =>
          options.moderationApi.saveEvent({
            ...finalDraft,
            status: 'pending_approval',
          }),
        );

        const moderated = await runWithBoundedRetry(() =>
          options.moderationApi.approveSubmission(savedListing.id),
        );
        if (moderated.type === 'event') {
          savedListing = moderated;
        } else {
          savedListing = { ...savedListing, status: 'approved' };
        }

        const publishedAt = new Date().toISOString();
        const recordRes = await recordCommand({
          idempotencyKey: buildCommandIdempotencyKey(
            'candidate_record_publication',
            candidate.id,
            `${savedListing.id}:${contentHash}`,
          ),
          commandType: 'candidate_record_publication',
          targetId: candidate.id,
          payload: {
            publishedListingId: savedListing.id,
            publishedAt,
            publishedContentHash: contentHash,
            operationType,
            uploadedMedia: uploadedMediaUrls
              ? {
                  mediaId: candidate.stagedMedia?.id,
                  versionId: candidate.stagedMedia?.selectedVersionId || 'v1',
                  flyerUrl: uploadedMediaUrls.flyerUrl || null,
                  heroUrl: uploadedMediaUrls.heroUrl || null,
                }
              : null,
            notes: `Published via Manual Publish workflow (${operationType})`,
          },
        });

        if (recordRes?.snapshot) {
          lastSnapshot = recordRes.snapshot;
        }

        succeeded.push({
          candidateId: candidate.id,
          title: candidate.title,
          operationType,
          status: 'published',
          publishedListingId: savedListing.id,
          publishedAt,
          contentHash,
          mediaUploaded,
          flyerUrl: savedListing.flyerImageUrl || null,
          heroUrl: savedListing.headerImageUrl || null,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Manual publication failed.';
        try {
          const failRes = await recordCommand({
            idempotencyKey: buildCommandIdempotencyKey(
              'candidate_record_publication_failure',
              candidate.id,
              `${contentHash}:${Date.now()}`,
            ),
            commandType: 'candidate_record_publication_failure',
            targetId: candidate.id,
            payload: {
              error: errorMsg,
              contentHash,
            },
          });
          if (failRes?.snapshot) {
            lastSnapshot = failRes.snapshot;
          }
        } catch {
          // Preserve failure in summary even if local failure recording threw
        }

        failed.push({
          candidateId: candidate.id,
          title: candidate.title,
          operationType,
          status: 'failed',
          publishedListingId: null,
          publishedAt: null,
          contentHash,
          mediaUploaded: false,
          reason: errorMsg,
        });
      }

      completedCount += 1;
      options.onProgress?.({
        completed: completedCount,
        total: itemsToProcess.length,
        currentTitle: candidate.title,
      });
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    batchSize,
    totalBatches,
    succeeded,
    failed,
    skipped,
    snapshot: lastSnapshot,
  };
};

export const approveCandidateViaAuthorizedWorkflow = async (
  candidate: CuratorCandidateRecord,
  listings: Listing[],
  options: {
    mode: 'stage_submission' | 'approve_and_publish';
    notes?: string;
    moderationApi: CuratorModerationWorkflowAdapter;
    referenceTime?: Date | string;
  },
): Promise<{
  savedListing: EventData;
  commandResponse: Awaited<ReturnType<typeof sendCuratorCommand>>;
}> => {
  if (candidate.isClosureNotice || candidate.candidateType === 'closure_notice') {
    throw new Error('Closure notices cannot be published as event occurrences.');
  }
  if (!candidate.date) {
    throw new Error('Candidates missing a verified event date cannot be published without completing required facts.');
  }
  if (isCandidateArchivedOrExpired(candidate, { referenceTime: options.referenceTime })) {
    throw new Error(`Archived or expired historical events (${candidate.date}) cannot be approved or published.`);
  }
  if (isCandidateExcludedDuplicate(candidate)) {
    throw new Error(
      `Non-canonical duplicate candidates (${candidate.duplicateClassification || 'possible_duplicate'}) cannot be approved or published; review canonical candidate ${candidate.canonicalCandidateId || candidate.duplicateOfCandidateId || 'sibling'} instead.`,
    );
  }

  const contentHash = computeClientCandidatePublishHash(candidate);
  const commandType: CuratorCommandType =
    options.mode === 'approve_and_publish' ? 'candidate_approve' : 'candidate_stage_submission';
  const idempotencyKey = buildCommandIdempotencyKey(commandType, candidate.id, `${options.mode}:${contentHash}`);

  const eventDraft = buildAuthorizedEventDraftFromCandidate(candidate, listings);

  let savedListing = await options.moderationApi.saveEvent({
    ...eventDraft,
    status: 'pending_approval',
  });

  if (options.mode === 'approve_and_publish') {
    const moderated = await options.moderationApi.approveSubmission(savedListing.id);
    if (moderated.type === 'event') {
      savedListing = moderated;
    } else {
      savedListing = { ...savedListing, status: 'approved' };
    }
  }

  const commandResponse = await sendCuratorCommand({
    idempotencyKey,
    commandType,
    targetId: candidate.id,
    payload: {
      notes:
        options.notes ||
        (options.mode === 'approve_and_publish'
          ? 'Approved and published through SwingSphere moderation workflow'
          : 'Staged in SwingSphere pending submissions queue for moderation'),
      publishedListingId: savedListing.id,
      publishedContentHash: contentHash,
      moderationWorkflow:
        options.mode === 'approve_and_publish'
          ? 'save_listing_and_admin_moderate_listing'
          : 'save_listing_pending_approval',
    },
  });

  return {
    savedListing,
    commandResponse,
  };
};

// =============================================================================
// Editorial Review Queue — Art-Direction Styles, Draft Persistence & Validation
// =============================================================================

export interface CuratorArtworkStyleCategory {
  id: string;
  label: string;
  styleFamily: string;
  defaultLayoutTemplate: string;
  tagline: string;
  visualLanguage: string;
  lightingDirection: string;
  typographyStyle: string;
  paletteHex: [string, string, string, string];
  aliases?: readonly string[];
}

export const CURATOR_ARTWORK_STYLE_CATEGORIES: readonly CuratorArtworkStyleCategory[] = [
  {
    id: 'underground_rave',
    label: 'Underground Rave',
    styleFamily: 'Kinetic typography',
    defaultLayoutTemplate: 'kinetic_band_stack',
    tagline: 'Brutalist warehouse concrete, diagonal laser grids & strobe haze',
    visualLanguage: 'Industrial brutalist architecture, diagonal laser beams, steel mesh geometry, kinetic rave energy',
    lightingDirection: 'Volumetric cyan and crimson strobe shafts cutting through dark industrial haze',
    typographyStyle: 'Heavy condensed industrial uppercase with technical monospace metadata',
    paletteHex: ['#07080C', '#00F0FF', '#FF1E56', '#F1F5F9'],
    aliases: ['industrial_fetish', 'diagonal_kinetic_split'],
  },
  {
    id: 'classic_nightclub',
    label: 'Classic Nightclub',
    styleFamily: 'Art Deco luxury',
    defaultLayoutTemplate: 'deco_gilded_arch',
    tagline: 'Velvet lounge symmetry, champagne gold arches & midnight glamour',
    visualLanguage: 'Stepped Art Deco brass geometry, plush velvet booths, faceted crystal reflections, VIP poise',
    lightingDirection: 'Warm champagne uplighting against deep midnight velvet shadows',
    typographyStyle: 'High-contrast luxury display serif with poised letter-spacing',
    paletteHex: ['#0B0714', '#E6C27A', '#7A1228', '#FAF4E8'],
    aliases: ['art_deco', 'centered_monumental'],
  },
  {
    id: 'renaissance',
    label: 'Renaissance',
    styleFamily: 'Baroque opulence',
    defaultLayoutTemplate: 'velvet_medallion_crest',
    tagline: 'Classical colonnades, golden-ratio arches & warm fresco marble',
    visualLanguage: 'Classical architectural perspective, coffered vaulting, sculptural equilibrium, Venetian palazzo motifs',
    lightingDirection: 'Golden-hour diffused fresco illumination with soft marble rim highlights',
    typographyStyle: 'Classical Roman serif proportions with carved pediment hierarchy',
    paletteHex: ['#17110D', '#D9A75A', '#9E3B24', '#F7EFE2'],
    aliases: ['renaissance_court', 'architectural_arch_frame'],
  },
  {
    id: 'baroque_rembrandt',
    label: 'Baroque / Rembrandt-inspired',
    styleFamily: 'Dark atmospheric portrait',
    defaultLayoutTemplate: 'editorial_couture_frame',
    tagline: 'Deep tenebrism, single-source golden candlelight & oil-glaze depth',
    visualLanguage: 'Dramatic Baroque chiaroscuro, rich oil-glaze textures, gilded corner flourishes, intimate shadow play',
    lightingDirection: 'Directional Rembrandt amber spotlight emerging from pitch umber darkness',
    typographyStyle: 'Dramatic old-style serif headline with warm antique gold plaques',
    paletteHex: ['#0C0806', '#E09F3E', '#6B141A', '#F9EEDB'],
    aliases: ['chiaroscuro', 'asymmetric_editorial'],
  },
  {
    id: 'cubism_picasso',
    label: 'Cubism / Picasso-inspired',
    styleFamily: 'Abstract geometric design',
    defaultLayoutTemplate: 'asymmetric_club_column',
    tagline: 'Multi-perspective fractured geometric planes & bold angular facets',
    visualLanguage: 'Analytical and synthetic Cubist silhouettes, overlapping angular facets, expressive charcoal contours',
    lightingDirection: 'Prismatic planar illumination across contrasting terracotta, cobalt, and ochre facets',
    typographyStyle: 'Bold geometric modernist display with asymmetric structural alignment',
    paletteHex: ['#12141C', '#D95D39', '#2B59C3', '#F4F1EA'],
    aliases: ['bauhaus_constructivist'],
  },
  {
    id: 'surrealist',
    label: 'Surrealist',
    styleFamily: 'Surrealist nightscape',
    defaultLayoutTemplate: 'gallery_minimal_mat',
    tagline: 'Dreamscape horizons, celestial spheres & impossible velvet portals',
    visualLanguage: 'Uncanny dreamscape architecture, floating celestial moons, draped curtains opening to twilight infinity',
    lightingDirection: 'Ethereal bioluminescent violet and celestial gold twilight glow',
    typographyStyle: 'Poetic wide-tracked serif floating within a gallery frame',
    paletteHex: ['#0A0B1E', '#C86BFA', '#F0C975', '#F3EEFF'],
    aliases: ['surrealist_dreamscape', 'floating_gallery_frame'],
  },
  {
    id: 'art_nouveau',
    label: 'Art Nouveau',
    styleFamily: 'Modernist collage',
    defaultLayoutTemplate: 'velvet_medallion_crest',
    tagline: 'Sinuous botanical curves, gilded halo medallions & stained glass',
    visualLanguage: 'Alphonse Mucha-inspired botanical whiplash curves, ornate floral filigree arches, mosaic medallions',
    lightingDirection: 'Luminous stained-glass backlight with burnished antique gold highlights',
    typographyStyle: 'Ornamental flowing serif framed by organic botanical borders',
    paletteHex: ['#0A1612', '#D8A852', '#B84A69', '#F8F2E6'],
    aliases: ['art_nouveau'],
  },
  {
    id: 'contemporary_museum',
    label: 'Contemporary Museum',
    styleFamily: 'Editorial fashion poster',
    defaultLayoutTemplate: 'gallery_minimal_mat',
    tagline: 'Curated exhibition framing, monolithic forms & gallery matting',
    visualLanguage: 'Museum exhibition poster aesthetic, sculptural forms, generous negative space, catalog index lines',
    lightingDirection: 'Crisp museum track lighting casting clean architectural shadows',
    typographyStyle: 'Refined exhibition sans-serif paired with monospace curatorial index notes',
    paletteHex: ['#0F1014', '#E03C31', '#64748B', '#FFFFFF'],
    aliases: ['editorial_fashion'],
  },
  {
    id: 'minimalist_editorial',
    label: 'Minimalist Editorial',
    styleFamily: 'Minimalist architectural',
    defaultLayoutTemplate: 'swiss_modular_grid',
    tagline: 'Swiss mathematical grid, crisp hairlines & architectural restraint',
    visualLanguage: 'International Typographic Style modular grid, stark geometric balance, precision hairline rules',
    lightingDirection: 'High-contrast studio clarity with restrained signal-red accents',
    typographyStyle: 'Neo-grotesque Swiss grid typography with strict flush-left hierarchy',
    paletteHex: ['#090A0D', '#F0323C', '#334155', '#F8FAFC'],
    aliases: ['swiss_typographic'],
  },
  {
    id: 'vintage_disco',
    label: 'Vintage Disco',
    styleFamily: 'Art Deco luxury',
    defaultLayoutTemplate: 'deco_gilded_arch',
    tagline: 'Studio 54 mirrorball prisms, concentric gold ribbons & starbursts',
    visualLanguage: '1970s analog disco glamour, mirrorball prism flares, concentric ribbon arches, halftone warmth',
    lightingDirection: 'Warm golden starbursts and magenta dancefloor prism reflections',
    typographyStyle: 'Bold expressive retro display with warm gold and tangerine plaques',
    paletteHex: ['#16081C', '#F7B801', '#F15BB5', '#FFF8EB'],
    aliases: ['retro_70s'],
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    styleFamily: 'Neo-noir evening scene',
    defaultLayoutTemplate: 'noir_diagonal_split',
    tagline: 'Anamorphic widescreen depth, neon bokeh & neo-noir atmosphere',
    visualLanguage: 'Anamorphic cinema poster framing, rain-slicked neon reflections, deep atmospheric perspective',
    lightingDirection: 'Teal-and-amber anamorphic rim lighting with volumetric night mist',
    typographyStyle: 'Condensed widescreen cinema title with classic billing-block metadata',
    paletteHex: ['#061017', '#F59E0B', '#EC4899', '#F1F5F9'],
    aliases: ['cyberpunk_neon', 'editorial_bottom_third'],
  },
  {
    id: 'surprise_me',
    label: 'Surprise Me',
    styleFamily: 'surprise_me',
    defaultLayoutTemplate: 'auto',
    tagline: 'Curator selects a fresh, contrasting artistic direction on every reroll',
    visualLanguage: 'Dynamic exploration across classical, avant-garde, editorial, and nightlife movements',
    lightingDirection: 'Adaptive dramatic lighting tuned to event theme and club branding',
    typographyStyle: 'Matched to the selected artistic movement',
    paletteHex: ['#0D0F17', '#E11D48', '#F59E0B', '#F8FAFC'],
  },
];

export const getCuratorArtworkStyleCategory = (
  idOrLabel: string | null | undefined,
): CuratorArtworkStyleCategory => {
  const clean = String(idOrLabel || '').trim().toLowerCase();
  if (!clean) return CURATOR_ARTWORK_STYLE_CATEGORIES[1]; // Classic Nightclub default
  return (
    CURATOR_ARTWORK_STYLE_CATEGORIES.find(
      (c) =>
        c.id.toLowerCase() === clean ||
        c.label.toLowerCase() === clean ||
        c.styleFamily.toLowerCase() === clean ||
        (c.aliases && c.aliases.some((alias) => alias.toLowerCase() === clean)),
    ) || CURATOR_ARTWORK_STYLE_CATEGORIES[1] // Classic Nightclub default
  );
};

export interface CuratorCandidateDraftEdits {
  title?: string;
  description?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  venue?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  clubId?: string;
  clubName?: string;
  hostId?: string;
  hostName?: string;
  sourceUrl?: string;
  ticketUrl?: string;
  rsvpUrl?: string;
  theme?: string;
  dressCode?: string;
  restrictions?: string;
  admission?: string;
  membershipRequirement?: string;
  rsvpRequirement?: string;
  ageRequirement?: string;
  scheduleChanges?: string;
  customFlyerUrl?: string | null;
  customHeaderUrl?: string | null;
  notes?: string;
  updatedAt?: string;
}

const CURATOR_DRAFTS_STORAGE_KEY = 'swingsphere:curator-candidate-drafts:v1';
const inMemoryCandidateDrafts = new Map<string, CuratorCandidateDraftEdits>();

export const loadCuratorCandidateDrafts = (): Record<string, CuratorCandidateDraftEdits> => {
  const out: Record<string, CuratorCandidateDraftEdits> = {};
  for (const [k, v] of inMemoryCandidateDrafts.entries()) {
    out[k] = { ...v };
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CURATOR_DRAFTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === 'object') {
              out[k] = { ...(out[k] || {}), ...(v as CuratorCandidateDraftEdits) };
              inMemoryCandidateDrafts.set(k, out[k]);
            }
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }
  return out;
};

const persistCuratorCandidateDraftsMap = (map: Record<string, CuratorCandidateDraftEdits>): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CURATOR_DRAFTS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage quota errors
    }
  }
};

export const getCuratorCandidateDraft = (
  candidateId: string,
): CuratorCandidateDraftEdits | null => {
  if (!candidateId) return null;
  const allDrafts = loadCuratorCandidateDrafts();
  return allDrafts[candidateId] || null;
};

export const saveCuratorCandidateDraft = (
  candidateId: string,
  patch: Partial<CuratorCandidateDraftEdits>,
): CuratorCandidateDraftEdits => {
  const allDrafts = loadCuratorCandidateDrafts();
  const next: CuratorCandidateDraftEdits = {
    ...(allDrafts[candidateId] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  allDrafts[candidateId] = next;
  inMemoryCandidateDrafts.set(candidateId, next);
  persistCuratorCandidateDraftsMap(allDrafts);
  return next;
};

export const clearCuratorCandidateDraft = (candidateId: string): void => {
  if (!candidateId) return;
  const allDrafts = loadCuratorCandidateDrafts();
  delete allDrafts[candidateId];
  inMemoryCandidateDrafts.delete(candidateId);
  persistCuratorCandidateDraftsMap(allDrafts);
};

export const mergeCandidateWithDraft = (
  candidate: CuratorCandidateRecord,
  draft?: CuratorCandidateDraftEdits | null,
): CuratorCandidateRecord => {
  const d = draft === undefined ? getCuratorCandidateDraft(candidate.id) : draft;
  if (!d) return candidate;
  return {
    ...candidate,
    title: d.title !== undefined ? d.title : candidate.title,
    description: d.description !== undefined ? d.description : candidate.description,
    displayDescription: d.description !== undefined ? d.description : candidate.displayDescription,
    date: d.date !== undefined ? d.date || null : candidate.date,
    endDate: d.endDate !== undefined ? d.endDate || null : candidate.endDate,
    startTime: d.startTime !== undefined ? d.startTime || null : candidate.startTime,
    endTime: d.endTime !== undefined ? d.endTime || null : candidate.endTime,
    timezone: d.timezone !== undefined ? d.timezone || null : candidate.timezone,
    venue: d.venue !== undefined ? d.venue || null : candidate.venue,
    address: d.address !== undefined ? d.address || null : candidate.address,
    city: d.city !== undefined ? d.city || null : candidate.city,
    region: d.region !== undefined ? d.region || null : candidate.region,
    country: d.country !== undefined ? d.country || null : candidate.country,
    clubId: d.clubId !== undefined ? d.clubId || null : candidate.clubId,
    clubName: d.clubName !== undefined ? d.clubName || candidate.clubName : candidate.clubName,
    hostId: d.hostId !== undefined ? d.hostId || null : candidate.hostId,
    hostName: d.hostName !== undefined ? d.hostName || null : candidate.hostName,
    sourceUrl: d.sourceUrl !== undefined ? d.sourceUrl || null : candidate.sourceUrl,
    ticketUrl: d.ticketUrl !== undefined ? d.ticketUrl || null : candidate.ticketUrl,
    rsvpUrl: d.rsvpUrl !== undefined ? d.rsvpUrl || null : candidate.rsvpUrl,
    theme: d.theme !== undefined ? d.theme || null : candidate.theme,
    dressCode: d.dressCode !== undefined ? d.dressCode || null : candidate.dressCode,
    restrictions: d.restrictions !== undefined ? d.restrictions || null : candidate.restrictions,
    admission: d.admission !== undefined ? d.admission || null : candidate.admission,
    membershipRequirement:
      d.membershipRequirement !== undefined ? d.membershipRequirement || null : candidate.membershipRequirement,
    rsvpRequirement: d.rsvpRequirement !== undefined ? d.rsvpRequirement || null : candidate.rsvpRequirement,
    ageRequirement: d.ageRequirement !== undefined ? d.ageRequirement || null : candidate.ageRequirement,
    scheduleChanges: d.scheduleChanges !== undefined ? d.scheduleChanges || null : candidate.scheduleChanges,
    customFlyerUrl: d.customFlyerUrl !== undefined ? d.customFlyerUrl : candidate.customFlyerUrl,
    customHeaderUrl: d.customHeaderUrl !== undefined ? d.customHeaderUrl : candidate.customHeaderUrl,
  };
};

export const getLocalCalendarDateForTimezone = (
  timeZone?: string | null,
  referenceTime: Date | string = new Date(),
): string => {
  const refDate = referenceTime instanceof Date ? referenceTime : new Date(referenceTime || Date.now());
  const validRef = Number.isNaN(refDate.getTime()) ? new Date() : refDate;
  const tz = typeof timeZone === 'string' ? timeZone.trim() : '';
  const isUtcPlaceholder = /^(?:utc|gmt|etc\/utc|etc\/gmt|z|[+-]00:?00)$/i.test(tz);
  if (tz && !isUtcPlaceholder) {
    const offsetMatch = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (offsetMatch) {
      const sign = offsetMatch[1] === '-' ? -1 : 1;
      const offsetMinutes = sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
      const shifted = new Date(validRef.getTime() + offsetMinutes * 60000);
      const y = shifted.getUTCFullYear();
      const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const d = String(shifted.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(validRef);
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const d = parts.find((p) => p.type === 'day')?.value;
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      // Fall through to local system date if timezone string is unrecognized
    }
  }
  const y = validRef.getFullYear();
  const m = String(validRef.getMonth() + 1).padStart(2, '0');
  const d = String(validRef.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getActiveCuratorCutoffDate = (
  timeZone?: string | null,
  referenceTime: Date | string = new Date(),
  minEligibleDate: string | null = null,
): string => {
  const localToday = getLocalCalendarDateForTimezone(timeZone, referenceTime);
  const systemLocalToday = getLocalCalendarDateForTimezone(null, referenceTime);
  const baseCutoff = systemLocalToday < localToday ? systemLocalToday : localToday;
  return minEligibleDate && minEligibleDate > baseCutoff ? minEligibleDate : (minEligibleDate || baseCutoff);
};

export const isCandidateDateExpired = (
  dateStr?: string | null,
  timeZone?: string | null,
  referenceTime: Date | string = new Date(),
  minEligibleDate: string | null = null,
): boolean => {
  const cleanDate = typeof dateStr === 'string' ? dateStr.trim() : '';
  if (!cleanDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return false;
  }
  const effectiveCutoff = getActiveCuratorCutoffDate(timeZone, referenceTime, minEligibleDate);
  return cleanDate < effectiveCutoff;
};

export const isCandidateArchivedOrExpired = (
  candidate: Pick<CuratorCandidateRecord, 'date' | 'timezone' | 'reviewState' | 'auditCategory' | 'archivedAsHistorical'>,
  options?: { referenceTime?: Date | string; minEligibleDate?: string | null },
): boolean => {
  const dateExpired = isCandidateDateExpired(
    candidate.date,
    candidate.timezone,
    options?.referenceTime ?? new Date(),
    options?.minEligibleDate ?? null,
  );
  if (options?.referenceTime !== undefined) {
    return dateExpired;
  }
  return Boolean(
    dateExpired ||
      candidate.archivedAsHistorical ||
      candidate.reviewState === 'historical_not_for_publication' ||
      candidate.auditCategory === 'historical_event',
  );
};

export const isCandidateExcludedDuplicate = (
  candidate:
    | Pick<
        CuratorCandidateRecord,
        | 'reviewState'
        | 'reconciliationState'
        | 'auditCategory'
        | 'duplicateClassification'
        | 'canonicalCandidateId'
        | 'duplicateOfCandidateId'
      >
    | null
    | undefined,
): boolean => {
  if (!candidate) return false;
  const dupClass = candidate.duplicateClassification || null;
  return Boolean(
    candidate.reviewState === 'possible_duplicate' ||
      candidate.reviewState === 'excluded_duplicate_translation' ||
      candidate.reconciliationState === 'duplicate_translation' ||
      candidate.auditCategory === 'possible_duplicate' ||
      candidate.auditCategory === 'duplicate_translation' ||
      dupClass === 'affiliate_referral_duplicate' ||
      dupClass === 'multi_branch_shared_domain_duplicate' ||
      dupClass === 'same_club_duplicate' ||
      dupClass === 'cross_source_duplicate' ||
      dupClass === 'duplicate_translation' ||
      candidate.canonicalCandidateId ||
      candidate.duplicateOfCandidateId,
  );
};

export interface CuratorEditorialValidationSummary {
  missingRequiredFields: string[];
  suspiciousDateWarnings: string[];
  conflictingDetailsWarnings: string[];
  eligibilityWarnings: string[];
  generalWarnings: string[];
  allWarnings: Array<{
    severity: 'error' | 'warning' | 'info';
    category: 'missing_field' | 'suspicious_date' | 'conflict' | 'eligibility' | 'general';
    message: string;
    field?: string;
  }>;
  canApprove: boolean;
  blockingReasons: string[];
}

export const validateCandidateForEditorialReview = (
  candidate: CuratorCandidateRecord,
  draft?: CuratorCandidateDraftEdits | null,
  options?: { referenceTime?: Date | string; minEligibleDate?: string | null },
): CuratorEditorialValidationSummary => {
  const merged = mergeCandidateWithDraft(candidate, draft);
  const missingRequiredFields: string[] = [];
  const suspiciousDateWarnings: string[] = [];
  const conflictingDetailsWarnings: string[] = [];
  const eligibilityWarnings: string[] = [];
  const generalWarnings: string[] = [];
  const allWarnings: CuratorEditorialValidationSummary['allWarnings'] = [];
  const blockingReasons: string[] = [];

  if (!String(merged.title || '').trim()) {
    missingRequiredFields.push('title');
    blockingReasons.push('Event title is required before approval.');
    allWarnings.push({
      severity: 'error',
      category: 'missing_field',
      field: 'title',
      message: 'Missing required field: Event Title.',
    });
  }

  if (!String(merged.date || '').trim()) {
    missingRequiredFields.push('date');
    blockingReasons.push('Verified event date (YYYY-MM-DD) is required before approval.');
    allWarnings.push({
      severity: 'error',
      category: 'missing_field',
      field: 'date',
      message: 'Missing required field: Event Date.',
    });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(merged.date).trim())) {
    suspiciousDateWarnings.push(`Event date "${merged.date}" is not in standard YYYY-MM-DD format.`);
    blockingReasons.push('Event date must be formatted as YYYY-MM-DD.');
    allWarnings.push({
      severity: 'error',
      category: 'suspicious_date',
      field: 'date',
      message: `Event date "${merged.date}" is not in YYYY-MM-DD format.`,
    });
  } else {
    const year = Number(String(merged.date).slice(0, 4));
    const effectiveCutoff = getActiveCuratorCutoffDate(
      merged.timezone,
      options?.referenceTime ?? new Date(),
      options?.minEligibleDate ?? null,
    );
    if (isCandidateArchivedOrExpired(merged, options)) {
      suspiciousDateWarnings.push(
        `Event date (${merged.date}) has already occurred (active cutoff: ${effectiveCutoff}) and is archived as historical.`,
      );
      blockingReasons.push(
        `Expired event date (${merged.date}): only events on or after ${effectiveCutoff} are eligible for active approval and publication.`,
      );
      allWarnings.push({
        severity: 'error',
        category: 'suspicious_date',
        field: 'date',
        message: `Expired event date (${merged.date}) — event precedes active calendar date (${effectiveCutoff}).`,
      });
    } else if (year < 2025 || year > 2028) {
      suspiciousDateWarnings.push(`Event date year (${year}) appears outside the expected near-term window.`);
      allWarnings.push({
        severity: 'warning',
        category: 'suspicious_date',
        field: 'date',
        message: `Suspicious date year (${year}): verify against original source page.`,
      });
    }
  }

  if (!String(merged.clubName || merged.hostName || merged.venue || '').trim()) {
    missingRequiredFields.push('organizer');
    blockingReasons.push('Organizer, club, or venue association is required.');
    allWarnings.push({
      severity: 'error',
      category: 'missing_field',
      field: 'clubName',
      message: 'Missing organizer or club association.',
    });
  }

  if (!String(merged.startTime || '').trim()) {
    allWarnings.push({
      severity: 'warning',
      category: 'missing_field',
      field: 'startTime',
      message: 'Start time is not specified (defaults to 20:00 if left blank).',
    });
  }

  if (!String(merged.city || merged.address || '').trim()) {
    allWarnings.push({
      severity: 'warning',
      category: 'missing_field',
      field: 'city',
      message: 'City or venue location is missing.',
    });
  }

  if (!String(merged.description || merged.displayDescription || '').trim()) {
    allWarnings.push({
      severity: 'warning',
      category: 'missing_field',
      field: 'description',
      message: 'Event description is empty; adding a concise summary is recommended.',
    });
  }

  for (const inf of merged.inferredFields || []) {
    const msg = `Inferred ${inf.field}: ${inf.reason || 'Derived heuristically from source context'}`;
    suspiciousDateWarnings.push(msg);
    allWarnings.push({
      severity: 'warning',
      category: 'suspicious_date',
      field: inf.field,
      message: msg,
    });
  }

  for (const diff of (merged.fieldDiffs || []).filter((d) => d.changed)) {
    const msg = `Changed ${diff.label}: "${diff.originalValue ?? 'none'}" → "${diff.proposedValue ?? 'none'}"`;
    conflictingDetailsWarnings.push(msg);
    allWarnings.push({
      severity: 'info',
      category: 'conflict',
      field: diff.field,
      message: msg,
    });
  }

  if (
    merged.playPartyEligibility?.requiresHumanReview &&
    !merged.reviewDecision?.overridePlayPartyEligibility
  ) {
    const msg =
      merged.playPartyEligibility.reason ||
      'Ambiguous play-party eligibility: confirm whether this event qualifies for SwingSphere discovery.';
    eligibilityWarnings.push(msg);
    allWarnings.push({
      severity: 'warning',
      category: 'eligibility',
      message: msg,
    });
  }

  for (const rawW of merged.warnings || []) {
    const w =
      typeof rawW === 'string'
        ? rawW
        : rawW && typeof rawW === 'object'
          ? String((rawW as any).message || (rawW as any).reason || (rawW as any).type || JSON.stringify(rawW))
          : String(rawW || '');
    if (w && !generalWarnings.includes(w)) {
      generalWarnings.push(w);
      allWarnings.push({
        severity: 'warning',
        category: 'general',
        message: w,
      });
    }
  }

  if (merged.isClosureNotice || merged.candidateType === 'closure_notice') {
    blockingReasons.push('Closure notices cannot be approved as public events.');
  }
  if (isCandidateExcludedDuplicate(merged)) {
    const dupMsg = `Non-canonical duplicate (${merged.duplicateClassification || merged.reviewState || 'possible_duplicate'}) of ${merged.canonicalCandidateId || merged.duplicateOfCandidateId || 'canonical event'} — excluded from active approval queue.`;
    blockingReasons.push(dupMsg);
    allWarnings.push({
      severity: 'error',
      category: 'conflict',
      message: dupMsg,
    });
  }

  return {
    missingRequiredFields,
    suspiciousDateWarnings,
    conflictingDetailsWarnings,
    eligibilityWarnings,
    generalWarnings,
    allWarnings,
    canApprove: blockingReasons.length === 0,
    blockingReasons,
  };
};

export const sortCandidatesForEditorialQueue = (
  candidates: CuratorCandidateRecord[],
  mediaById?: Map<string, CuratorMediaItem>,
  options?: { referenceTime?: Date | string },
): CuratorCandidateRecord[] => {
  const scoreCandidate = (c: CuratorCandidateRecord): number => {
    let score = 0;
    if (isCandidateArchivedOrExpired(c, options) || isCandidateExcludedDuplicate(c)) {
      score -= 10000;
    }
    const sigCategory = c.eventSignificance?.category;
    if (sigCategory === 'special_event') score += 5000;
    else if (sigCategory === 'monthly_signature') score += 4000;
    else if (sigCategory === 'weekly_signature') score += 3000;
    else if (sigCategory === 'needs_human_review' || !sigCategory) score += 1500;
    else if (sigCategory === 'routine_club_night') score += 0;

    if (c.eventSignificance?.playPartyEligible || c.playPartyEligibility?.qualified) {
      score += 250;
    }
    if (c.eventSignificance?.confidence === 'high') {
      score += 120;
    } else if (c.eventSignificance?.confidence === 'medium') {
      score += 60;
    }

    const m = mediaById?.get(c.id) || null;
    const hasLocalGeneratedPair = Boolean(
      c.stagedMedia?.hasGeneratedPair ||
        m?.hasGeneratedPair ||
        (c.stagedMedia?.flyerPreviewUrl?.includes('/api/admin/curator/media-preview') &&
          c.stagedMedia?.heroPreviewUrl?.includes('/api/admin/curator/media-preview')),
    );
    const hasAnyFlyer = Boolean(
      c.customFlyerUrl ||
        c.stagedMedia?.flyerPreviewUrl ||
        m?.previewUrls?.flyer ||
        c.flyerUrl ||
        (c.discoveredImages && c.discoveredImages.length > 0),
    );
    const hasValidDate = Boolean(c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date));
    const hasDescription = Boolean((c.displayDescription || c.description || '').trim().length > 25);

    if (hasLocalGeneratedPair && hasValidDate) score += 600;
    else if (hasLocalGeneratedPair) score += 450;
    else if (hasAnyFlyer && hasValidDate) score += 300;
    else if (hasValidDate) score += 150;

    if (hasDescription) score += 80;
    if (c.publishEligible) score += 50;
    if (!c.isClosureNotice) score += 40;
    if (c.reconciliationState === 'correction_proposed') score += 20;

    return score;
  };

  return [...candidates].sort((a, b) => {
    const scoreDiff = scoreCandidate(b) - scoreCandidate(a);
    if (scoreDiff !== 0) return scoreDiff;
    const dateA = a.date || '9999-99-99';
    const dateB = b.date || '9999-99-99';
    return dateA.localeCompare(dateB);
  });
};

export const filterCandidatesByQueueSignificance = (
  candidates: CuratorCandidateRecord[],
  filter: CuratorQueueSignificanceFilter,
  options?: {
    referenceTime?: Date | string;
    includeArchivedHistorical?: boolean;
    includeExcludedDuplicates?: boolean;
  },
): CuratorCandidateRecord[] => {
  const pool = candidates.filter((c) => {
    if (!options?.includeArchivedHistorical && isCandidateArchivedOrExpired(c, options)) {
      return false;
    }
    if (!options?.includeExcludedDuplicates && isCandidateExcludedDuplicate(c)) {
      return false;
    }
    return true;
  });
  if (filter === 'all') {
    return pool;
  }
  if (filter === 'recommended') {
    return pool.filter((c) => {
      if (c.eventSignificance) {
        return Boolean(c.eventSignificance.recommendedForQueue);
      }
      return Boolean(!c.isClosureNotice && c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date));
    });
  }
  return pool.filter((c) => (c.eventSignificance?.category || 'needs_human_review') === filter);
};

export const overrideCandidateSignificance = async (
  candidateId: string,
  options: {
    category?: CuratorSignificanceCategory;
    notes?: string;
    resetOverride?: boolean;
  },
): Promise<Awaited<ReturnType<typeof sendCuratorCommand>>> => {
  return sendCuratorCommand({
    idempotencyKey: buildCommandIdempotencyKey(
      'candidate_override_significance',
      candidateId,
      `${options.resetOverride ? 'reset' : options.category || ''}:${Date.now()}`,
    ),
    commandType: 'candidate_override_significance',
    targetId: candidateId,
    payload: {
      category: options.category,
      notes: options.notes || '',
      resetOverride: Boolean(options.resetOverride),
    },
  });
};

// =============================================================================
// Creative Brief Prompt Generation, Local Prompt Storage & Upload Validation
// =============================================================================

export type CuratorArtworkRole = 'flyer' | 'hero';

export type CuratorFlyerLayoutPatternId =
  | 'top_logo_centered_title_bottom_info'
  | 'logo_top_left_title_center_stacked_details'
  | 'poster_bold_title_side_info_column'
  | 'editorial_layout_footer_metadata'
  | 'nightlife_flyer_badge_callouts';

export type CuratorHeroLayoutPatternId =
  | 'top_left_brand_lower_left_title_date_city'
  | 'centered_crest_widescreen_title_bar'
  | 'editorial_header_brand_lower_metadata';

export type CuratorLogoPlacement =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-corner';

export interface CuratorFlyerLayoutPatternSpec {
  id: CuratorFlyerLayoutPatternId;
  label: string;
  defaultLogoPlacement: CuratorLogoPlacement;
  hierarchySummary: string;
  compositionGuidance: string;
  safeZoneGuidance: string;
}

export interface CuratorHeroLayoutPatternSpec {
  id: CuratorHeroLayoutPatternId;
  label: string;
  defaultLogoPlacement: CuratorLogoPlacement;
  hierarchySummary: string;
  compositionGuidance: string;
  safeZoneGuidance: string;
}

export const CURATOR_FLYER_LAYOUT_PATTERNS: Record<
  CuratorFlyerLayoutPatternId,
  CuratorFlyerLayoutPatternSpec
> = {
  top_logo_centered_title_bottom_info: {
    id: 'top_logo_centered_title_bottom_info',
    label: 'Top Logo + Centered Title + Bottom Info',
    defaultLogoPlacement: 'top-center',
    hierarchySummary:
      '1. Top-center club/organizer logo or crest → 2. Monumental centered event title → 3. Centered date & time bar → 4. Venue & city line → 5. Theme / host / dress code pill block → 6. Clean footer URL',
    compositionGuidance:
      'Anchor the primary brand mark in the upper-center pediment (top 14%), frame the central subject with balanced architectural symmetry, and place the primary event title and structured date/time/location block in the lower third.',
    safeZoneGuidance:
      'Maintain 64px outer margins; keep the top 14% and bottom 28% free of busy mid-tone clutter so centered typography and logo marks read with effortless contrast.',
  },
  logo_top_left_title_center_stacked_details: {
    id: 'logo_top_left_title_center_stacked_details',
    label: 'Logo Top-Left + Title Center + Stacked Detail Block',
    defaultLogoPlacement: 'top-left',
    hierarchySummary:
      '1. Top-left brand logo + presenter lockup → 2. Bold central/flush-left event title → 3. Stacked modular date + start/end time row → 4. Venue & city row → 5. Stacked host / theme / dress code / highlight rows → 6. Bottom-left URL',
    compositionGuidance:
      'Place the club/organizer logo lockup at top-left, stage the hero visual across the upper-right and mid-canvas, and align a crisp Swiss-style stacked detail block in the lower-left and center-bottom.',
    safeZoneGuidance:
      'Maintain a 72px left structural grid column; preserve high-contrast dark or calm tonal backing behind the top-left brand zone and lower stacked metadata block.',
  },
  poster_bold_title_side_info_column: {
    id: 'poster_bold_title_side_info_column',
    label: 'Poster-Style Bold Title with Side Info Column',
    defaultLogoPlacement: 'top-left',
    hierarchySummary:
      '1. Top-left organizer mark → 2. Oversized poster headline spanning upper/mid grid → 3. Structured vertical side info column with date + time → 4. Venue & city block → 5. Host, theme, dress code & special feature notes → 6. Vertical or footer URL',
    compositionGuidance:
      'Use an asymmetric avant-garde poster grid: pair a commanding headline treatment with a dedicated vertical side metadata column divided by fine hairlines, leaving two-thirds of the canvas for dramatic figurative or architectural imagery.',
    safeZoneGuidance:
      'Reserve a clean 280px side/lower-left metadata column with low visual noise so stacked secondary details remain crisp and scannable.',
  },
  editorial_layout_footer_metadata: {
    id: 'editorial_layout_footer_metadata',
    label: 'Editorial Layout with Footer Metadata',
    defaultLogoPlacement: 'top-right',
    hierarchySummary:
      '1. Discreet upper-right or bottom-corner brand mark → 2. Poised editorial exhibition title → 3. Structured multi-column footer with date & time → 4. Location / venue → 5. Curated theme, host & attire notes → 6. Footer URL',
    compositionGuidance:
      'Let the fine-art or cinematic scene breathe across the upper 72% of the 4:5 canvas, grounding the poster with an architectural lower curatorial plinth that organizes title, date/time, venue, and supporting details in a refined editorial footer.',
    safeZoneGuidance:
      'Keep the bottom 26% of the frame dark and tonally consistent to support the multi-column editorial metadata plinth.',
  },
  nightlife_flyer_badge_callouts: {
    id: 'nightlife_flyer_badge_callouts',
    label: 'Nightlife Flyer Layout with Badge Blocks & Callout Circles',
    defaultLogoPlacement: 'top-center',
    hierarchySummary:
      '1. Top club/promoter logo crest → 2. High-impact nightlife display title → 3. Prominent date & hours banner → 4. Venue & city marquee line → 5. Intentional callout badges / circles for costume, prize, theme & host → 6. Bottom ticket/event URL bar',
    compositionGuidance:
      'Design an authentic collector-grade nightlife promotional flyer where the central visual subject is flanked by deliberate geometric badge blocks or circular callout seals highlighting special features (e.g., costume contest, prizes, dress code, or theme) above a bold date/venue marquee.',
    safeZoneGuidance:
      'Position badge callouts in dedicated upper-right or lower-side negative-space pockets so they never obscure faces, architectural focal points, or the primary headline.',
  },
};

export const CURATOR_HERO_LAYOUT_PATTERNS: Record<
  CuratorHeroLayoutPatternId,
  CuratorHeroLayoutPatternSpec
> = {
  top_left_brand_lower_left_title_date_city: {
    id: 'top_left_brand_lower_left_title_date_city',
    label: 'Top-Left Brand + Lower-Left Title & Date/Location',
    defaultLogoPlacement: 'top-left',
    hierarchySummary:
      '1. Top-left club/organizer logo or typographic mark → 2. Widescreen lower-left event title → 3. Concise date & city/venue line → 4. Optional short subheading',
    compositionGuidance:
      'Stage the primary architectural and atmospheric focal point across the center-right of the 16:9 frame while maintaining a calm, softly shaded left-third zone that anchors the brand mark, event title, date, and city.',
    safeZoneGuidance:
      'Keep the right 55% open for environmental immersion and maintain 96px top/bottom/side safe margins so website navigation and UI badges never collide with hero text.',
  },
  centered_crest_widescreen_title_bar: {
    id: 'centered_crest_widescreen_title_bar',
    label: 'Centered Brand Crest + Widescreen Title & Date/Location Bar',
    defaultLogoPlacement: 'top-center',
    hierarchySummary:
      '1. Upper-center brand crest/wordmark → 2. Poised centered cinematic title in lower third → 3. Clean date · location line → 4. Optional short thematic subheading',
    compositionGuidance:
      'Use widescreen one-point perspective or panoramic staging with a calm lower-center horizon band that supports a cinema-grade title and date/city lockup without flyer-level text clutter.',
    safeZoneGuidance:
      'Keep top-left, top-right, and bottom corners clear of text so website UI controls and status pills overlay cleanly.',
  },
  editorial_header_brand_lower_metadata: {
    id: 'editorial_header_brand_lower_metadata',
    label: 'Editorial Brand Header + Lower Widescreen Metadata Lockup',
    defaultLogoPlacement: 'top-right',
    hierarchySummary:
      '1. Upper-right or lower-left institutional/club mark → 2. Editorial widescreen headline → 3. Date & city/location → 4. Concise presenter/theme subheading',
    compositionGuidance:
      'Balance an expansive 16:9 gallery or nocturnal environment with a restrained lower-left editorial title block and a clean upper brand signature.',
    safeZoneGuidance:
      'Preserve generous negative space across the upper-left and center-right for responsive website hero cropping.',
  },
};

export interface CuratorPromotionalFieldItem {
  key:
    | 'brand'
    | 'logo'
    | 'title'
    | 'date'
    | 'time'
    | 'location'
    | 'theme'
    | 'host'
    | 'dressCode'
    | 'highlight'
    | 'admission'
    | 'url'
    | 'subheading';
  label: string;
  value: string;
  tier: 'brand' | 'primary' | 'secondary';
}

export interface CuratorPromotionalOmittedItem {
  field: string;
  label: string;
  reason: 'missing_from_source' | 'excluded_verbose_or_internal' | 'omitted_for_hero_simplicity';
}

export interface CuratorPromotionalContentSchema {
  primaryBrand: string | null;
  secondaryVenue: string | null;
  hostPresenter: string | null;
  presentingLine: string;
  logoUrl: string | null;
  hasLogoAsset: boolean;
  logoSourceStatus: 'logo_asset_available' | 'typographic_fallback';
  logoPlacement: CuratorLogoPlacement;
  heroLogoPlacement: CuratorLogoPlacement;
  logoFallbackText: string;
  multiBrandStrategySummary: string;
  eventTitle: string;
  dateIso: string | null;
  dateDisplay: string | null;
  timeDisplay: string | null;
  dateAndTimeDisplay: string | null;
  flyerLocationDisplay: string | null;
  heroLocationDisplay: string | null;
  cityDisplay: string | null;
  theme: string | null;
  hostDisplay: string | null;
  dressCodeOrCostume: string | null;
  prizeOrHighlight: string | null;
  admissionSummary: string | null;
  displayUrl: string | null;
  heroSubheading: string | null;
  flyerLayoutPattern: CuratorFlyerLayoutPatternSpec;
  heroLayoutPattern: CuratorHeroLayoutPatternSpec;
  flyerIncludedFields: CuratorPromotionalFieldItem[];
  heroIncludedFields: CuratorPromotionalFieldItem[];
  omittedFields: CuratorPromotionalOmittedItem[];
  missingRequiredFields: string[];
  isArtOnlyMissingMetadata: boolean;
  promotionalStatus:
    | 'complete_promotional_info'
    | 'partial_promotional_info'
    | 'art_only_missing_metadata';
}

export interface CuratorGeneratedArtworkPrompt {
  candidateId: string;
  role: CuratorArtworkRole;
  styleCategoryId: string;
  styleCategoryLabel: string;
  styleLabel: string;
  styleFamily: string;
  targetAspectRatio: '4:5' | '16:9';
  aspectRatio: '4:5' | '16:9';
  targetResolution: '1080 × 1350' | '1920 × 1080';
  targetWidth: 1080 | 1920;
  targetHeight: 1350 | 1080;
  layoutPatternId: CuratorFlyerLayoutPatternId | CuratorHeroLayoutPatternId;
  layoutPatternLabel: string;
  logoPlacement: CuratorLogoPlacement;
  promotionalContent: CuratorPromotionalContentSchema;
  promptText: string;
  generatedAt: string;
  sections: {
    mainVisualConcept: string;
    settingAndEnvironment: string;
    artisticTradition: string;
    composition: string;
    subjectMatter: string;
    lighting: string;
    colorPalette: string;
    moodAndAtmosphere: string;
    brandAndLogoStrategy: string;
    requiredTextAndHierarchy: string;
    supportingDetailsAndOmissions: string;
    typographyTreatment: string;
    elementsToAvoid: string;
    outputRequirements: string;
  };
}

interface StyleCreativeBriefDirective {
  artisticTradition: string;
  mediumAndSurface: string;
  flyerComposition: string;
  heroComposition: string;
  subjectApproach: string;
  lightingApproach: string;
  typographyDirection: string;
  moodTone: string;
  flyerLayoutPatternId: CuratorFlyerLayoutPatternId;
  heroLayoutPatternId: CuratorHeroLayoutPatternId;
  preferredLogoPlacement: CuratorLogoPlacement;
  styleAwareInfoDesign: string;
}

const STYLE_CREATIVE_BRIEF_DIRECTIVES: Record<string, StyleCreativeBriefDirective> = {
  underground_rave: {
    artisticTradition:
      'Berlin & Detroit underground club flyer graphic design (Tresor / Berghain archival print aesthetic), late-1990s rave screenprint posters, and brutalist architectural photography.',
    mediumAndSurface:
      'High-contrast duotone screenprint grain, raw board-formed concrete textures, brushed industrial steel, and volumetric laser refraction through atmospheric club haze.',
    flyerComposition:
      'Vertical 4:5 poster composition driven by a receding monolithic concrete corridor or industrial turbine hall; strong diagonal laser planes frame a high-contrast negative-space header and side/lower typographic grid.',
    heroComposition:
      'Panoramic 16:9 wide-angle architectural view across a cavernous subterranean warehouse sanctuary with rhythmic concrete pillars, suspended lighting rigs, and deep horizon haze.',
    subjectApproach:
      'Architectural silhouettes in sleek black evening and avant-garde club attire seen through backlit mist, brushed steel portals, acoustic baffles, and kinetic light beams.',
    lightingApproach:
      'Piercing cyan (#00F0FF) and crimson (#FF1E56) volumetric laser shafts slicing through obsidian (#07080C) warehouse darkness with wet concrete specular reflections.',
    typographyDirection:
      'Heavy condensed industrial grotesque uppercase for the headline, paired with Swiss technical monospace metadata blocks and hairline grid dividers.',
    moodTone: 'Kinetic, subterranean, electric, nocturnal, and unapologetically avant-garde.',
    flyerLayoutPatternId: 'poster_bold_title_side_info_column',
    heroLayoutPatternId: 'top_left_brand_lower_left_title_date_city',
    preferredLogoPlacement: 'top-left',
    styleAwareInfoDesign:
      'Integrate event metadata into a brutalist Swiss techno grid with exposed hairline borders, industrial stencil/monospace time & coordinates blocks, and high-contrast nocturnal legibility.',
  },
  classic_nightclub: {
    artisticTradition:
      '1920s–1930s Art Deco luxury poster art (A.M. Cassandre, Tamara de Lempicka, Erté) fused with contemporary private members-club editorial photography.',
    mediumAndSurface:
      'Gilded brass inlay, cut crystal glassware, tufted midnight velvet upholstery, smoked mirror panels, and rich lithographic satin finish.',
    flyerComposition:
      'Symmetrical 4:5 vertical stepped Art Deco arch framing a private candlelit lounge alcove; stepped brass sunrays draw the eye toward a poised central focal point with a clean upper/lower marquee zone.',
    heroComposition:
      'Widescreen 16:9 architectural panorama of an opulent midnight cocktail salon with curved velvet banquettes, glowing amber bar tiers, and polished dark marble floors.',
    subjectApproach:
      'Poised silhouettes in tailored black-tie and couture evening wear toasting with cut-crystal coupes beneath stepped brass chandeliers and velvet drapery.',
    lightingApproach:
      'Warm champagne gold (#E6C27A) uplighting and candle glow contrasting against deep burgundy (#7A1228) and midnight indigo (#0B0714) velvet shadows.',
    typographyDirection:
      'High-contrast luxury Art Deco display serif with generous letter-spacing and fine gold hairline rules.',
    moodTone: 'Opulent, magnetic, discreet, glamorous, and celebratory.',
    flyerLayoutPatternId: 'top_logo_centered_title_bottom_info',
    heroLayoutPatternId: 'centered_crest_widescreen_title_bar',
    preferredLogoPlacement: 'top-center',
    styleAwareInfoDesign:
      'Present branding and event details inside a symmetrical Art Deco marquee with stepped champagne-gold hairline rules, centered club crest at top, commanding display headline, and poised VIP billing block below.',
  },
  renaissance: {
    artisticTradition:
      'Italian High Renaissance architectural painting and Venetian court frescoes (Paolo Veronese, Raphael, Andrea Palladio) reimagined for an exclusive modern nocturnal masquerade.',
    mediumAndSurface:
      'Warm tempera and oil-on-plaster fresco texture, travertine marble colonnades, carved stone balustrades, silk brocade drapery, and gold-leaf accents.',
    flyerComposition:
      'Vertical 4:5 single-point linear perspective through a Palladian triumphal arch and loggia colonnade opening onto a torchlit Venetian courtyard.',
    heroComposition:
      'Expansive 16:9 panoramic fresco view across a grand Renaissance palazzo terrace and vaulted hall overlooking a moonlit canal and classical gardens.',
    subjectApproach:
      'Draped silk cloaks, Venetian carnival masks resting on marble pedestals, classical stone arches, bronze candelabras, and mysterious courtly silhouettes.',
    lightingApproach:
      'Warm golden-hour and torchlit Renaissance illumination (#D9A75A) casting soft sculptural rim light across terracotta (#9E3B24) and warm ivory marble (#F7EFE2).',
    typographyDirection:
      'Trajan-inspired Roman inscription capitals with classical pediment spacing and engraved gold-leaf elegance.',
    moodTone: 'Timeless, courtly, romantic, sculptural, and enigmatic.',
    flyerLayoutPatternId: 'top_logo_centered_title_bottom_info',
    heroLayoutPatternId: 'centered_crest_widescreen_title_bar',
    preferredLogoPlacement: 'top-center',
    styleAwareInfoDesign:
      'Frame the club/organizer identity in the upper Palladian arch pediment and arrange the event title, date, time, venue, and masquerade/dress notes on a dark stone or gilt-bordered architectural frieze.',
  },
  baroque_rembrandt: {
    artisticTradition:
      'Dutch Golden Age and Italian Baroque tenebrism (Rembrandt van Rijn, Caravaggio, Georges de La Tour) featuring dramatic single-source candlelight and deep oil-glaze depth.',
    mediumAndSurface:
      'Rich Old Master oil painting on dark primed canvas with tactile impasto highlights, translucent amber glazes, crushed crimson velvet, and aged tarnished gold.',
    flyerComposition:
      'Intimate 4:5 vertical chiaroscuro study emerging from deep umber shadow; an off-center diagonal beam of candlelight illuminates a sumptuous table or velvet-draped threshold.',
    heroComposition:
      'Cinematic 16:9 widescreen Baroque tableau across a candlelit salon where islands of warm golden light emerge from vast, velvety darkness.',
    subjectApproach:
      'Hands raising a crystal goblet in candlelight, intricate lace and satin cuffs, Venetian masks, gilt frames, and evocative silhouettes half-hidden in shadow.',
    lightingApproach:
      'Extreme Rembrandt chiaroscuro: a single warm amber flame (#E09F3E) piercing pitch-black umber (#0C0806) and deep oxblood crimson (#6B141A) shadows.',
    typographyDirection:
      'Dramatic Old Style Baroque serif (Caslon / Garamond tradition) in burnished antique gold set against deep shadow.',
    moodTone: 'Intimate, theatrical, sumptuous, secretive, and deeply atmospheric.',
    flyerLayoutPatternId: 'editorial_layout_footer_metadata',
    heroLayoutPatternId: 'top_left_brand_lower_left_title_date_city',
    preferredLogoPlacement: 'top-center',
    styleAwareInfoDesign:
      'Use deep chiaroscuro negative space in the lower third and upper header so burnished antique-gold Old Style serif typography and club branding glow legibly against dark umber shadow.',
  },
  cubism_picasso: {
    artisticTradition:
      'Analytical and Synthetic Cubism (Pablo Picasso, Georges Braque, Juan Gris) combined with early modernist Parisian avant-garde exhibition poster design.',
    mediumAndSurface:
      'Oil and charcoal on textured canvas, layered papier collé collage planes, faux bois grain, and bold angular geometric facets.',
    flyerComposition:
      'Dynamic 4:5 vertical interlocking arrangement of fractured multi-perspective planes assembling abstract evening silhouettes, musical instruments, and cocktail glasses.',
    heroComposition:
      'Horizontal 16:9 panoramic Cubist mural where rhythmic angular planes of architecture, jazz-age nightlife motifs, and interlocking shadows span the widescreen canvas.',
    subjectApproach:
      'Simultaneous profile and frontal silhouettes, fractured crystal decanters, abstract stringed instruments, architectural staircases, and faceted masks.',
    lightingApproach:
      'Prismatic planar illumination where each geometric facet shifts between warm terracotta (#D95D39), deep cobalt (#2B59C3), charcoal (#12141C), and warm parchment (#F4F1EA).',
    typographyDirection:
      'Avant-garde modernist stencil and geometric sans-serif integrated into the angular structural grid.',
    moodTone: 'Artistic, intellectual, rhythmic, bold, and avant-garde.',
    flyerLayoutPatternId: 'poster_bold_title_side_info_column',
    heroLayoutPatternId: 'editorial_header_brand_lower_metadata',
    preferredLogoPlacement: 'top-left',
    styleAwareInfoDesign:
      'Treat the flyer like an authentic Parisian avant-garde gallery poster: lock the event title and side info column into crisp high-contrast architectural planes so geometric Cubist facets frame—rather than fragment—the text.',
  },
  surrealist: {
    artisticTradition:
      '20th-century Surrealist painting and metaphysical art (René Magritte, Giorgio de Chirico, Leonora Carrington, Salvador Dalí) with dreamlike nocturnal symbolism.',
    mediumAndSurface:
      'Smooth illusionistic oil painting, velvet curtains opening onto starlit skies, levitating marble spheres, and mirror-calm water reflections.',
    flyerComposition:
      'Poetic 4:5 vertical portal composition: tall crimson-and-violet velvet curtains part inside an impossible floating ballroom to reveal a crescent moon and twilight horizon.',
    heroComposition:
      'Expansive 16:9 metaphysical landscape featuring endless colonnaded arcades, floating celestial spheres, and a mirror-still nocturnal sea beneath a twilight sky.',
    subjectApproach:
      'Floating golden keys, levitating masquerade masks, doors opening into night clouds, chessboard marble terraces, and enigmatic bowler-hatted or cloaked silhouettes.',
    lightingApproach:
      'Uncanny bioluminescent twilight combining deep midnight indigo (#0A0B1E), luminous orchid violet (#C86BFA), and celestial gold (#F0C975) casting long metaphysical shadows.',
    typographyDirection:
      'Poetic wide-tracked literary serif floating effortlessly within the upper or lower dreamscape sky.',
    moodTone: 'Dreamlike, uncanny, poetic, hypnotic, and otherworldly.',
    flyerLayoutPatternId: 'top_logo_centered_title_bottom_info',
    heroLayoutPatternId: 'centered_crest_widescreen_title_bar',
    preferredLogoPlacement: 'top-center',
    styleAwareInfoDesign:
      'Stage the brand emblem in the calm twilight sky portal above and anchor the event title, date, time, location, and thematic callouts on a serene dark metaphysical plinth below.',
  },
  art_nouveau: {
    artisticTradition:
      'Belle Époque Art Nouveau poster illustration and Vienna Secession decorative arts (Alphonse Mucha, Gustav Klimt, Aubrey Beardsley).',
    mediumAndSurface:
      'Stone lithograph linework, intricate botanical whiplash curves, Byzantine gold-leaf mosaic patterns, and iridescent stained-glass color washes.',
    flyerComposition:
      'Ornate 4:5 vertical horseshoe arch and circular gilded halo medallion framed by sinuous iris, night-blooming jasmine, and peacock-feather filigree.',
    heroComposition:
      'Widescreen 16:9 Vienna Secession decorative frieze combining flowing botanical vines, gilded geometric mosaic panels, and an enchanted conservatory night scene.',
    subjectApproach:
      'Flowing silk gowns, stylized botanical trellises, gilded halo medallions, stained-glass lanterns, and ornamental wrought-iron conservatory arches.',
    lightingApproach:
      'Luminous stained-glass backlight in burnished gold (#D8A852) and rose-crimson (#B84A69) glowing against deep forest emerald-black (#0A1612).',
    typographyDirection:
      'Custom Belle Époque ornamental display lettering integrated into curved botanical banner cartouches.',
    moodTone: 'Romantic, ornamental, bohemian, enchanted, and luxurious.',
    flyerLayoutPatternId: 'top_logo_centered_title_bottom_info',
    heroLayoutPatternId: 'top_left_brand_lower_left_title_date_city',
    preferredLogoPlacement: 'top-center',
    styleAwareInfoDesign:
      'Incorporate dedicated Alphonse Mucha / Vienna Secession lithographic banner cartouches at the crown (for brand identity) and base (for event title, date, time, venue, and supporting details) so decorative borders frame readable text.',
  },
  contemporary_museum: {
    artisticTradition:
      'Contemporary fine-art museum exhibition design (Tate Modern, MoMA, Fondazione Prada) paired with monumental architectural sculpture photography.',
    mediumAndSurface:
      'Smooth gallery plaster walls, monolithic brushed bronze and black marble sculpture, matte museum rag paper texture, and surgical track lighting.',
    flyerComposition:
      'Curated 4:5 vertical exhibition poster layout: a striking sculptural centerpiece photographed in a dramatic dark gallery space with generous negative space for curatorial typography.',
    heroComposition:
      'Widescreen 16:9 architectural gallery installation view showing monumental abstract sculptures and warm light portals within a serene concrete-and-obsidian museum hall.',
    subjectApproach:
      'Abstract intertwined bronze and obsidian sculptures, architectural light apertures, minimal gallery benches, and distant contemplative figures in evening attire.',
    lightingApproach:
      'Crisp museum gallery spot illumination with signal-red (#E03C31) neon installation accents against matte slate (#64748B) and obsidian (#0F1014).',
    typographyDirection:
      'Refined contemporary museum grotesk paired with clean curatorial catalog index rules.',
    moodTone: 'Curated, intellectual, sculptural, gallery-grade, and sophisticated.',
    flyerLayoutPatternId: 'editorial_layout_footer_metadata',
    heroLayoutPatternId: 'editorial_header_brand_lower_metadata',
    preferredLogoPlacement: 'top-right',
    styleAwareInfoDesign:
      'Organize event metadata like a museum exhibition poster: top-right institutional/club mark, bold gallery grotesk title, and a structured lower curatorial index block with date, time, venue, host, and URL.',
  },
  minimalist_editorial: {
    artisticTradition:
      'Swiss International Typographic Style (Josef Müller-Brockmann, Armin Hofmann) fused with ultra-clean luxury architectural photography.',
    mediumAndSurface:
      'Matte obsidian architectural surfaces, frosted fluted glass, anodized aluminum, and high-precision graphic balance.',
    flyerComposition:
      'Strict 4:5 vertical asymmetric modular grid: bold architectural light-and-shadow geometry occupying two-thirds of the canvas, leaving a pristine dark zone for flush-left typography.',
    heroComposition:
      'Panoramic 16:9 minimalist architectural study of a sleek nocturnal pavilion where clean horizontal light slits and frosted glass screens create calm visual rhythm.',
    subjectApproach:
      'Pure architectural light apertures, silhouetted figures behind frosted fluted glass, single stemmed crimson botanical accents, and razor-sharp shadow geometry.',
    lightingApproach:
      'Surgical studio contrast with a single restrained signal-red (#F0323C) light bar cutting across deep graphite (#090A0D) and cool slate (#334155).',
    typographyDirection:
      'Neo-grotesque Swiss grid typography (Helvetica / Akzidenz tradition) with strict flush-left hierarchy.',
    moodTone: 'Precise, architectural, calm, editorial, and ultra-modern.',
    flyerLayoutPatternId: 'logo_top_left_title_center_stacked_details',
    heroLayoutPatternId: 'top_left_brand_lower_left_title_date_city',
    preferredLogoPlacement: 'top-left',
    styleAwareInfoDesign:
      'Apply a strict Swiss modular grid: top-left logo lockup, flush-left neo-grotesque headline, and crisp horizontal rule-separated rows for date, hours, location, dress code, and URL.',
  },
  vintage_disco: {
    artisticTradition:
      'Late-1970s Studio 54 nightlife photography, Italian cosmic disco record sleeves, and analog airbrush & halftone poster art.',
    mediumAndSurface:
      'Faceted mirrorball glass tiles, gold lamé fabric, warm 35mm analog film grain, chrome tubular furniture, and prismatic lens flares.',
    flyerComposition:
      'Vibrant 4:5 vertical dancefloor composition crowned by a glowing mirrorball casting hundreds of warm gold and magenta light flecks across concentric ribbon arches.',
    heroComposition:
      'Widescreen 16:9 panoramic view across a glamorous 1970s sunken velvet lounge and lit dancefloor bathed in warm amber and magenta mirrorball reflections.',
    subjectApproach:
      'Faceted disco mirrorballs, swirling silk halters and velvet blazers in silhouette, champagne towers, neon rainbow arches, and chrome lounge banquettes.',
    lightingApproach:
      'Euphoric golden starbursts (#F7B801) and electric magenta (#F15BB5) prism reflections dancing across deep plum-violet (#16081C) night shadows.',
    typographyDirection:
      'Expressive 1970s inline retro display serif with warm gold and tangerine glow.',
    moodTone: 'Euphoric, glamorous, hedonistic, warm, and celebratory.',
    flyerLayoutPatternId: 'nightlife_flyer_badge_callouts',
    heroLayoutPatternId: 'centered_crest_widescreen_title_bar',
    preferredLogoPlacement: 'top-center',
    styleAwareInfoDesign:
      'Use an authentic celebratory nightlife flyer hierarchy with top club crest, expressive 1970s display headline, bold date/time marquee, and circular/pill badge callouts for costume suggestions, prizes, or special features.',
  },
  cinematic: {
    artisticTradition:
      'Contemporary neo-noir cinema cinematography (Wong Kar-wai, Denis Villeneuve, Nicolas Winding Refn) shot on 35mm anamorphic lenses.',
    mediumAndSurface:
      'Fine 35mm motion-picture film grain, rain-slicked marble and asphalt reflections, shallow depth-of-field anamorphic oval bokeh, and atmospheric night mist.',
    flyerComposition:
      'Vertical 4:5 theatrical one-sheet movie poster composition: a mysterious silhouetted couple or solitary figure in a neon-lit archway with deep anamorphic bokeh and clear title space.',
    heroComposition:
      'True 16:9 widescreen cinematic master shot of a penthouse terrace or rain-kissed private courtyard at midnight, framed with natural left/right negative space for UI overlays.',
    subjectApproach:
      'Tailored evening coats, rain-beaded limousine windows, glowing amber lanterns reflected in wet stone, velvet elevator doors, and cinematic silhouettes.',
    lightingApproach:
      'Rich teal-and-amber anamorphic lighting (#061017 / #F59E0B) accented with warm neon rose (#EC4899) rim light and volumetric mist.',
    typographyDirection:
      'Widescreen cinema title treatment with classic film-poster spacing and clean lower billing-block hierarchy.',
    moodTone: 'Cinematic, atmospheric, mysterious, seductive, and nocturnal.',
    flyerLayoutPatternId: 'editorial_layout_footer_metadata',
    heroLayoutPatternId: 'top_left_brand_lower_left_title_date_city',
    preferredLogoPlacement: 'bottom-corner',
    styleAwareInfoDesign:
      'Format promotional copy like a theatrical cinema one-sheet poster: atmospheric presenter credit above, poised film-title lockup in the lower third, structured billing-block metadata (date, hours, location, dress code, URL), and corner club/studio emblem.',
  },
};

const pickConcreteStyleForSurpriseMe = (
  candidateId: string,
  role: CuratorArtworkRole,
  seedOffset = 0,
): CuratorArtworkStyleCategory => {
  const concrete = CURATOR_ARTWORK_STYLE_CATEGORIES.filter((c) => c.id !== 'surprise_me');
  const seedStr = `${candidateId}:${role}:${seedOffset}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return concrete[hash % concrete.length] || concrete[1];
};

const extractEventVisualCues = (
  merged: CuratorCandidateRecord,
  mediaItem?: CuratorMediaItem | null,
): {
  themeSummary: string;
  settingCue: string;
  subjectCue: string;
  audienceAndDressCue: string;
  venueIdentityCue: string;
} => {
  const title = String(merged.title || 'Untitled Event').trim();
  const description = String(merged.displayDescription || merged.description || '').trim();
  const rawTheme = String(
    merged.theme ||
      mediaItem?.descriptionAnalysis?.theme ||
      mediaItem?.officialImageAnalysis?.inferredTheme ||
      '',
  ).trim();
  const rawDress = String(
    merged.dressCode || mediaItem?.descriptionAnalysis?.dressCode || '',
  ).trim();
  const rawAudience = String(
    merged.restrictions ||
      merged.membershipRequirement ||
      mediaItem?.descriptionAnalysis?.audience ||
      '',
  ).trim();

  const combinedText = `${title} ${rawTheme} ${description} ${rawDress}`.toLowerCase();

  const themeParts: string[] = [];
  if (rawTheme) themeParts.push(rawTheme);
  if (/masquerade|mask|venetian/i.test(combinedText)) {
    themeParts.push('masquerade intrigue & ornate masks');
  }
  if (/sampler|scene|play party|workshop|tasting/i.test(combinedText)) {
    themeParts.push('curated experiential stations, intimate lounge vignettes & sensory exploration');
  }
  if (/glow|neon|uv|blacklight/i.test(combinedText)) {
    themeParts.push('ultraviolet neon glow & luminous body-light reflections');
  }
  if (/gala|black tie|formal|anniversary|new year|champagne/i.test(combinedText)) {
    themeParts.push('black-tie gala celebration & champagne toast');
  }
  if (/pool|tropical|summer|oasis|cabana/i.test(combinedText)) {
    themeParts.push('moonlit resort oasis, private cabanas & shimmering water reflections');
  }
  if (/leather|lace|fetish|kink|dungeon|rope|shibari/i.test(combinedText)) {
    themeParts.push('tactile leather, fine lace, sculptural rope geometry & dramatic shadow play (strictly SFW)');
  }
  if (/disco|70s|retro|boogie/i.test(combinedText)) {
    themeParts.push('analog disco dancefloor & mirrorball euphoria');
  }
  if (/halloween|haunted|gothic|vampire|october/i.test(combinedText)) {
    themeParts.push('gothic nocturnal theater, candlelit arches & velvet mystery');
  }

  const themeSummary =
    themeParts.length > 0
      ? Array.from(new Set(themeParts)).join('; ')
      : 'Elevated nocturnal social gathering and private lifestyle lounge experience';

  const venueName = String(merged.venue || merged.clubName || merged.hostName || 'Private Lifestyle Sanctuary').trim();
  const locationParts = [merged.city, merged.region, merged.country]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  const locationLabel = locationParts.length > 0 ? locationParts.join(', ') : 'an undisclosed metropolitan sanctuary';

  const settingCue = `Set within ${venueName} in ${locationLabel} — an upscale, private adult social sanctuary with layered architectural depth, intimate conversation alcoves, and warm atmospheric lighting.`;

  const derivedMotifs = [
    ...(mediaItem?.descriptionAnalysis?.derivedMotifs || []),
    ...(mediaItem?.officialImageAnalysis?.visualMotifs || []),
    ...(mediaItem?.motifs || []),
  ]
    .map((m) => String(m || '').trim())
    .filter(Boolean);

  const subjectCue =
    derivedMotifs.length > 0
      ? `Incorporate event-specific motifs (${Array.from(new Set(derivedMotifs)).slice(0, 5).join(', ')}) alongside ${themeSummary.toLowerCase()}.`
      : `Focus on evocative architectural framing, tactile luxury materials (velvet, brass, cut crystal, stone), and poised, mysterious evening silhouettes reflecting "${title}".`;

  const dressAndAudienceParts: string[] = [];
  if (rawDress) dressAndAudienceParts.push(`Dress code inspiration: ${rawDress}`);
  if (rawAudience) dressAndAudienceParts.push(`Audience & access context: ${rawAudience}`);
  if (merged.ageRequirement) dressAndAudienceParts.push(`Age requirement: ${merged.ageRequirement}`);
  const audienceAndDressCue =
    dressAndAudienceParts.length > 0
      ? dressAndAudienceParts.join(' | ')
      : 'Upscale cocktail, evening couture, or theme-appropriate club attire for an exclusive adult social audience';

  const clubIdentity = mediaItem?.clubIdentity;
  const venueIdentityParts: string[] = [];
  if (merged.clubName) venueIdentityParts.push(`Organizer / Club: ${merged.clubName}`);
  if (merged.hostName && merged.hostName !== merged.clubName) {
    venueIdentityParts.push(`Host: ${merged.hostName}`);
  }
  if (merged.venue && merged.venue !== merged.clubName) {
    venueIdentityParts.push(`Venue: ${merged.venue}`);
  }
  if (clubIdentity?.atmosphereSummary) {
    venueIdentityParts.push(`Venue identity: ${clubIdentity.atmosphereSummary}`);
  }
  if (clubIdentity?.brandMotifs && clubIdentity.brandMotifs.length > 0) {
    venueIdentityParts.push(`Brand motifs: ${clubIdentity.brandMotifs.join(', ')}`);
  }
  if (clubIdentity?.brandColors && clubIdentity.brandColors.length > 0) {
    venueIdentityParts.push(`Brand accent colors: ${clubIdentity.brandColors.join(', ')}`);
  }

  const venueIdentityCue =
    venueIdentityParts.length > 0
      ? venueIdentityParts.join(' · ')
      : `Hosted by ${venueName} (${locationLabel})`;

  return {
    themeSummary,
    settingCue,
    subjectCue,
    audienceAndDressCue,
    venueIdentityCue,
  };
};

const formatTimeTokenClean = (raw: string | null | undefined): string | null => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/am|pm/i.test(s)) return s.toUpperCase().replace(/\s+/g, ' ');
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return s;
  const h24 = Number(m[1]);
  const mins = m[2];
  if (Number.isNaN(h24) || h24 < 0 || h24 > 24) return s;
  const period = h24 >= 12 && h24 < 24 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins} ${period}`;
};

const formatDateIsoReadable = (
  dateIso: string | null | undefined,
  endDateIso?: string | null,
): string | null => {
  const raw = String(dateIso || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const dt = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return raw;
  const formattedStart = dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const rawEnd = String(endDateIso || '').trim();
  if (rawEnd && rawEnd !== raw && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) {
    const endDt = new Date(`${rawEnd}T12:00:00Z`);
    if (!Number.isNaN(endDt.getTime())) {
      const formattedEnd = endDt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
      return `${formattedStart} – ${formattedEnd}`;
    }
  }
  return formattedStart;
};

const splitEmbeddedVenueAndAddress = (
  rawText: string | null | undefined,
): { namePart: string | null; addressPart: string | null } => {
  const cleaned = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { namePart: null, addressPart: null };
  const firstCommaIdx = cleaned.indexOf(',');
  if (firstCommaIdx > 0) {
    const firstSegment = cleaned.slice(0, firstCommaIdx).trim();
    const restSegment = cleaned.slice(firstCommaIdx + 1).trim();
    // If the rest starts with a street number or contains a state/zip/street pattern
    if (/^\d+\s+[A-Za-z0-9]/.test(restSegment) || /\b\d{5}\b/.test(restSegment)) {
      return {
        namePart: firstSegment || cleaned,
        addressPart: restSegment,
      };
    }
  }
  return { namePart: cleaned, addressPart: null };
};

const normalizeBrandComparisonKey = (val: string | null | undefined): string =>
  String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const formatCleanDisplayUrl = (rawUrl: string | null | undefined): string | null => {
  const safe = getSafeExternalHttpUrl(rawUrl);
  if (!safe) return null;
  try {
    const parsed = new URL(safe);
    const host = parsed.hostname.replace(/^www\./i, '');
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPath || cleanPath === '') return host;
    const candidate = `${host}${cleanPath}`;
    return candidate.length <= 44 ? candidate : host;
  } catch {
    return null;
  }
};

const extractVerifiedPrizeOrHighlight = (
  merged: CuratorCandidateRecord,
  mediaItem?: CuratorMediaItem | null,
): string | null => {
  const activities = [
    ...(merged.activities || []),
    ...(merged.eventDetails?.activities || []),
    ...(mediaItem?.descriptionAnalysis?.activities || []),
  ]
    .map((a) => String(a || '').trim())
    .filter(Boolean);

  const combinedText = `${merged.title || ''} ${merged.displayDescription || merged.description || ''}`;

  const prizeMatch = combinedText.match(
    /(\$[\d,]+\s+(?:costume\s+)?contest|\$[\d,]+\s+in\s+prizes|costume\s+contest(?:\s+with\s+prizes)?|cash\s+prizes?)/i,
  );
  if (prizeMatch) {
    return prizeMatch[1].replace(/\s+/g, ' ').trim();
  }

  const featureMatch = combinedText.match(
    /(interactive\s+sampler\s+stations|sampler\s+stations\s*&\s*scenes|live\s+shibari\s+rope\s+demonstrations?|live\s+aerialist\s+performance|midnight\s+champagne\s+toast|champagne\s+reception|two\s+floors\s+of\s+playrooms|three\s+floors\s+of\s+play\s+suites)/i,
  );
  if (featureMatch) {
    const raw = featureMatch[1].replace(/\s+/g, ' ').trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  if (/from samplers to scenes/i.test(String(merged.title || ''))) {
    return 'Interactive Sampler Stations & Curated Play Scenes';
  }

  const meaningfulActivity = activities.find(
    (act) => act.length >= 4 && act.length <= 54 && !/^(social|general|club night|event)$/i.test(act),
  );
  if (meaningfulActivity) {
    return meaningfulActivity;
  }

  return null;
};

export const selectFlyerLayoutPatternForStyleAndContent = (
  styleCategoryId: string,
  hasCalloutDetails: boolean,
  overridePatternId?: CuratorFlyerLayoutPatternId | null,
): CuratorFlyerLayoutPatternSpec => {
  if (overridePatternId && CURATOR_FLYER_LAYOUT_PATTERNS[overridePatternId]) {
    return CURATOR_FLYER_LAYOUT_PATTERNS[overridePatternId];
  }
  const directive =
    STYLE_CREATIVE_BRIEF_DIRECTIVES[styleCategoryId] ||
    STYLE_CREATIVE_BRIEF_DIRECTIVES.classic_nightclub;
  if (
    hasCalloutDetails &&
    (styleCategoryId === 'vintage_disco' || styleCategoryId === 'underground_rave')
  ) {
    return CURATOR_FLYER_LAYOUT_PATTERNS.nightlife_flyer_badge_callouts;
  }
  return (
    CURATOR_FLYER_LAYOUT_PATTERNS[directive.flyerLayoutPatternId] ||
    CURATOR_FLYER_LAYOUT_PATTERNS.top_logo_centered_title_bottom_info
  );
};

export const buildCuratorPromotionalContentSchema = (
  candidate: CuratorCandidateRecord,
  options?: {
    draft?: CuratorCandidateDraftEdits | null;
    mediaItem?: CuratorMediaItem | null;
    styleCategoryId?: string | null;
    flyerLayoutPatternId?: CuratorFlyerLayoutPatternId | null;
    logoPlacementOverride?: CuratorLogoPlacement | null;
    logoUrlOverride?: string | null;
  },
): CuratorPromotionalContentSchema => {
  const merged = mergeCandidateWithDraft(candidate, options?.draft);
  const mediaItem = options?.mediaItem || null;
  const rawStyleCat = getCuratorArtworkStyleCategory(options?.styleCategoryId);
  const effectiveStyleId =
    rawStyleCat.id === 'surprise_me'
      ? pickConcreteStyleForSurpriseMe(merged.id, 'flyer', 0).id
      : rawStyleCat.id;
  const directive =
    STYLE_CREATIVE_BRIEF_DIRECTIVES[effectiveStyleId] ||
    STYLE_CREATIVE_BRIEF_DIRECTIVES.classic_nightclub;

  // 1. Resolve and deduplicate Brand, Venue, and Host identities
  const splitClub = splitEmbeddedVenueAndAddress(merged.clubName);
  const splitVenue = splitEmbeddedVenueAndAddress(merged.venue);
  const rawHost = String(merged.hostName || mediaItem?.hostName || '').trim() || null;

  const primaryBrand =
    splitClub.namePart || splitVenue.namePart || rawHost || null;

  const primaryKey = normalizeBrandComparisonKey(primaryBrand);
  const venueCandidate = splitVenue.namePart;
  const venueKey = normalizeBrandComparisonKey(venueCandidate);
  const secondaryVenue =
    venueCandidate && venueKey && venueKey !== primaryKey ? venueCandidate : null;

  const hostKey = normalizeBrandComparisonKey(rawHost);
  const hostPresenter =
    rawHost &&
    hostKey &&
    hostKey !== primaryKey &&
    hostKey !== venueKey
      ? rawHost
      : null;

  const presentingParts: string[] = [];
  if (primaryBrand) presentingParts.push(primaryBrand);
  if (secondaryVenue) presentingParts.push(`at ${secondaryVenue}`);
  if (hostPresenter) presentingParts.push(`Hosted by ${hostPresenter}`);
  const presentingLine =
    presentingParts.length > 0 ? presentingParts.join(' · ') : 'SwingSphere Featured Event';

  const logoUrl =
    options?.logoUrlOverride !== undefined
      ? options.logoUrlOverride
      : mediaItem?.logoSource?.logoUrl || mediaItem?.clubIdentity?.logoUrl || null;
  const hasLogoAsset = Boolean(logoUrl && String(logoUrl).trim());

  // 2. Resolve Event Title, Date, and Time without invention
  const rawTitle = String(merged.title || '').replace(/\s+/g, ' ').trim();
  const eventTitle = rawTitle || 'Untitled Event';

  const rawDate = String(merged.date || '').trim() || null;
  const hasValidDate = Boolean(rawDate);
  const dateDisplay = formatDateIsoReadable(rawDate, merged.endDate);

  const startFormatted = formatTimeTokenClean(merged.startTime);
  const endFormatted = formatTimeTokenClean(merged.endTime);
  const timeDisplay =
    startFormatted && endFormatted
      ? `${startFormatted} – ${endFormatted}`
      : startFormatted || endFormatted || null;

  const dateAndTimeDisplay =
    dateDisplay && timeDisplay
      ? `${dateDisplay} · ${timeDisplay}`
      : dateDisplay || timeDisplay || null;

  // 3. Resolve deduplicated Flyer Location and lighter Hero Location
  const rawAddress =
    String(merged.address || '').trim() ||
    splitVenue.addressPart ||
    splitClub.addressPart ||
    null;
  const rawCity = String(merged.city || mediaItem?.city || '').trim() || null;
  const rawRegion = String(merged.region || '').trim() || null;
  const rawCountry = String(merged.country || '').trim() || null;

  const cityRegionParts: string[] = [];
  if (rawCity) cityRegionParts.push(rawCity);
  if (
    rawRegion &&
    (!rawCity ||
      !new RegExp(`\\b${rawRegion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(rawCity))
  ) {
    cityRegionParts.push(rawRegion);
  }
  if (
    rawCountry &&
    !/^(usa|us|united states)$/i.test(rawCountry) &&
    !cityRegionParts.some((p) => p.toLowerCase() === rawCountry.toLowerCase())
  ) {
    cityRegionParts.push(rawCountry);
  }
  const cityDisplay = cityRegionParts.length > 0 ? cityRegionParts.join(', ') : null;

  const flyerLocationTokens: string[] = [];
  const venueLabelForLocation = secondaryVenue || primaryBrand;
  if (venueLabelForLocation) {
    flyerLocationTokens.push(venueLabelForLocation);
  }
  if (rawAddress) {
    // Strip trailing zip if overly long, keep street + city/state
    const cleanAddr = rawAddress.replace(/(?:,|\s+)\d{5}(?:-\d{4})?$/, '').trim();
    if (
      cleanAddr &&
      !flyerLocationTokens.some((t) => t.toLowerCase().includes(cleanAddr.toLowerCase()))
    ) {
      flyerLocationTokens.push(cleanAddr);
    }
  }
  if (
    cityDisplay &&
    !flyerLocationTokens.some((t) => t.toLowerCase().includes((rawCity || cityDisplay).toLowerCase()))
  ) {
    flyerLocationTokens.push(cityDisplay);
  }
  const flyerLocationDisplay =
    flyerLocationTokens.length > 0 ? flyerLocationTokens.join(' · ') : null;

  const heroLocationDisplay =
    cityDisplay && primaryBrand
      ? `${primaryBrand} · ${cityDisplay}`
      : cityDisplay || venueLabelForLocation || null;

  // 4. Supporting event details (Theme, Host, Dress Code/Costume, Prize/Highlight, Admission, URL)
  const rawTheme = String(
    merged.theme ||
      merged.eventDetails?.theme ||
      mediaItem?.descriptionAnalysis?.theme ||
      mediaItem?.officialImageAnalysis?.inferredTheme ||
      '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  const theme =
    rawTheme && !/^(none|n\/a|general|default|standard|unknown)$/i.test(rawTheme)
      ? rawTheme
      : null;

  const rawDress = String(
    merged.dressCode ||
      merged.eventDetails?.dressCode ||
      mediaItem?.descriptionAnalysis?.dressCode ||
      '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  let dressCodeOrCostume: string | null =
    rawDress && !/^(none|n\/a|tbd|unknown)$/i.test(rawDress) ? rawDress : null;
  if (!dressCodeOrCostume) {
    const descText = `${merged.title || ''} ${merged.displayDescription || merged.description || ''}`;
    const dressMatch = descText.match(
      /(black[\s-]tie\s+optional|upscale\s+evening\s+attire|fetish\s*&\s*fantasy\s+attire|costumes?\s+(?:encouraged|required)|masquerade\s+masks?\s+(?:required|encouraged)|satin\s*&\s*lace\s+dress\s+code)/i,
    );
    if (dressMatch) {
      const m = dressMatch[1].replace(/\s+/g, ' ').trim();
      dressCodeOrCostume = m.charAt(0).toUpperCase() + m.slice(1);
    }
  }

  const prizeOrHighlight = extractVerifiedPrizeOrHighlight(merged, mediaItem);

  const rawAdmission =
    typeof merged.admission === 'string'
      ? merged.admission.trim()
      : typeof merged.eventDetails?.admission === 'string'
        ? merged.eventDetails.admission.trim()
        : merged.eventDetails?.admission?.raw
          ? String(merged.eventDetails.admission.raw).trim()
          : '';
  const rawRsvpOrMembership = String(
    merged.rsvpRequirement || merged.membershipRequirement || '',
  ).trim();
  const candidateAdmission = rawAdmission || rawRsvpOrMembership;
  const admissionSummary =
    candidateAdmission && candidateAdmission.length > 0 && candidateAdmission.length <= 64
      ? candidateAdmission
      : null;

  const displayUrl = formatCleanDisplayUrl(
    merged.ticketUrl || merged.rsvpUrl || merged.sourceUrl,
  );

  // 5. Select Layout Patterns & Logo Placement Strategy
  const hasCalloutDetails = Boolean(prizeOrHighlight || dressCodeOrCostume);
  const flyerLayoutPattern = selectFlyerLayoutPatternForStyleAndContent(
    effectiveStyleId,
    hasCalloutDetails,
    options?.flyerLayoutPatternId,
  );
  const heroLayoutPattern =
    CURATOR_HERO_LAYOUT_PATTERNS[directive.heroLayoutPatternId] ||
    CURATOR_HERO_LAYOUT_PATTERNS.top_left_brand_lower_left_title_date_city;

  const logoPlacement: CuratorLogoPlacement =
    options?.logoPlacementOverride ||
    (options?.flyerLayoutPatternId
      ? flyerLayoutPattern.defaultLogoPlacement
      : directive.preferredLogoPlacement || flyerLayoutPattern.defaultLogoPlacement) ||
    'top-center';

  const heroLogoPlacement: CuratorLogoPlacement =
    options?.logoPlacementOverride || heroLayoutPattern.defaultLogoPlacement || 'top-left';

  const logoFallbackText = primaryBrand
    ? `Typographic Brand Crest: "${primaryBrand.toUpperCase()}"${
        hostPresenter ? ` (with secondary credit "Hosted by ${hostPresenter}")` : ''
      }`
    : 'Typographic Brand Crest: "SWINGSPHERE CURATED EVENT"';

  const multiBrandStrategySummary = [
    primaryBrand
      ? `1. Primary Organizer / Club Brand: "${primaryBrand}" (${
          hasLogoAsset ? `official logo mark placed at ${logoPlacement}` : `typographic wordmark crest at ${logoPlacement}`
        })`
      : '1. Primary Brand: Typographic organizer header',
    secondaryVenue
      ? `2. Distinct Venue Identity: "${secondaryVenue}" integrated into the location line (no competing second logo mark)`
      : null,
    hostPresenter
      ? `3. Host / Presenter Credit: "Hosted by ${hostPresenter}" rendered as a clean secondary presenter line without logo clutter`
      : null,
  ]
    .filter(Boolean)
    .join(' | ');

  // 6. Optional short Hero subheading (lightweight, never flyer-level density)
  const heroSubheadingParts: string[] = [];
  if (hostPresenter) heroSubheadingParts.push(`Hosted by ${hostPresenter}`);
  if (theme && theme.length <= 42) heroSubheadingParts.push(theme);
  else if (prizeOrHighlight && prizeOrHighlight.length <= 42) heroSubheadingParts.push(prizeOrHighlight);
  const heroSubheading =
    heroSubheadingParts.length > 0 ? heroSubheadingParts.slice(0, 2).join(' · ') : null;

  // 7. Assemble Included Promotional Fields & Omitted Fields
  const flyerIncludedFields: CuratorPromotionalFieldItem[] = [];
  const heroIncludedFields: CuratorPromotionalFieldItem[] = [];
  const omittedFields: CuratorPromotionalOmittedItem[] = [];

  if (primaryBrand) {
    flyerIncludedFields.push({
      key: 'brand',
      label: hasLogoAsset ? `Brand Logo (${logoPlacement})` : `Brand Lockup (${logoPlacement})`,
      value: hasLogoAsset ? `${primaryBrand} (Logo + Wordmark)` : primaryBrand,
      tier: 'brand',
    });
    heroIncludedFields.push({
      key: 'brand',
      label: hasLogoAsset ? `Brand Logo (${heroLogoPlacement})` : `Brand Identity (${heroLogoPlacement})`,
      value: primaryBrand,
      tier: 'brand',
    });
  } else {
    omittedFields.push({
      field: 'brand',
      label: 'Brand / Organizer',
      reason: 'missing_from_source',
    });
  }

  if (rawTitle) {
    flyerIncludedFields.push({
      key: 'title',
      label: 'Event Title',
      value: eventTitle,
      tier: 'primary',
    });
    heroIncludedFields.push({
      key: 'title',
      label: 'Event Title',
      value: eventTitle,
      tier: 'primary',
    });
  } else {
    omittedFields.push({
      field: 'title',
      label: 'Event Title',
      reason: 'missing_from_source',
    });
  }

  if (dateDisplay) {
    flyerIncludedFields.push({
      key: 'date',
      label: 'Date',
      value: dateDisplay,
      tier: 'primary',
    });
    heroIncludedFields.push({
      key: 'date',
      label: 'Date',
      value: dateDisplay,
      tier: 'primary',
    });
  } else {
    omittedFields.push({
      field: 'date',
      label: 'Event Date',
      reason: 'missing_from_source',
    });
  }

  if (timeDisplay) {
    flyerIncludedFields.push({
      key: 'time',
      label: 'Time',
      value: timeDisplay,
      tier: 'primary',
    });
    omittedFields.push({
      field: 'time_on_hero',
      label: 'Start/End Time (Hero)',
      reason: 'omitted_for_hero_simplicity',
    });
  } else {
    omittedFields.push({
      field: 'time',
      label: 'Start / End Time',
      reason: 'missing_from_source',
    });
  }

  if (flyerLocationDisplay) {
    flyerIncludedFields.push({
      key: 'location',
      label: 'Venue / Location',
      value: flyerLocationDisplay,
      tier: 'primary',
    });
  } else {
    omittedFields.push({
      field: 'location',
      label: 'Venue / Location',
      reason: 'missing_from_source',
    });
  }

  if (heroLocationDisplay) {
    heroIncludedFields.push({
      key: 'location',
      label: 'City / Location',
      value: heroLocationDisplay,
      tier: 'primary',
    });
  }

  if (theme) {
    flyerIncludedFields.push({
      key: 'theme',
      label: 'Theme / Concept',
      value: theme,
      tier: 'primary',
    });
  } else {
    omittedFields.push({
      field: 'theme',
      label: 'Theme',
      reason: 'missing_from_source',
    });
  }

  if (hostPresenter) {
    flyerIncludedFields.push({
      key: 'host',
      label: 'Host / Presenter',
      value: hostPresenter,
      tier: 'secondary',
    });
  }

  if (dressCodeOrCostume) {
    flyerIncludedFields.push({
      key: 'dressCode',
      label: 'Dress Code / Costume',
      value: dressCodeOrCostume,
      tier: 'secondary',
    });
  } else {
    omittedFields.push({
      field: 'dressCode',
      label: 'Dress Code / Costume',
      reason: 'missing_from_source',
    });
  }

  if (prizeOrHighlight) {
    flyerIncludedFields.push({
      key: 'highlight',
      label: 'Prize / Special Feature',
      value: prizeOrHighlight,
      tier: 'secondary',
    });
  }

  if (admissionSummary) {
    flyerIncludedFields.push({
      key: 'admission',
      label: 'Admission / RSVP',
      value: admissionSummary,
      tier: 'secondary',
    });
  } else if (candidateAdmission && candidateAdmission.length > 64) {
    omittedFields.push({
      field: 'admission',
      label: 'Verbose Admission Copy',
      reason: 'excluded_verbose_or_internal',
    });
  }

  if (displayUrl) {
    flyerIncludedFields.push({
      key: 'url',
      label: 'Event / Ticket URL',
      value: displayUrl,
      tier: 'secondary',
    });
  } else {
    omittedFields.push({
      field: 'url',
      label: 'URL',
      reason: 'missing_from_source',
    });
  }

  if (heroSubheading) {
    heroIncludedFields.push({
      key: 'subheading',
      label: 'Hero Subheading',
      value: heroSubheading,
      tier: 'secondary',
    });
  }

  // Always record verbose/editorial exclusions
  omittedFields.push(
    {
      field: 'description',
      label: 'Long Event Description',
      reason: 'excluded_verbose_or_internal',
    },
    {
      field: 'internalIds',
      label: 'Internal Candidate & Club IDs',
      reason: 'excluded_verbose_or_internal',
    },
  );

  const missingRequiredFields: string[] = [];
  if (!rawTitle) missingRequiredFields.push('title');
  if (!hasValidDate) missingRequiredFields.push('date');
  if (!flyerLocationDisplay) missingRequiredFields.push('location');
  if (!primaryBrand) missingRequiredFields.push('brand');

  const isArtOnlyMissingMetadata = !rawTitle || (!hasValidDate && !flyerLocationDisplay);
  const promotionalStatus: CuratorPromotionalContentSchema['promotionalStatus'] =
    isArtOnlyMissingMetadata
      ? 'art_only_missing_metadata'
      : missingRequiredFields.length === 0
        ? 'complete_promotional_info'
        : 'partial_promotional_info';

  return {
    primaryBrand,
    secondaryVenue,
    hostPresenter,
    presentingLine,
    logoUrl,
    hasLogoAsset,
    logoSourceStatus: hasLogoAsset ? 'logo_asset_available' : 'typographic_fallback',
    logoPlacement,
    heroLogoPlacement,
    logoFallbackText,
    multiBrandStrategySummary,
    eventTitle,
    dateIso: rawDate,
    dateDisplay,
    timeDisplay,
    dateAndTimeDisplay,
    flyerLocationDisplay,
    heroLocationDisplay,
    cityDisplay,
    theme,
    hostDisplay: hostPresenter,
    dressCodeOrCostume,
    prizeOrHighlight,
    admissionSummary,
    displayUrl,
    heroSubheading,
    flyerLayoutPattern,
    heroLayoutPattern,
    flyerIncludedFields,
    heroIncludedFields,
    omittedFields,
    missingRequiredFields,
    isArtOnlyMissingMetadata,
    promotionalStatus,
  };
};

export const generateCuratorArtworkPrompt = (
  candidateOrInput:
    | CuratorCandidateRecord
    | {
        candidate: CuratorCandidateRecord;
        role: CuratorArtworkRole;
        styleCategoryId?: string | null;
        draft?: CuratorCandidateDraftEdits | null;
        mediaItem?: CuratorMediaItem | null;
        variationSeed?: number;
        includeEmbeddedTextOnFlyer?: boolean;
        includeHeroBranding?: boolean;
        flyerLayoutPatternId?: CuratorFlyerLayoutPatternId | null;
        logoPlacementOverride?: CuratorLogoPlacement | null;
      },
  maybeOptions?: {
    role: CuratorArtworkRole;
    styleCategoryId?: string | null;
    draft?: CuratorCandidateDraftEdits | null;
    mediaItem?: CuratorMediaItem | null;
    variationSeed?: number;
    includeEmbeddedTextOnFlyer?: boolean;
    includeHeroBranding?: boolean;
    flyerLayoutPatternId?: CuratorFlyerLayoutPatternId | null;
    logoPlacementOverride?: CuratorLogoPlacement | null;
  },
): CuratorGeneratedArtworkPrompt => {
  const isSingleObjectCall =
    candidateOrInput &&
    typeof candidateOrInput === 'object' &&
    'candidate' in candidateOrInput &&
    'role' in candidateOrInput;
  const candidate: CuratorCandidateRecord = isSingleObjectCall
    ? (candidateOrInput as any).candidate
    : (candidateOrInput as CuratorCandidateRecord);
  const options = isSingleObjectCall
    ? (candidateOrInput as {
        role: CuratorArtworkRole;
        styleCategoryId?: string | null;
        draft?: CuratorCandidateDraftEdits | null;
        mediaItem?: CuratorMediaItem | null;
        variationSeed?: number;
        includeEmbeddedTextOnFlyer?: boolean;
        includeHeroBranding?: boolean;
        flyerLayoutPatternId?: CuratorFlyerLayoutPatternId | null;
        logoPlacementOverride?: CuratorLogoPlacement | null;
      })
    : maybeOptions!;

  const merged = mergeCandidateWithDraft(candidate, options.draft);
  const role = options.role;
  const rawStyleCat = getCuratorArtworkStyleCategory(options.styleCategoryId);
  const effectiveStyleCat =
    rawStyleCat.id === 'surprise_me'
      ? pickConcreteStyleForSurpriseMe(merged.id, role, options.variationSeed || 0)
      : rawStyleCat;

  const directive =
    STYLE_CREATIVE_BRIEF_DIRECTIVES[effectiveStyleCat.id] ||
    STYLE_CREATIVE_BRIEF_DIRECTIVES.classic_nightclub;

  const promo = buildCuratorPromotionalContentSchema(merged, {
    draft: null, // already merged
    mediaItem: options.mediaItem,
    styleCategoryId: effectiveStyleCat.id,
    flyerLayoutPatternId: options.flyerLayoutPatternId,
    logoPlacementOverride: options.logoPlacementOverride,
  });

  const cues = extractEventVisualCues(merged, options.mediaItem);
  const title = promo.eventTitle;
  const locationSummary =
    promo.flyerLocationDisplay || promo.heroLocationDisplay || promo.primaryBrand || 'Private Venue';
  const descriptionExcerpt = String(merged.displayDescription || merged.description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

  const isFlyer = role === 'flyer';
  const targetAspectRatio: '4:5' | '16:9' = isFlyer ? '4:5' : '16:9';
  const targetResolution: '1080 × 1350' | '1920 × 1080' = isFlyer ? '1080 × 1350' : '1920 × 1080';
  const targetWidth: 1080 | 1920 = isFlyer ? 1080 : 1920;
  const targetHeight: 1350 | 1080 = isFlyer ? 1350 : 1080;

  const activeLayoutPattern = isFlyer ? promo.flyerLayoutPattern : promo.heroLayoutPattern;
  const activeLogoPlacement = isFlyer ? promo.logoPlacement : promo.heroLogoPlacement;

  const mainVisualConcept = isFlyer
    ? `Create an authentic vertical 4:5 promotional event flyer and collector-grade nightlife poster for "${title}" presented by ${promo.presentingLine} (${locationSummary}). Interpret the occasion (${cues.themeSummary}) through ${effectiveStyleCat.label} (${effectiveStyleCat.tagline}), combining atmospheric visual storytelling with structured, legible promotional branding and event metadata.`
    : `Create a horizontal 16:9 widescreen promotional hero banner for "${title}" presented by ${promo.presentingLine} (${promo.heroLocationDisplay || locationSummary}). Establish an expansive cinematic environment inspired by ${effectiveStyleCat.label} (${effectiveStyleCat.tagline}) that pairs immersive spatial depth with lighter, high-impact hero branding (logo/organizer identity, event title, and date/city) while preserving clean website UI overlay safe zones.`;

  const settingAndEnvironment = `${cues.settingCue} ${cues.venueIdentityCue}.${
    descriptionExcerpt ? ` Event narrative context (for visual mood only — do not print this paragraph on the artwork): "${descriptionExcerpt}".` : ''
  }`;

  const artisticTradition = `${directive.artisticTradition} Medium & surface finish: ${directive.mediumAndSurface}`;

  const composition = isFlyer
    ? `${directive.flyerComposition} Promotional Flyer Layout Pattern: "${promo.flyerLayoutPattern.label}" (${promo.flyerLayoutPattern.id}). ${promo.flyerLayoutPattern.compositionGuidance} Safe zones: ${promo.flyerLayoutPattern.safeZoneGuidance}`
    : `${directive.heroComposition} Promotional Hero Layout Pattern: "${promo.heroLayoutPattern.label}" (${promo.heroLayoutPattern.id}). ${promo.heroLayoutPattern.compositionGuidance} Safe zones: ${promo.heroLayoutPattern.safeZoneGuidance} This 16:9 hero is compositionally independent from the vertical 4:5 flyer—never crop a vertical poster into a horizontal frame.`;

  const subjectMatter = `${directive.subjectApproach} ${cues.subjectCue} ${cues.audienceAndDressCue}.`;

  const lighting = `${directive.lightingApproach} (${effectiveStyleCat.lightingDirection}).`;

  const colorPalette = `Primary palette anchored in ${effectiveStyleCat.paletteHex.join(', ')}${
    options.mediaItem?.clubIdentity?.brandColors?.length
      ? ` harmonized with venue signature accents (${options.mediaItem.clubIdentity.brandColors.join(', ')})`
      : ''
  }. Ensure strong tonal contrast behind all text and logo zones.`;

  const moodAndAtmosphere = `${directive.moodTone} Sensuality should feel magnetic, adult, fashion-forward, and mysterious while remaining 100% safe-for-work (SFW) for public discovery surfaces.`;

  const brandAndLogoStrategy = [
    `Logo Placement Position: ${activeLogoPlacement.toUpperCase()}.`,
    promo.hasLogoAsset
      ? `Official Brand Logo Available: Integrate the ${promo.primaryBrand || 'organizer'} logo mark cleanly at ${activeLogoPlacement} (${promo.logoUrl}) with balanced clear-space padding so it reads clearly without overpowering the artwork.`
      : `No Raster Logo Asset Configured — Graceful Typographic Branding Fallback: Render ${promo.logoFallbackText} at ${activeLogoPlacement} using refined ${effectiveStyleCat.label} display lettering.`,
    `Multi-Brand Priority Rule: ${promo.multiBrandStrategySummary}. Never clutter the composition with multiple competing logos.`,
  ].join(' ');

  const flyerHierarchyLines = [
    `Information Hierarchy (1 → 6) using layout pattern "${promo.flyerLayoutPattern.label}":`,
    `  1. Logo / Organizer Identity (${activeLogoPlacement}): ${promo.primaryBrand || 'SwingSphere Curated'}${promo.hasLogoAsset ? ' [Logo + Brand Lockup]' : ' [Typographic Crest]'}`,
    `  2. Event Title (Primary Focal Headline): "${promo.eventTitle}"`,
    promo.dateAndTimeDisplay
      ? `  3. Date + Time: "${promo.dateAndTimeDisplay}"${!promo.timeDisplay ? ' (time omitted — not stated in source)' : ''}`
      : `  3. Date + Time: [OMIT — date/time not verified in source; do NOT invent a date or time]`,
    promo.flyerLocationDisplay
      ? `  4. Location / Venue: "${promo.flyerLocationDisplay}"`
      : `  4. Location / Venue: [OMIT — location not verified in source]`,
    [
      promo.theme ? `Theme: "${promo.theme}"` : null,
      promo.hostDisplay ? `Host/Presenter: "Hosted by ${promo.hostDisplay}"` : null,
      promo.dressCodeOrCostume ? `Dress/Costume: "${promo.dressCodeOrCostume}"` : null,
      promo.prizeOrHighlight ? `Feature/Highlight: "${promo.prizeOrHighlight}"` : null,
      promo.admissionSummary ? `Admission: "${promo.admissionSummary}"` : null,
    ].filter(Boolean).length > 0
      ? `  5. Supporting Callout / Detail Block: ${[
          promo.theme ? `Theme: "${promo.theme}"` : null,
          promo.hostDisplay ? `Hosted by ${promo.hostDisplay}` : null,
          promo.dressCodeOrCostume ? `Attire: ${promo.dressCodeOrCostume}` : null,
          promo.prizeOrHighlight ? `Highlight: ${promo.prizeOrHighlight}` : null,
          promo.admissionSummary ? `Entry: ${promo.admissionSummary}` : null,
        ]
          .filter(Boolean)
          .join(' | ')}`
      : `  5. Supporting Callout / Detail Block: [OMIT — no secondary theme/host/dress/prize metadata present]`,
    promo.displayUrl
      ? `  6. Footer URL / Ticket Reference: "${promo.displayUrl}"`
      : `  6. Footer URL: [OMIT — no public URL configured]`,
  ];

  const includeHeroBranding = options.includeHeroBranding ?? true;
  const heroHierarchyLines = includeHeroBranding
    ? [
        `Lighter Hero Information Hierarchy (1 → 4) using layout pattern "${promo.heroLayoutPattern.label}":`,
        `  1. Logo or Organizer Identity (${activeLogoPlacement}): ${promo.primaryBrand || 'SwingSphere Curated'}${promo.hasLogoAsset ? ' [Logo Mark]' : ' [Typographic Identity]'}`,
        `  2. Event Title (Widescreen Headline): "${promo.eventTitle}"`,
        promo.dateDisplay || promo.heroLocationDisplay
          ? `  3. Date / Location Line: "${[promo.dateDisplay, promo.heroLocationDisplay].filter(Boolean).join(' · ')}"`
          : `  3. Date / Location Line: [OMIT — date and location missing from source]`,
        promo.heroSubheading
          ? `  4. Optional Short Subheading: "${promo.heroSubheading}"`
          : `  4. Optional Subheading: [OMIT — keep hero clean and uncluttered]`,
        `  Hero Density Rule: Keep the 16:9 hero significantly lighter than the vertical flyer. Omit start/end hours, street addresses, dress code lists, admission tiers, and footer URLs so the widescreen composition breathes and works seamlessly with website UI overlays.`,
      ]
    : [
        `Unlettered 16:9 Hero Override: Reserve clean lower-left and top-left safe zones for "${promo.eventTitle}" and ${promo.primaryBrand || 'club'} branding without baking text into the raster pixels.`,
      ];

  const requiredTextAndHierarchy = (isFlyer ? flyerHierarchyLines : heroHierarchyLines).join('\n');

  const supportingDetailsAndOmissions = [
    `Included Promotional Fields (${isFlyer ? promo.flyerIncludedFields.length : promo.heroIncludedFields.length}): ${(
      isFlyer ? promo.flyerIncludedFields : promo.heroIncludedFields
    )
      .map((f) => `${f.label}: "${f.value}"`)
      .join('; ')}.`,
    `Explicitly Omitted / Excluded Fields: ${promo.omittedFields
      .map(
        (o) =>
          `${o.label} (${
            o.reason === 'missing_from_source'
              ? 'missing from source — do NOT invent'
              : o.reason === 'omitted_for_hero_simplicity'
                ? 'omitted on 16:9 hero for lighter density'
                : 'excluded to prevent clutter'
          })`,
      )
      .join(', ')}.`,
  ].join(' ');

  const includeTextOnFlyer = options.includeEmbeddedTextOnFlyer ?? true;
  const typographyTreatment = isFlyer
    ? includeTextOnFlyer
      ? `${directive.typographyDirection} (${effectiveStyleCat.typographyStyle}). Style-Aware Information Design: ${directive.styleAwareInfoDesign} Arrange all included text in intentional poster blocks, callout badges, or architectural friezes with generous kerning and clear contrast. Never scatter text randomly across busy mid-tones, and never invent missing dates, times, DJs, or prices.`
      : `Stage A Unlettered Base Mode: Reserve high-contrast negative-space zones matching the "${promo.flyerLayoutPattern.label}" layout (${promo.flyerLayoutPattern.safeZoneGuidance}) so Stage B can composite the exact verified typography in ${directive.typographyDirection}.`
    : `${directive.typographyDirection} (${effectiveStyleCat.typographyStyle}). Widescreen Hero Typography & Safe Zones: Render only the lighter 4-part hero lockup (Brand/Logo at ${activeLogoPlacement}, Title "${promo.eventTitle}"${
        promo.dateDisplay || promo.heroLocationDisplay
          ? `, and "${[promo.dateDisplay, promo.heroLocationDisplay].filter(Boolean).join(' · ')}"`
          : ''
      }) within the designated safe zone (${promo.heroLayoutPattern.safeZoneGuidance}), leaving expansive cinematic breathing room across the 16:9 frame.`;

  const elementsToAvoid = [
    'Strict SFW requirement: no nudity, no explicit sexual acts, no fetish hardware close-ups, and no anatomical exposure.',
    'No generic procedural geometry placeholders (do not render plain burgundy backgrounds with basic floating triangles and circles).',
    'No gibberish AI lettering, misspelled words, invented dates, fabricated times, fake ticket prices, or unverified guest lineups.',
    'Do NOT print long event descriptions, internal database IDs, editorial notes, or redundant street/city repetitions on the artwork.',
    'Do NOT clutter the composition with multiple competing logos or random floating text boxes.',
    isFlyer
      ? 'Avoid placing text over high-contrast facial features or busy architectural focal points without a deliberate tonal backing or cartouche.'
      : 'Do NOT overload the 16:9 hero image with flyer-level detail (no full time ranges, street addresses, dress code lists, or URL footers on the hero).',
  ].join(' ');

  const outputRequirements = isFlyer
    ? `Role: Promotional Event Flyer (Vertical Poster) | Aspect Ratio: 4:5 | Target Resolution: 1080 × 1350 px | Layout Pattern: ${promo.flyerLayoutPattern.label} | Logo Placement: ${activeLogoPlacement} | Style: ${effectiveStyleCat.label} (${effectiveStyleCat.styleFamily})`
    : `Role: Promotional Website Hero (Horizontal Widescreen Banner) | Aspect Ratio: 16:9 | Target Resolution: 1920 × 1080 px | Layout Pattern: ${promo.heroLayoutPattern.label} | Logo Placement: ${activeLogoPlacement} | Style: ${effectiveStyleCat.label} (${effectiveStyleCat.styleFamily})`;

  const promptText = [
    `# SwingSphere Promotional Creative Brief — ${isFlyer ? 'Event Flyer (4:5 Vertical Promotional Poster)' : 'Website Hero (16:9 Widescreen Promotional Banner)'}`,
    `Event: "${title}"`,
    `Primary Brand / Organizer: ${promo.presentingLine}`,
    `Location: ${isFlyer ? promo.flyerLocationDisplay || 'Not specified (omit)' : promo.heroLocationDisplay || 'Not specified (omit)'}`,
    `Date & Time: ${promo.dateAndTimeDisplay || 'Date/Time not specified (omit — do not invent)'}`,
    `Selected Artistic Style: ${effectiveStyleCat.label}${rawStyleCat.id === 'surprise_me' ? ' (selected via Surprise Me)' : ''} — ${effectiveStyleCat.tagline}`,
    `Layout Pattern: ${activeLayoutPattern.label} | Logo Placement: ${activeLogoPlacement}`,
    `Target Output: ${targetAspectRatio} aspect ratio (${targetResolution} px)`,
    '',
    `## 1. Main Visual Concept`,
    mainVisualConcept,
    '',
    `## 2. Setting & Environment`,
    settingAndEnvironment,
    '',
    `## 3. Artistic Tradition & Medium`,
    artisticTradition,
    '',
    `## 4. Composition, Layout Pattern & Safe Zones (${targetAspectRatio})`,
    composition,
    '',
    `## 5. Brand Identity & Logo Placement Strategy`,
    brandAndLogoStrategy,
    '',
    `## 6. Required Promotional Text & Information Hierarchy`,
    requiredTextAndHierarchy,
    '',
    `## 7. Supporting Details Selection & Explicit Omissions`,
    supportingDetailsAndOmissions,
    '',
    `## 8. Subject Matter & Event Cues`,
    subjectMatter,
    '',
    `## 9. Lighting & Color Palette`,
    `${lighting} ${colorPalette}`,
    '',
    `## 10. Mood & Atmosphere`,
    moodAndAtmosphere,
    '',
    `## 11. ${isFlyer ? 'TYPOGRAPHY & POSTER HIERARCHY' : 'HERO BRANDING, TYPOGRAPHY TONE & SAFE ZONES'}`,
    typographyTreatment,
    '',
    `## 12. SFW & EDITORIAL GUARDRAILS (What to Omit & Avoid)`,
    elementsToAvoid,
    '',
    `## 13. Output Specification`,
    outputRequirements,
  ].join('\n');

  return {
    candidateId: merged.id,
    role,
    styleCategoryId: effectiveStyleCat.id,
    styleCategoryLabel: effectiveStyleCat.label,
    styleLabel: effectiveStyleCat.label,
    styleFamily: effectiveStyleCat.styleFamily,
    targetAspectRatio,
    aspectRatio: targetAspectRatio,
    targetResolution,
    targetWidth,
    targetHeight,
    layoutPatternId: activeLayoutPattern.id,
    layoutPatternLabel: activeLayoutPattern.label,
    logoPlacement: activeLogoPlacement,
    promotionalContent: promo,
    promptText,
    generatedAt: new Date().toISOString(),
    sections: {
      mainVisualConcept,
      settingAndEnvironment,
      artisticTradition,
      composition,
      subjectMatter,
      lighting,
      colorPalette,
      moodAndAtmosphere,
      brandAndLogoStrategy,
      requiredTextAndHierarchy,
      supportingDetailsAndOmissions,
      typographyTreatment,
      elementsToAvoid,
      outputRequirements,
    },
  };
};

export interface StoredCuratorArtworkPromptEntry {
  candidateId: string;
  role: CuratorArtworkRole;
  styleCategoryId: string;
  styleCategoryLabel: string;
  styleLabel?: string;
  targetResolution: string;
  promptText: string;
  updatedAt: string;
  isModified?: boolean;
}

const CURATOR_PROMPTS_STORAGE_KEY = 'swingsphere:curator-artwork-prompts:v1';
const inMemoryArtworkPrompts = new Map<string, StoredCuratorArtworkPromptEntry>();

const buildPromptStorageKey = (candidateId: string, role: CuratorArtworkRole): string =>
  `${candidateId}::${role}`;

const loadStoredCuratorArtworkPromptsMap = (): Record<string, StoredCuratorArtworkPromptEntry> => {
  const out: Record<string, StoredCuratorArtworkPromptEntry> = {};
  for (const [k, v] of inMemoryArtworkPrompts.entries()) {
    out[k] = { ...v };
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CURATOR_PROMPTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === 'object') {
              out[k] = v as StoredCuratorArtworkPromptEntry;
              inMemoryArtworkPrompts.set(k, out[k]);
            }
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }
  return out;
};

const persistStoredCuratorArtworkPromptsMap = (
  map: Record<string, StoredCuratorArtworkPromptEntry>,
): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CURATOR_PROMPTS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage quota errors
    }
  }
};

export const getStoredCuratorArtworkPrompt = (
  candidateId: string,
  role: CuratorArtworkRole,
): StoredCuratorArtworkPromptEntry | null => {
  if (!candidateId) return null;
  const map = loadStoredCuratorArtworkPromptsMap();
  return map[buildPromptStorageKey(candidateId, role)] || null;
};

export const saveStoredCuratorArtworkPrompt = (
  entryOrCandidateId:
    | (Omit<StoredCuratorArtworkPromptEntry, 'updatedAt'> & { updatedAt?: string })
    | string,
  maybeRole?: CuratorArtworkRole,
  maybePartial?: {
    promptText: string;
    styleCategoryId: string;
    styleCategoryLabel?: string;
    styleLabel?: string;
    targetResolution?: string;
    updatedAt?: string;
    isModified?: boolean;
  },
): StoredCuratorArtworkPromptEntry => {
  const map = loadStoredCuratorArtworkPromptsMap();
  const normalizedEntry: Omit<StoredCuratorArtworkPromptEntry, 'updatedAt'> & { updatedAt?: string } =
    typeof entryOrCandidateId === 'string'
      ? {
          candidateId: entryOrCandidateId,
          role: maybeRole || 'flyer',
          styleCategoryId: maybePartial?.styleCategoryId || 'classic_nightclub',
          styleCategoryLabel:
            maybePartial?.styleCategoryLabel ||
            maybePartial?.styleLabel ||
            getCuratorArtworkStyleCategory(maybePartial?.styleCategoryId).label,
          styleLabel:
            maybePartial?.styleLabel ||
            maybePartial?.styleCategoryLabel ||
            getCuratorArtworkStyleCategory(maybePartial?.styleCategoryId).label,
          targetResolution:
            maybePartial?.targetResolution || (maybeRole === 'hero' ? '1920 × 1080' : '1080 × 1350'),
          promptText: maybePartial?.promptText || '',
          updatedAt: maybePartial?.updatedAt,
          isModified: maybePartial?.isModified,
        }
      : entryOrCandidateId;

  const key = buildPromptStorageKey(normalizedEntry.candidateId, normalizedEntry.role);
  const saved: StoredCuratorArtworkPromptEntry = {
    ...normalizedEntry,
    styleLabel: normalizedEntry.styleLabel || normalizedEntry.styleCategoryLabel,
    updatedAt: normalizedEntry.updatedAt || new Date().toISOString(),
  };
  map[key] = saved;
  inMemoryArtworkPrompts.set(key, saved);
  persistStoredCuratorArtworkPromptsMap(map);
  return saved;
};

export const clearStoredCuratorArtworkPrompt = (
  candidateId: string,
  role?: CuratorArtworkRole,
): void => {
  if (!candidateId) return;
  const map = loadStoredCuratorArtworkPromptsMap();
  if (role) {
    const key = buildPromptStorageKey(candidateId, role);
    delete map[key];
    inMemoryArtworkPrompts.delete(key);
  } else {
    for (const r of ['flyer', 'hero'] as const) {
      const key = buildPromptStorageKey(candidateId, r);
      delete map[key];
      inMemoryArtworkPrompts.delete(key);
    }
  }
  persistStoredCuratorArtworkPromptsMap(map);
};

export type CuratorArtworkProvenanceKind =
  | 'ai_model'
  | 'procedural_template_fallback'
  | 'art_only_missing_metadata'
  | 'uploaded_custom'
  | 'official_reference'
  | 'none';

export type CuratorArtworkProvenanceMode =
  | 'ai_model_stage_a'
  | 'procedural_template_fallback'
  | 'art_only_missing_metadata'
  | 'custom_upload'
  | 'official_reference'
  | 'none';

export interface CuratorArtworkRoleProvenance {
  kind: CuratorArtworkProvenanceKind;
  mode: CuratorArtworkProvenanceMode;
  badgeLabel: string;
  shortLabel: string;
  label: string;
  description: string;
  isProceduralFallback: boolean;
  hasPromotionalEventInfo: boolean;
  isArtOnlyMissingMetadata: boolean;
  promotionalStatus:
    | 'complete_promotional_info'
    | 'partial_promotional_info'
    | 'art_only_missing_metadata';
  promotionalStatusLabel: string;
}

const buildProvenanceResult = (
  kind: CuratorArtworkProvenanceKind,
  mode: CuratorArtworkProvenanceMode,
  badgeLabel: string,
  description: string,
  promoMeta?: {
    hasPromotionalEventInfo: boolean;
    isArtOnlyMissingMetadata: boolean;
    promotionalStatus:
      | 'complete_promotional_info'
      | 'partial_promotional_info'
      | 'art_only_missing_metadata';
    promotionalStatusLabel: string;
  },
): CuratorArtworkRoleProvenance => ({
  kind,
  mode,
  badgeLabel,
  shortLabel: badgeLabel,
  label: badgeLabel,
  description,
  isProceduralFallback: kind === 'procedural_template_fallback',
  hasPromotionalEventInfo: promoMeta?.hasPromotionalEventInfo ?? true,
  isArtOnlyMissingMetadata: promoMeta?.isArtOnlyMissingMetadata ?? false,
  promotionalStatus: promoMeta?.promotionalStatus ?? 'complete_promotional_info',
  promotionalStatusLabel:
    promoMeta?.promotionalStatusLabel ?? 'Includes Brand & Event Info',
});

export const resolveArtworkRoleProvenance = (
  candidate: CuratorCandidateRecord,
  mediaItem: CuratorMediaItem | null | undefined,
  role: CuratorArtworkRole,
  activeVersion?: CuratorMediaVersion | null,
): CuratorArtworkRoleProvenance => {
  const promo = buildCuratorPromotionalContentSchema(candidate, { mediaItem });
  const promoMeta = {
    hasPromotionalEventInfo: !promo.isArtOnlyMissingMetadata,
    isArtOnlyMissingMetadata: promo.isArtOnlyMissingMetadata,
    promotionalStatus: promo.promotionalStatus,
    promotionalStatusLabel: promo.isArtOnlyMissingMetadata
      ? 'Art-Only Composition (Missing Required Event Metadata)'
      : promo.promotionalStatus === 'complete_promotional_info'
        ? 'Promotional Artwork (Brand + Event Info Included)'
        : `Promotional Artwork (Missing: ${promo.missingRequiredFields.join(', ')})`,
  };

  const customUrl = role === 'flyer' ? candidate.customFlyerUrl : candidate.customHeaderUrl;
  const explicitMode =
    (role === 'flyer'
      ? activeVersion?.flyerGenerationMode ||
        mediaItem?.flyerGenerationMode ||
        candidate.stagedMedia?.flyerGenerationMode
      : activeVersion?.heroGenerationMode ||
        mediaItem?.heroGenerationMode ||
        candidate.stagedMedia?.heroGenerationMode) ||
    activeVersion?.generationMode ||
    mediaItem?.generationMode ||
    candidate.stagedMedia?.generationMode ||
    null;

  const feedbackSource = String((activeVersion?.feedback as any)?.source || '').toLowerCase();
  const isSelectedExtractedFlyer = Boolean(
    role === 'flyer' &&
      candidate.selectedExtractedMedia?.url &&
      (!customUrl || customUrl === candidate.selectedExtractedMedia.url),
  );
  const isOfficialExtractedFlyerPreview = Boolean(
    role === 'flyer' &&
      (isSelectedExtractedFlyer ||
        explicitMode === 'official_reference' ||
        candidate.stagedMedia?.source === 'official_or_existing' ||
        candidate.stagedMedia?.status === 'official_artwork_review' ||
        candidate.stagedMedia?.flyerPreviewUrl?.includes('role=official_flyer') ||
        candidate.stagedMedia?.flyerPreviewUrl?.includes('role=extracted_') ||
        (!candidate.stagedMedia?.hasGeneratedPair &&
          (candidate.mediaExtractionStatus === 'Official Flyer Found' ||
            candidate.mediaExtraction?.hasOfficialFlyer ||
            candidate.extractedMedia?.officialFlyer ||
            candidate.flyerUrl))),
  );

  if (
    explicitMode === 'uploaded_custom' ||
    feedbackSource === 'editorial_artwork_replacement' ||
    (customUrl && !customUrl.includes('/api/admin/curator/media-preview') && !isSelectedExtractedFlyer)
  ) {
    return buildProvenanceResult(
      'uploaded_custom',
      'custom_upload',
      'Custom Uploaded Artwork',
      'Replaced directly via curator file upload or drag-and-drop.',
      promoMeta,
    );
  }

  if (
    isOfficialExtractedFlyerPreview &&
    explicitMode !== 'ai_model' &&
    (explicitMode !== 'procedural_template_fallback' ||
      candidate.stagedMedia?.source === 'official_or_existing' ||
      candidate.stagedMedia?.status === 'official_artwork_review' ||
      isSelectedExtractedFlyer)
  ) {
    return buildProvenanceResult(
      'official_reference',
      'official_reference',
      isSelectedExtractedFlyer ? 'Selected Extracted Artwork' : 'Official Organizer Flyer',
      isSelectedExtractedFlyer
        ? `Selected from extracted event media (${candidate.selectedExtractedMedia?.classification || 'official_event_flyer'}).`
        : 'Extracted directly from the official event listing page.',
      promoMeta,
    );
  }

  if (explicitMode === 'art_only_missing_metadata' || promo.isArtOnlyMissingMetadata) {
    return buildProvenanceResult(
      'art_only_missing_metadata',
      'art_only_missing_metadata',
      'Art-Only Composition (Missing Required Metadata)',
      `Core promotional metadata (${promo.missingRequiredFields.join(', ') || 'date/location'}) is missing from the candidate record, so this composition cannot render a complete promotional event overlay.`,
      {
        ...promoMeta,
        hasPromotionalEventInfo: false,
        isArtOnlyMissingMetadata: true,
        promotionalStatus: 'art_only_missing_metadata',
        promotionalStatusLabel: 'Art-Only Composition (Missing Required Event Metadata)',
      },
    );
  }

  if (explicitMode === 'procedural_template_fallback') {
    return buildProvenanceResult(
      'procedural_template_fallback',
      'procedural_template_fallback',
      'Template Fallback (No AI Model)',
      'Rendered locally via programmatic SVG/Sharp poster layout with structured event info because no Stage A AI base image was available. Use "Generate Prompt" to create AI artwork externally and drag it onto this preview.',
      promoMeta,
    );
  }

  if (explicitMode === 'ai_model') {
    return buildProvenanceResult(
      'ai_model',
      'ai_model_stage_a',
      'AI Model + Stage B Promotional Overlay',
      'Stage A AI-generated base illustration composited with Stage B promotional branding and event metadata.',
      promoMeta,
    );
  }

  const provenanceStr = String(
    mediaItem?.provenance || (candidate.stagedMedia as any)?.provenance || '',
  ).toLowerCase();
  if (provenanceStr.includes('fallback') || provenanceStr.includes('procedural')) {
    return buildProvenanceResult(
      'procedural_template_fallback',
      'procedural_template_fallback',
      'Template Fallback (No AI Model)',
      'Rendered locally via programmatic SVG/Sharp poster layout with structured event info. Use "Generate Prompt" to create AI artwork externally and drag it onto this preview.',
      promoMeta,
    );
  }

  const hasPreview =
    role === 'flyer'
      ? Boolean(candidate.stagedMedia?.flyerPreviewUrl || mediaItem?.previewUrls?.flyer)
      : Boolean(candidate.stagedMedia?.heroPreviewUrl || mediaItem?.previewUrls?.hero);

  if (hasPreview) {
    return buildProvenanceResult(
      'ai_model',
      'ai_model_stage_a',
      'AI Model + Stage B Promotional Overlay',
      'Staged curator promotional artwork pair with event branding and metadata.',
      promoMeta,
    );
  }

  if (role === 'flyer' && (candidate.flyerUrl || mediaItem?.officialSourceArtworkUrl)) {
    return buildProvenanceResult(
      'official_reference',
      'official_reference',
      'Source Reference Image',
      'Discovered directly from the original event listing.',
      promoMeta,
    );
  }

  return buildProvenanceResult(
    'none',
    'none',
    'No Artwork Staged',
    'Generate a prompt or drag an image here to stage artwork.',
    promoMeta,
  );
};

export const CURATOR_ALLOWED_UPLOAD_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const;

export const CURATOR_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface CuratorArtworkUploadValidationResult {
  valid: boolean;
  error: string | null;
  normalizedMimeType: string | null;
}

export const validateCuratorArtworkUploadFile = (
  file: { name?: string; type?: string; size?: number } | null | undefined,
  maxBytes: number = CURATOR_MAX_UPLOAD_BYTES,
): CuratorArtworkUploadValidationResult => {
  if (!file) {
    return { valid: false, error: 'No image file was provided.', normalizedMimeType: null };
  }
  const rawType = String(file.type || '').trim().toLowerCase();
  const fileName = String(file.name || '').trim().toLowerCase();
  const extMatch = fileName.match(/\.(png|jpe?g|webp)$/i);

  const isAllowedMime = (CURATOR_ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(rawType);
  const inferredMime =
    rawType === 'image/jpg'
      ? 'image/jpeg'
      : isAllowedMime
        ? rawType
        : extMatch
          ? extMatch[1] === 'png'
            ? 'image/png'
            : extMatch[1] === 'webp'
              ? 'image/webp'
              : 'image/jpeg'
          : null;

  if (!inferredMime || (rawType && !isAllowedMime)) {
    return {
      valid: false,
      error: `Unsupported file format "${rawType || fileName || 'unknown'}". Please upload a PNG, JPG/JPEG, or WebP image.`,
      normalizedMimeType: null,
    };
  }

  const size = typeof file.size === 'number' ? file.size : 0;
  if (size <= 0) {
    return {
      valid: false,
      error: 'The selected image file is empty (0 bytes).',
      normalizedMimeType: null,
    };
  }

  if (size > maxBytes) {
    const sizeMb = (size / (1024 * 1024)).toFixed(1);
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the ${maxMb} MB limit.`,
      normalizedMimeType: null,
    };
  }

  return {
    valid: true,
    error: null,
    normalizedMimeType: inferredMime,
  };
};

export interface CuratorArtworkAspectAnalysis {
  role: CuratorArtworkRole;
  width: number;
  height: number;
  actualRatio: number;
  actualRatioLabel: string;
  targetRatio: number;
  targetRatioLabel: '4:5' | '16:9';
  targetDimensionsLabel: '1080 × 1350' | '1920 × 1080';
  relativeDifference: number;
  aspectMismatch: boolean;
  aspectMatches: boolean;
  warningMessage: string | null;
}

export const analyzeCuratorArtworkDimensions = (
  roleOrWidth: CuratorArtworkRole | number,
  widthOrHeight: number,
  heightOrRole: number | CuratorArtworkRole,
): CuratorArtworkAspectAnalysis => {
  const role: CuratorArtworkRole =
    typeof roleOrWidth === 'string'
      ? roleOrWidth
      : typeof heightOrRole === 'string'
        ? heightOrRole
        : 'flyer';
  const width: number = typeof roleOrWidth === 'number' ? roleOrWidth : widthOrHeight;
  const height: number = typeof roleOrWidth === 'number' ? widthOrHeight : (heightOrRole as number);

  const safeW = Math.max(1, Math.round(width || 0));
  const safeH = Math.max(1, Math.round(height || 0));
  const actualRatio = safeW / safeH;
  const isFlyer = role === 'flyer';
  const targetRatio = isFlyer ? 4 / 5 : 16 / 9;
  const targetRatioLabel: '4:5' | '16:9' = isFlyer ? '4:5' : '16:9';
  const targetDimensionsLabel: '1080 × 1350' | '1920 × 1080' = isFlyer
    ? '1080 × 1350'
    : '1920 × 1080';

  const relativeDifference = Math.abs(actualRatio - targetRatio) / targetRatio;
  // Warn if aspect ratio deviates by more than 6% from 4:5 (0.80) or 16:9 (1.777...)
  const aspectMismatch = relativeDifference > 0.06;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(safeW, safeH);
  const simpW = Math.round(safeW / divisor);
  const simpH = Math.round(safeH / divisor);
  const actualRatioLabel =
    simpW <= 32 && simpH <= 32 ? `${simpW}:${simpH}` : `${actualRatio.toFixed(2)}:1`;

  const warningMessage = aspectMismatch
    ? `Uploaded image is ${safeW} × ${safeH} px (${actualRatioLabel}), which differs from the target ${
        isFlyer ? 'Vertical Event Flyer' : 'Horizontal Hero Banner'
      } aspect ratio of ${targetRatioLabel} (${targetDimensionsLabel} px). Choose "Preserve Full Image (No Silent Crop)" to avoid cropping, or "Fill Target Frame (Intentional Center Crop)" to fill the frame.`
    : null;

  return {
    role,
    width: safeW,
    height: safeH,
    actualRatio,
    actualRatioLabel,
    targetRatio,
    targetRatioLabel,
    targetDimensionsLabel,
    relativeDifference,
    aspectMismatch,
    aspectMatches: !aspectMismatch,
    warningMessage,
  };
};

export const getSafeExternalHttpUrl = (rawUrl: string | null | undefined): string | null => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      // Allow localhost for local testing if needed, otherwise require valid hostname
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return null;
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
};



