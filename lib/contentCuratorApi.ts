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
  | 'community_candidate_approve'
  | 'community_candidate_reject'
  | 'community_candidate_defer'
  | 'artwork_approve'
  | 'artwork_reject'
  | 'artwork_regenerate'
  | 'artwork_select_version'
  | 'media_record_upload'
  | 'source_update_schedule'
  | 'source_request_scan'
  | 'agent_run_discovery'
  | 'agent_sync_bridge'
  | 'job_pause_all'
  | 'job_resume_all';

export interface CuratorPlayPartyEligibility {
  status: 'qualifying_play_party' | 'ambiguous_requires_human_review' | 'non_play_flagged' | string;
  qualified: boolean;
  requiresHumanReview: boolean;
  confidence: 'high' | 'medium' | 'low' | string;
  matchedSignals: string[];
  ambiguitySignals: string[];
  reason: string;
}

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
  highResUrl: string | null;
  associatedEventUrl: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  sourceRole: string;
  relevance: 'event_specific' | 'series_specific' | 'generic_club' | string;
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
  customFlyerUrl?: string | null;
  customHeaderUrl?: string | null;
  customArtworkLocked?: boolean;
  replaceExistingArtwork?: boolean;
  publishEligible?: boolean;
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
    creativeProcess?: 'reference_first' | 'description_first' | string;
    styleFamily: string | null;
    medium?: string | null;
    layoutTemplate?: string | null;
    layoutTemplateName?: string | null;
    selectedVersionId: string;
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
  styleFamily: string | null;
  medium?: string | null;
  layoutTemplate?: string | null;
  layoutTemplateName?: string | null;
  regenerationLevel?: 'artwork' | 'layout' | 'typography' | string;
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

export const normalizeCuratorDashboardSnapshot = (
  raw: Partial<CuratorDashboardSnapshot> | null | undefined,
): CuratorDashboardSnapshot => {
  const s = (raw || {}) as any;
  const candidates: CuratorCandidateRecord[] = Array.isArray(s.candidates) ? s.candidates : [];
  const communityCandidates: CuratorCommunityCandidateRecord[] = Array.isArray(s.communityCandidates)
    ? s.communityCandidates
    : [];
  const mediaItems: CuratorMediaItem[] = Array.isArray(s.mediaItems) ? s.mediaItems : [];
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

  const proposedFlyer =
    candidate.customFlyerUrl ||
    uploadedFlyerUrl ||
    nonLocalStagedFlyer ||
    (!isLocalPreviewOrDataUrl(candidate.flyerUrl) ? candidate.flyerUrl : undefined) ||
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
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (candidate.isClosureNotice || candidate.candidateType === 'closure_notice' || candidate.reviewState === 'excluded_closure_notice') {
    errors.push('Closure notices cannot be published as public events.');
  }
  if (candidate.reconciliationState === 'duplicate_translation' || candidate.reviewState === 'excluded_duplicate_translation') {
    errors.push('Duplicate translation records cannot be published; publish the canonical event instead.');
  }
  if (candidate.auditCategory === 'historical_event' || candidate.reviewState === 'historical_not_for_publication') {
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
): CuratorManualPublishPreview => {
  const readyItems: CuratorPublishPreviewItem[] = [];
  const invalidItems: CuratorPublishPreviewItem[] = [];
  const alreadyPublishedItems: CuratorManualPublishPreview['alreadyPublishedItems'] = [];

  const candidatePool = (snapshot.candidates || []).filter((c) =>
    ['approved', 'ready_to_publish', 'publish_failed', 'published'].includes(c.reviewState),
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

    const { errors, warnings } = validateCandidateForManualPublish(candidate, listings);
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
