import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Lock,
  MapPin,
  Palette,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sliders,
  Upload,
  Users,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import type { Listing } from '../../types';
import { useAppStore } from '../../store/appStore';
import * as api from '../../lib/api';
import {
  analyzeCuratorArtworkDimensions,
  approveCandidateViaAuthorizedWorkflow,
  buildCommandIdempotencyKey,
  buildCuratorPromotionalContentSchema,
  clearCuratorCandidateDraft,
  CURATOR_ARTWORK_STYLE_CATEGORIES,
  fetchCuratorDashboardSnapshot,
  filterCandidatesByQueueSignificance,
  gatherPublishableApprovedCandidates,
  generateCuratorArtworkPrompt,
  getCuratorArtworkStyleCategory,
  getCuratorCandidateDraft,
  getSafeExternalHttpUrl,
  getStoredCuratorArtworkPrompt,
  isCandidateDateExpired,
  isCandidateExcludedDuplicate,
  loadCuratorCandidateDrafts,
  mergeCandidateWithDraft,
  overrideCandidateSignificance,
  publishApprovedCuratorChanges,
  resolveArtworkRoleProvenance,
  saveCuratorCandidateDraft,
  saveStoredCuratorArtworkPrompt,
  selectCandidateExtractedMedia,
  sendCuratorCommand,
  SIGNIFICANCE_CATEGORY_META,
  sortCandidatesForEditorialQueue,
  validateCandidateForEditorialReview,
  validateCuratorArtworkUploadFile,
  type CuratorArtworkAspectAnalysis,
  type CuratorArtworkRole,
  type CuratorCandidateDraftEdits,
  type CuratorCandidateRecord,
  type CuratorCommandType,
  type CuratorDashboardSnapshot,
  type CuratorDiscoveredImage,
  type CuratorManualPublishPreview,
  type CuratorManualPublishSummary,
  type CuratorMediaItem,
  type CuratorMonitoredSource,
  type CuratorQueueSignificanceFilter,
  type CuratorSignificanceCategory,
} from '../../lib/contentCuratorApi';

export type CuratorPrimaryTab = 'review-queue' | 'artwork-studio' | 'monitored-sources' | 'agent-jobs';
export type CuratorEditorialSection =
  | 'event-review'
  | 'community-discovery'
  | 'approved-history'
  | 'settings-monitoring';

interface AdminContentCuratorProps {
  listings: Listing[];
  onDataChange: () => Promise<void> | void;
  onOpenSubmissionInEditor?: (listingId: string) => void;
  initialTab?: CuratorPrimaryTab;
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Australia/Sydney',
];

const QUICK_REJECTION_REASONS = [
  'Not a qualifying lifestyle / play-party event',
  'Duplicate or already listed occurrence',
  'Missing critical event date or venue details',
  'Past or cancelled event',
  'Private / non-public member notice only',
];

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return 'Never';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCuratorDetail = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatCuratorDetail).filter(Boolean).join(' · ');
  if (typeof value === 'object') {
    const detail = value as Record<string, unknown>;
    const raw = detail.rawText ?? detail.raw ?? detail.text;
    if (typeof raw === 'string' && raw.trim()) return raw;
    if (Array.isArray(detail.tiers))
      return detail.tiers
        .map((tier) => {
          if (typeof tier !== 'object' || tier === null) return formatCuratorDetail(tier);
          const entry = tier as Record<string, unknown>;
          return [entry.label ?? entry.category, entry.price].map(formatCuratorDetail).filter(Boolean).join(': ');
        })
        .filter(Boolean)
        .join(' · ');
    return '';
  }
  return '';
};

const formatShortDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Missing Date';
  return dateStr;
};

const formatReadableEventDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Missing Event Date';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parsed = new Date(`${dateStr}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }
  return dateStr;
};

const statusBadgeClass = (status: string): string => {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'published', 'ok', 'connected', 'pass'].includes(normalized)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (['ready_to_publish', 'staged_in_submissions', 'brief_ready', 'moderate', 'normal'].includes(normalized)) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (
    [
      'pending_review',
      'needs_visual_review',
      'official_artwork_review',
      'partial',
      'changes_requested',
      'regeneration_requested',
      'degraded',
      'high',
      'deferred',
    ].includes(normalized)
  ) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (
    [
      'rejected',
      'publish_failed',
      'failed',
      'offline',
      'closure_notice',
      'not_for_publication',
      'historical_not_for_publication',
      'blocked_missing_facts',
    ].includes(normalized)
  ) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const reconciliationLabel = (state: string, candidateType: string): string => {
  if (candidateType === 'closure_notice') return 'Closure Notice';
  if (candidateType === 'duplicate_translation' || state === 'duplicate_translation') return 'Duplicate Translation';
  if (state === 'correction_proposed') return 'Proposed Correction';
  if (state === 'possible_duplicate') return 'Possible Duplicate';
  if (state === 'new') return 'New Event';
  return state.replace(/_/g, ' ');
};

const significanceBadgeClass = (category?: CuratorSignificanceCategory | string | null): string => {
  switch (category) {
    case 'special_event':
      return 'bg-rose-600 text-white border-rose-700';
    case 'monthly_signature':
      return 'bg-emerald-600 text-white border-emerald-700';
    case 'weekly_signature':
      return 'bg-sky-600 text-white border-sky-700';
    case 'routine_club_night':
      return 'bg-slate-200 text-slate-700 border-slate-300';
    case 'needs_human_review':
    default:
      return 'bg-amber-100 text-amber-900 border-amber-300';
  }
};

const AdminContentCurator: React.FC<AdminContentCuratorProps> = ({
  listings,
  onDataChange,
  onOpenSubmissionInEditor,
  initialTab = 'review-queue',
}) => {
  const { addToast } = useAppStore();

  // Map legacy initialTab to 4 simplified sections while preserving sub-tabs
  const initialSection: CuratorEditorialSection =
    initialTab === 'artwork-studio'
      ? 'approved-history'
      : initialTab === 'monitored-sources' || initialTab === 'agent-jobs'
        ? 'settings-monitoring'
        : 'event-review';

  const [activeSection, setActiveSection] = useState<CuratorEditorialSection>(initialSection);
  const [activeTab, setActiveTab] = useState<CuratorPrimaryTab>(initialTab);
  const [historySubView, setHistorySubView] = useState<'events' | 'artwork-studio'>(
    initialTab === 'artwork-studio' ? 'artwork-studio' : 'events',
  );
  const [settingsSubView, setSettingsSubView] = useState<'monitored-sources' | 'agent-jobs'>(
    initialTab === 'agent-jobs' ? 'agent-jobs' : 'monitored-sources',
  );

  const [snapshot, setSnapshot] = useState<CuratorDashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  // Editorial Event Review Queue state (Significance filter defaults to 'recommended')
  const [candidateSearch, setCandidateSearch] = useState('');
  const [visibleQueueLimit, setVisibleQueueLimit] = useState(20);
  const [significanceFilter, setSignificanceFilter] = useState<CuratorQueueSignificanceFilter>('recommended');
  const [overrideCategoryInput, setOverrideCategoryInput] = useState<CuratorSignificanceCategory>('special_event');
  const [overrideNotesInput, setOverrideNotesInput] = useState<string>('');
  const [queueQuickFilter, setQueueQuickFilter] = useState<
    'pending_review' | 'with_artwork' | 'with_warnings' | 'corrections' | 'all_actionable'
  >('pending_review');
  const [candidateFilter, setCandidateFilter] = useState<
    'actionable' | 'all' | 'new' | 'correction_proposed' | 'warnings' | 'closure' | 'inferred_year' | 'ambiguous_play_party'
  >('actionable');
  const [candidateReviewFilter, setCandidateReviewFilter] = useState<
    | 'all'
    | 'pending_review'
    | 'approved'
    | 'ready_to_publish'
    | 'published'
    | 'publish_failed'
    | 'changes_requested'
    | 'deferred'
    | 'rejected'
  >('all');

  // History view filters
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    'all_processed' | 'ready_to_publish' | 'deferred' | 'published' | 'rejected' | 'excluded'
  >('all_processed');
  const [historySearch, setHistorySearch] = useState('');

  // Community Discovery filters
  const [communitySearch, setCommunitySearch] = useState('');
  const [communityStatusFilter, setCommunityStatusFilter] = useState<
    'all' | 'pending_review' | 'approved' | 'deferred' | 'rejected'
  >('all');

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishPreview, setPublishPreview] = useState<CuratorManualPublishPreview | null>(null);
  const [isPublishingBatch, setIsPublishingBatch] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{
    completed: number;
    total: number;
    currentTitle: string;
  } | null>(null);
  const [publishSummary, setPublishSummary] = useState<CuratorManualPublishSummary | null>(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateNotes, setCandidateNotes] = useState('');
  const [isEditingCandidate, setIsEditingCandidate] = useState(true);
  const [showRejectDrawer, setShowRejectDrawer] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [overrideEligibilityChecked, setOverrideEligibilityChecked] = useState(false);
  const [showListingPreview, setShowListingPreview] = useState(false);

  // Independent Flyer vs Hero Artwork Controls state
  const [flyerStyleCategory, setFlyerStyleCategory] = useState<string>('classic_nightclub');
  const [heroStyleCategory, setHeroStyleCategory] = useState<string>('cinematic');
  const [rerollingRole, setRerollingRole] = useState<'flyer' | 'hero' | null>(null);
  const [mediaLibraryModalRole, setMediaLibraryModalRole] = useState<'flyer' | 'hero' | null>(null);
  const [mediaLibrarySearch, setMediaLibrarySearch] = useState('');
  const [compareModalRole, setCompareModalRole] = useState<'flyer' | 'hero' | null>(null);
  const [validationNoticesExpanded, setValidationNoticesExpanded] = useState<boolean>(false);

  // Prompt Generation, Preview, Editing & Copying Modal state
  const [promptModalState, setPromptModalState] = useState<{
    candidateId: string;
    role: CuratorArtworkRole;
    styleCategoryId: string;
    styleCategoryLabel: string;
    targetAspectRatio: string;
    targetResolution: string;
    promptText: string;
    variationSeed: number;
    copiedStatus: 'idle' | 'copied' | 'error';
  } | null>(null);

  // Drag-and-Drop & File Replacement Preview Confirmation state
  const [dragOverRole, setDragOverRole] = useState<'flyer' | 'hero' | null>(null);
  const [pendingUploadConfirmation, setPendingUploadConfirmation] = useState<{
    candidate: CuratorCandidateRecord;
    role: 'flyer' | 'hero';
    fileName: string;
    fileSize: number;
    mimeType: string;
    dataUrl: string;
    width: number;
    height: number;
    aspectAnalysis: CuratorArtworkAspectAnalysis;
    fitMode: 'contain' | 'cover';
    previousPreviewUrl: string | null;
  } | null>(null);

  const flyerFileInputRef = useRef<HTMLInputElement | null>(null);
  const heroFileInputRef = useRef<HTMLInputElement | null>(null);
  const editorSectionRef = useRef<HTMLDivElement | null>(null);

  // Local draft map state (persisted in localStorage)
  const [localDraftsMap, setLocalDraftsMap] = useState<Record<string, CuratorCandidateDraftEdits>>(() =>
    loadCuratorCandidateDrafts(),
  );

  const [editForm, setEditForm] = useState<{
    title: string;
    date: string;
    endDate: string;
    startTime: string;
    endTime: string;
    timezone: string;
    venue: string;
    address: string;
    city: string;
    region: string;
    country: string;
    clubId: string;
    clubName: string;
    hostId: string;
    hostName: string;
    theme: string;
    dressCode: string;
    restrictions: string;
    admission: string;
    membershipRequirement: string;
    rsvpRequirement: string;
    ageRequirement: string;
    scheduleChanges: string;
    sourceUrl: string;
    ticketUrl: string;
    rsvpUrl: string;
    displayDescription: string;
    flyerUrl: string;
    customHeaderUrl: string;
    customArtworkLocked: boolean;
  }>({
    title: '',
    date: '',
    endDate: '',
    startTime: '',
    endTime: '',
    timezone: '',
    venue: '',
    address: '',
    city: '',
    region: '',
    country: '',
    clubId: '',
    clubName: '',
    hostId: '',
    hostName: '',
    theme: '',
    dressCode: '',
    restrictions: '',
    admission: '',
    membershipRequirement: '',
    rsvpRequirement: '',
    ageRequirement: '',
    scheduleChanges: '',
    sourceUrl: '',
    ticketUrl: '',
    rsvpUrl: '',
    displayDescription: '',
    flyerUrl: '',
    customHeaderUrl: '',
    customArtworkLocked: false,
  });

  // View B: Artwork Studio state
  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaCategoryFilter, setMediaCategoryFilter] = useState<
    'generated_pairs' | 'candidate_pairs' | 'validation_pairs' | 'official_review' | 'brief_ready' | 'all'
  >('generated_pairs');
  const [mediaStatusFilter, setMediaStatusFilter] = useState<
    'all' | 'pending_review' | 'approved' | 'regeneration_requested' | 'rejected'
  >('all');
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [inspectingVersionId, setInspectingVersionId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);
  const [artworkReviewNotes, setArtworkReviewNotes] = useState('');
  const [regenFeedback, setRegenFeedback] = useState('');
  const [regenStyleFamily, setRegenStyleFamily] = useState('');
  const [regenLayoutTemplate, setRegenLayoutTemplate] = useState('');
  const [regenLevel, setRegenLevel] = useState<'artwork' | 'layout' | 'typography'>('artwork');
  const [regenSensualityMode, setRegenSensualityMode] = useState('');
  const [regenComposition, setRegenComposition] = useState('');
  const [regenGenerateNow, setRegenGenerateNow] = useState<boolean>(false);

  // View C: Monitored Sources state
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceEntityFilter, setSourceEntityFilter] = useState<'all' | 'club' | 'promoter'>('all');
  const [sourceTierFilter, setSourceTierFilter] = useState<'all' | 'high' | 'moderate' | 'normal' | 'low' | 'static'>('all');
  const [sourceStatusFilter, setSourceStatusFilter] = useState<
    'all' | 'ok' | 'partial' | 'failed' | 'unattempted' | 'paused' | 'due_now' | 'missing_url'
  >('all');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [scheduleTierInput, setScheduleTierInput] = useState<string>('normal');
  const [scheduleIntervalInput, setScheduleIntervalInput] = useState<string>('7');
  const [scheduleAdaptiveInput, setScheduleAdaptiveInput] = useState<boolean>(true);
  const [scheduleReasonInput, setScheduleReasonInput] = useState<string>('');

  const handleSelectSection = (section: CuratorEditorialSection) => {
    setActiveSection(section);
    if (section === 'event-review') {
      setActiveTab('review-queue');
    } else if (section === 'community-discovery') {
      setActiveTab('review-queue');
    } else if (section === 'approved-history') {
      setActiveTab(historySubView === 'artwork-studio' ? 'artwork-studio' : 'review-queue');
    } else if (section === 'settings-monitoring') {
      setActiveTab(settingsSubView);
    }
  };

  const loadSnapshot = async (mirrorSupabase = false) => {
    try {
      if (!snapshot) setIsLoading(true);
      setIsSyncing(true);
      setLoadError(null);
      const data = await fetchCuratorDashboardSnapshot({ mirrorSupabase });
      setSnapshot(data);
      setLocalDraftsMap(loadCuratorCandidateDrafts());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load Content Curator dashboard.';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void loadSnapshot(false);
  }, []);

  const mediaByCandidateId = useMemo(() => {
    const map = new Map<string, CuratorMediaItem>();
    if (!snapshot) return map;
    for (const m of snapshot.mediaItems) {
      map.set(m.id, m);
      if (m.candidateId) map.set(m.candidateId, m);
    }
    return map;
  }, [snapshot]);

  const baseActionableQueuePool = useMemo(() => {
    if (!snapshot) return [];
    const q = candidateSearch.trim().toLowerCase();
    return snapshot.candidates.filter((c) => {
      if (
        c.candidateType === 'closure_notice' ||
        c.auditCategory === 'historical_event' ||
        c.reviewState === 'historical_not_for_publication' ||
        c.archivedAsHistorical ||
        c.auditCategory === 'already_in_catalog' ||
        isCandidateExcludedDuplicate(c) ||
        isCandidateDateExpired(c.date, c.timezone)
      ) {
        return false;
      }

      if (queueQuickFilter === 'pending_review') {
        if (c.reviewState !== 'pending_review' && c.reviewState !== 'changes_requested') return false;
      } else if (queueQuickFilter === 'with_artwork') {
        if (c.reviewState !== 'pending_review' && c.reviewState !== 'changes_requested') return false;
        const m = mediaByCandidateId.get(c.id);
        const hasArt = Boolean(
          c.stagedMedia?.hasGeneratedPair ||
            m?.hasGeneratedPair ||
            c.customFlyerUrl ||
            c.stagedMedia?.flyerPreviewUrl ||
            c.flyerUrl,
        );
        if (!hasArt) return false;
      } else if (queueQuickFilter === 'with_warnings') {
        if (c.reviewState !== 'pending_review' && c.reviewState !== 'changes_requested') return false;
        if (
          c.warnings.length === 0 &&
          c.missingFields.length === 0 &&
          !c.playPartyEligibility?.requiresHumanReview &&
          c.inferredFields.length === 0
        ) {
          return false;
        }
      } else if (queueQuickFilter === 'corrections') {
        if (c.reconciliationState !== 'correction_proposed') return false;
      }

      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.clubName.toLowerCase().includes(q) ||
        (c.hostName || '').toLowerCase().includes(q) ||
        (c.venue || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.date || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, candidateSearch, queueQuickFilter, mediaByCandidateId]);

  const significanceCounts = useMemo(() => {
    return {
      recommended: filterCandidatesByQueueSignificance(baseActionableQueuePool, 'recommended').length,
      special_event: filterCandidatesByQueueSignificance(baseActionableQueuePool, 'special_event').length,
      monthly_signature: filterCandidatesByQueueSignificance(baseActionableQueuePool, 'monthly_signature').length,
      weekly_signature: filterCandidatesByQueueSignificance(baseActionableQueuePool, 'weekly_signature').length,
      routine_club_night: filterCandidatesByQueueSignificance(baseActionableQueuePool, 'routine_club_night').length,
      needs_human_review: filterCandidatesByQueueSignificance(baseActionableQueuePool, 'needs_human_review').length,
      all: baseActionableQueuePool.length,
    };
  }, [baseActionableQueuePool]);

  // Event Review Queue Candidates (prioritized by significance tier + generated Flyer/Hero pair + valid date)
  const editorialQueueCandidates = useMemo(() => {
    const bySig = filterCandidatesByQueueSignificance(baseActionableQueuePool, significanceFilter);
    return sortCandidatesForEditorialQueue(bySig, mediaByCandidateId);
  }, [baseActionableQueuePool, significanceFilter, mediaByCandidateId]);

  const filteredCandidates = editorialQueueCandidates;

  const selectedCandidate: CuratorCandidateRecord | null = useMemo(() => {
    if (!snapshot) return null;
    if (selectedCandidateId) {
      const explicit =
        editorialQueueCandidates.find((c) => c.id === selectedCandidateId) ||
        snapshot.candidates.find((c) => c.id === selectedCandidateId);
      if (explicit) return explicit;
    }
    return editorialQueueCandidates[0] || snapshot.candidates[0] || null;
  }, [editorialQueueCandidates, selectedCandidateId, snapshot]);

  const selectedCandidateQueueIndex = useMemo(() => {
    if (!selectedCandidate) return -1;
    return editorialQueueCandidates.findIndex((c) => c.id === selectedCandidate.id);
  }, [editorialQueueCandidates, selectedCandidate]);

  const selectedCandidateMedia: CuratorMediaItem | null = useMemo(() => {
    if (!selectedCandidate) return null;
    return mediaByCandidateId.get(selectedCandidate.id) || null;
  }, [selectedCandidate, mediaByCandidateId]);

  const activeCandidateDraft: CuratorCandidateDraftEdits | null = useMemo(() => {
    if (!selectedCandidate) return null;
    return localDraftsMap[selectedCandidate.id] || getCuratorCandidateDraft(selectedCandidate.id);
  }, [selectedCandidate, localDraftsMap]);

  const mergedCandidate: CuratorCandidateRecord | null = useMemo(() => {
    if (!selectedCandidate) return null;
    return mergeCandidateWithDraft(selectedCandidate, activeCandidateDraft);
  }, [selectedCandidate, activeCandidateDraft]);

  const candidateValidation = useMemo(() => {
    if (!selectedCandidate) return null;
    return validateCandidateForEditorialReview(selectedCandidate, activeCandidateDraft);
  }, [selectedCandidate, activeCandidateDraft]);

  // Populate editForm from candidate + any saved localStorage draft when switching events
  useEffect(() => {
    if (selectedCandidate) {
      const draft = getCuratorCandidateDraft(selectedCandidate.id);
      const merged = mergeCandidateWithDraft(selectedCandidate, draft);
      setEditForm({
        title: merged.title || '',
        date: merged.date || '',
        endDate: merged.endDate || '',
        startTime: merged.startTime || '',
        endTime: merged.endTime || '',
        timezone: merged.timezone || 'America/New_York',
        venue: merged.venue || '',
        address: merged.address || '',
        city: merged.city || '',
        region: merged.region || '',
        country: merged.country || 'USA',
        clubId: merged.clubId || '',
        clubName: merged.clubName || '',
        hostId: merged.hostId || '',
        hostName: merged.hostName || '',
        theme: formatCuratorDetail(merged.theme || merged.eventDetails?.theme),
        dressCode: formatCuratorDetail(merged.dressCode || merged.eventDetails?.dressCode),
        restrictions: formatCuratorDetail(merged.restrictions || merged.eventDetails?.restrictions),
        admission: formatCuratorDetail(merged.admission || merged.eventDetails?.admission),
        membershipRequirement: formatCuratorDetail(
          merged.membershipRequirement || merged.eventDetails?.membershipRequirement,
        ),
        rsvpRequirement: formatCuratorDetail(merged.rsvpRequirement || merged.eventDetails?.rsvpRequirement),
        ageRequirement: formatCuratorDetail(merged.ageRequirement || merged.eventDetails?.ageRequirement),
        scheduleChanges: formatCuratorDetail(merged.scheduleChanges || merged.eventDetails?.scheduleChanges),
        sourceUrl: merged.sourceUrl || '',
        ticketUrl: merged.ticketUrl || '',
        rsvpUrl: merged.rsvpUrl || '',
        displayDescription: merged.displayDescription || merged.description || '',
        flyerUrl: merged.customFlyerUrl || merged.flyerUrl || '',
        customHeaderUrl: merged.customHeaderUrl || '',
        customArtworkLocked: Boolean(merged.customArtworkLocked),
      });
      setShowRejectDrawer(false);
      setRejectionReason('');
      setOverrideEligibilityChecked(Boolean(selectedCandidate.reviewDecision?.overridePlayPartyEligibility));
      setOverrideCategoryInput(
        (selectedCandidate.eventSignificance?.category as CuratorSignificanceCategory) || 'special_event',
      );
      setOverrideNotesInput(selectedCandidate.eventSignificance?.manualOverride?.notes || '');
    }
  }, [selectedCandidate?.id]);

  const handleOverrideSignificance = async (
    candidate: CuratorCandidateRecord,
    category: CuratorSignificanceCategory | undefined,
    notes: string,
    resetOverride = false,
  ) => {
    const actionKey = `sig-override:${candidate.id}`;
    setSelectedCandidateId(candidate.id);
    setBusyActionKey(actionKey);
    try {
      const res = await overrideCandidateSignificance(candidate.id, {
        category,
        notes,
        resetOverride,
      });
      if (res?.snapshot) {
        setSnapshot(res.snapshot);
      } else if ((res?.command?.result as any)?.eventSignificance) {
        const updatedSig = (res.command.result as any).eventSignificance;
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                candidates: prev.candidates.map((c) =>
                  c.id === candidate.id ? { ...c, eventSignificance: updatedSig } : c,
                ),
              }
            : prev,
        );
      } else {
        const fresh = await fetchCuratorDashboardSnapshot();
        setSnapshot(fresh);
      }
      addToast(
        resetOverride
          ? 'Classification override reset to automatic.'
          : `Event classified as ${SIGNIFICANCE_CATEGORY_META[category || 'special_event'].fullLabel}.`,
        'success',
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to update event significance classification.', 'error');
    } finally {
      setBusyActionKey(null);
    }
  };

  // Helper to update editForm AND immediately persist to localStorage draft (never triggers artwork regeneration)
  const updateDraftField = <K extends keyof typeof editForm>(field: K, value: (typeof editForm)[K]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    if (!selectedCandidate) return;
    const draftPatch: Partial<CuratorCandidateDraftEdits> = {};
    if (field === 'displayDescription') {
      draftPatch.description = String(value);
    } else if (field === 'flyerUrl') {
      draftPatch.customFlyerUrl = String(value) || null;
    } else if (field !== 'customArtworkLocked') {
      (draftPatch as any)[field] = value;
    }
    const updatedDraft = saveCuratorCandidateDraft(selectedCandidate.id, draftPatch);
    setLocalDraftsMap((prev) => ({ ...prev, [selectedCandidate.id]: updatedDraft }));
  };

  // Filtered History Candidates for "Approved & History" section
  const filteredHistoryCandidates = useMemo(() => {
    if (!snapshot) return [];
    const q = historySearch.trim().toLowerCase();
    return snapshot.candidates.filter((c) => {
      if (historyStatusFilter === 'ready_to_publish') {
        if (
          !['approved', 'ready_to_publish', 'publish_failed', 'staged_in_submissions'].includes(c.reviewState) ||
          c.archivedAsHistorical ||
          c.auditCategory === 'historical_event' ||
          isCandidateExcludedDuplicate(c) ||
          isCandidateDateExpired(c.date, c.timezone)
        )
          return false;
      } else if (historyStatusFilter === 'deferred') {
        if (c.reviewState !== 'deferred') return false;
      } else if (historyStatusFilter === 'published') {
        if (c.reviewState !== 'published') return false;
      } else if (historyStatusFilter === 'rejected') {
        if (c.reviewState !== 'rejected') return false;
      } else if (historyStatusFilter === 'excluded') {
        if (
          ![
            'not_for_publication',
            'historical_not_for_publication',
            'excluded_closure_notice',
            'excluded_duplicate_translation',
            'possible_duplicate',
          ].includes(c.reviewState) &&
          !c.archivedAsHistorical &&
          c.auditCategory !== 'historical_event' &&
          !isCandidateExcludedDuplicate(c)
        )
          return false;
      } else {
        if (c.reviewState === 'pending_review' && !isCandidateExcludedDuplicate(c) && !c.archivedAsHistorical)
          return false;
      }

      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.clubName.toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.date || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, historyStatusFilter, historySearch]);

  // Filtered Community Candidates for "Community Discovery" section
  const filteredCommunityCandidates = useMemo(() => {
    if (!snapshot) return [];
    const q = communitySearch.trim().toLowerCase();
    return (snapshot.communityCandidates || []).filter((org) => {
      if (communityStatusFilter !== 'all' && org.reviewState !== communityStatusFilter) return false;
      if (!q) return true;
      return (
        org.name.toLowerCase().includes(q) ||
        (org.city || '').toLowerCase().includes(q) ||
        (org.region || '').toLowerCase().includes(q) ||
        (org.website || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, communitySearch, communityStatusFilter]);

  // Filtered Media Items for Artwork Studio
  const filteredMediaItems = useMemo(() => {
    if (!snapshot) return [];
    const q = mediaSearch.trim().toLowerCase();
    return snapshot.mediaItems.filter((m) => {
      if (mediaCategoryFilter === 'generated_pairs' && !m.hasGeneratedPair) return false;
      if (mediaCategoryFilter === 'candidate_pairs' && (!m.hasGeneratedPair || m.validationOnly)) return false;
      if (mediaCategoryFilter === 'validation_pairs' && (!m.hasGeneratedPair || !m.validationOnly)) return false;
      if (mediaCategoryFilter === 'official_review' && m.status !== 'official_artwork_review') return false;
      if (mediaCategoryFilter === 'brief_ready' && m.status !== 'brief_ready') return false;

      if (mediaStatusFilter !== 'all') {
        if (mediaStatusFilter === 'pending_review') {
          if (!['pending_review', 'needs_visual_review', 'official_artwork_review'].includes(m.status)) return false;
        } else if (mediaStatusFilter === 'approved') {
          if (m.status !== 'approved' && !m.visualReview?.artworkApproved) return false;
        } else if (m.status !== mediaStatusFilter) {
          return false;
        }
      }

      if (!q) return true;
      return (
        m.eventTitle.toLowerCase().includes(q) ||
        m.clubName.toLowerCase().includes(q) ||
        (m.styleFamily || '').toLowerCase().includes(q) ||
        (m.layoutTemplateName || m.layoutTemplate || '').toLowerCase().includes(q) ||
        (m.sensualityDirection?.mode || '').toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [snapshot, mediaSearch, mediaCategoryFilter, mediaStatusFilter]);

  const selectedMedia: CuratorMediaItem | null = useMemo(() => {
    if (!filteredMediaItems.length) return null;
    return (
      filteredMediaItems.find((m) => m.id === selectedMediaId) ||
      snapshot?.mediaItems.find((m) => m.id === selectedMediaId) ||
      filteredMediaItems[0]
    );
  }, [filteredMediaItems, selectedMediaId, snapshot]);

  useEffect(() => {
    if (selectedMedia) {
      setInspectingVersionId(selectedMedia.selectedVersionId || selectedMedia.versionHistory?.at(-1)?.versionId || 'v1');
      setRegenStyleFamily(selectedMedia.styleFamily || '');
      setRegenLayoutTemplate(selectedMedia.layoutTemplate || '');
      setRegenSensualityMode(selectedMedia.sensualityDirection?.mode || '');
      setRegenComposition(selectedMedia.composition || '');
    }
  }, [selectedMedia?.id, selectedMedia?.selectedVersionId]);

  // Filtered Monitored Sources
  const filteredSources = useMemo(() => {
    if (!snapshot) return [];
    const q = sourceSearch.trim().toLowerCase();
    return snapshot.monitoredSources.filter((s) => {
      if (sourceEntityFilter !== 'all' && s.entityType !== sourceEntityFilter) return false;
      if (sourceTierFilter !== 'all' && s.monitoringTier !== sourceTierFilter) return false;
      if (sourceStatusFilter !== 'all') {
        if (sourceStatusFilter === 'due_now') {
          if (!s.isDueNow) return false;
        } else if (sourceStatusFilter === 'missing_url') {
          if (!s.missingEventSourceUrl && !s.missingWebsiteUrl) return false;
        } else if (s.extractionStatus !== sourceStatusFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.country || '').toLowerCase().includes(q) ||
        (s.adapter || '').toLowerCase().includes(q) ||
        (s.website || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, sourceSearch, sourceEntityFilter, sourceTierFilter, sourceStatusFilter]);

  const selectedSource: CuratorMonitoredSource | null = useMemo(() => {
    if (!filteredSources.length) return null;
    return (
      filteredSources.find((s) => s.id === selectedSourceId) ||
      snapshot?.monitoredSources.find((s) => s.id === selectedSourceId) ||
      filteredSources[0]
    );
  }, [filteredSources, selectedSourceId, snapshot]);

  useEffect(() => {
    if (selectedSource) {
      setScheduleTierInput(selectedSource.monitoringTier || 'normal');
      setScheduleIntervalInput(String(selectedSource.currentIntervalDays || 7));
      setScheduleAdaptiveInput(selectedSource.adaptiveSchedulingEnabled !== false);
      setScheduleReasonInput(selectedSource.manualOverride?.reason || '');
    }
  }, [selectedSource?.id]);

  // Core Command Runner
  const handleRunCommand = async (
    commandType: CuratorCommandType,
    targetId: string,
    payload: Record<string, unknown> = {},
    successMessage?: string,
    options?: {
      idempotencyKey?: string;
      recoverInterrupted?: boolean;
      retryFailed?: boolean;
      silentToast?: boolean;
    },
  ) => {
    const actionKey = `${commandType}:${targetId}`;
    try {
      setBusyActionKey(actionKey);
      const idempotencyKey =
        options?.idempotencyKey || buildCommandIdempotencyKey(commandType, targetId, JSON.stringify(payload));
      const res = await sendCuratorCommand({
        idempotencyKey,
        commandType,
        targetId,
        payload,
        recoverInterrupted: options?.recoverInterrupted,
        retryFailed: options?.retryFailed,
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      if (!options?.silentToast) {
        addToast({
          message: res.duplicate
            ? `Command already acknowledged (deduplicated: ${commandType}).`
            : successMessage || `Curator command "${commandType}" acknowledged.`,
          type: 'success',
        });
      }
      return res;
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Failed to execute Content Curator command.',
        type: 'error',
      });
      throw err;
    } finally {
      setBusyActionKey(null);
    }
  };

  // Persist current editForm fields to SQLite (without regenerating any artwork!)
  const persistCandidateEditsToSqlite = async (candidate: CuratorCandidateRecord, silent = false) => {
    const res = await handleRunCommand(
      'candidate_update_fields',
      candidate.id,
      {
        fields: {
          title: editForm.title.trim(),
          date: editForm.date.trim() || null,
          endDate: editForm.endDate.trim() || null,
          startTime: editForm.startTime.trim() || null,
          endTime: editForm.endTime.trim() || null,
          timezone: editForm.timezone.trim() || null,
          venue: editForm.venue.trim() || null,
          address: editForm.address.trim() || null,
          city: editForm.city.trim() || null,
          region: editForm.region.trim() || null,
          country: editForm.country.trim() || null,
          clubId: editForm.clubId.trim() || null,
          clubName: editForm.clubName.trim() || null,
          hostId: editForm.hostId.trim() || null,
          hostName: editForm.hostName.trim() || null,
          theme: editForm.theme.trim() || null,
          dressCode: editForm.dressCode.trim() || null,
          restrictions: editForm.restrictions.trim() || null,
          admission: editForm.admission.trim() || null,
          membershipRequirement: editForm.membershipRequirement.trim() || null,
          rsvpRequirement: editForm.rsvpRequirement.trim() || null,
          ageRequirement: editForm.ageRequirement.trim() || null,
          scheduleChanges: editForm.scheduleChanges.trim() || null,
          officialUrl: editForm.sourceUrl.trim() || null,
          ticketUrl: editForm.ticketUrl.trim() || null,
          rsvpUrl: editForm.rsvpUrl.trim() || null,
          description: editForm.displayDescription.trim() || null,
          displayDescription: editForm.displayDescription.trim() || null,
          customFlyerUrl: editForm.flyerUrl.trim() || null,
          customHeaderUrl: editForm.customHeaderUrl.trim() || null,
        },
        customArtworkLocked: editForm.customArtworkLocked,
        notes: candidateNotes.trim() || 'Saved inline event details edits in Content Curator',
      },
      `Saved event details for "${editForm.title || candidate.title}".`,
      { silentToast: silent, idempotencyKey: `curator:edit:${candidate.id}:${Date.now()}` },
    );
    clearCuratorCandidateDraft(candidate.id);
    setLocalDraftsMap((prev) => {
      const next = { ...prev };
      delete next[candidate.id];
      return next;
    });
    return res;
  };

  // Auto-advance helper: selects the next pending candidate in the queue
  const findNextPendingCandidateId = (currentId: string): string | null => {
    const idx = editorialQueueCandidates.findIndex((c) => c.id === currentId);
    if (idx >= 0 && idx + 1 < editorialQueueCandidates.length) {
      return editorialQueueCandidates[idx + 1].id;
    }
    if (idx > 0) {
      return editorialQueueCandidates[idx - 1].id;
    }
    return null;
  };

  // Primary Editorial Review Action 1: APPROVE
  const handleEditorialApprove = async (candidate: CuratorCandidateRecord) => {
    if (busyActionKey) return;
    const validation = validateCandidateForEditorialReview(candidate, activeCandidateDraft);
    if (!validation.canApprove) {
      addToast({
        message: validation.blockingReasons[0] || 'Please complete required event fields before approving.',
        type: 'error',
      });
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (
      candidate.playPartyEligibility?.requiresHumanReview &&
      !overrideEligibilityChecked &&
      !candidate.reviewDecision?.overridePlayPartyEligibility
    ) {
      addToast({
        message: 'Please confirm Play-Party Eligibility verification before approving this event.',
        type: 'error',
      });
      return;
    }

    const nextId = findNextPendingCandidateId(candidate.id);
    try {
      setBusyActionKey(`editorial_approve:${candidate.id}`);
      if (activeCandidateDraft) {
        await persistCandidateEditsToSqlite(candidate, true);
      }
      // Confirm artwork selection if staged media exists
      const mediaItem = mediaByCandidateId.get(candidate.id);
      if (mediaItem && mediaItem.status !== 'approved') {
        await sendCuratorCommand({
          idempotencyKey: `curator:artwork_approve:${mediaItem.id}:${Date.now()}`,
          commandType: 'artwork_approve',
          targetId: mediaItem.id,
          payload: {
            versionId: mediaItem.selectedVersionId || 'v1',
            notes: 'Confirmed artwork during editorial event approval',
          },
        });
      }
      // Mark candidate approved in local SQLite (staged for manual Publish Approved Changes)
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:candidate_approve:${candidate.id}:${Date.now()}`,
        commandType: 'candidate_approve',
        targetId: candidate.id,
        payload: {
          overridePlayPartyEligibility:
            overrideEligibilityChecked || Boolean(candidate.reviewDecision?.overridePlayPartyEligibility),
          notes: candidateNotes.trim() || 'Approved in Editorial Event Review Queue',
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      clearCuratorCandidateDraft(candidate.id);
      if (nextId) {
        setSelectedCandidateId(nextId);
      }
      addToast({
        message: `Approved "${editForm.title || candidate.title}" (ready for Publish Approved Changes).`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Approval failed.',
        type: 'error',
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  // Primary Editorial Review Action 2: REJECT
  const handleEditorialReject = async (candidate: CuratorCandidateRecord, reasonOverride?: string) => {
    if (busyActionKey) return;
    const nextId = findNextPendingCandidateId(candidate.id);
    const reason = (reasonOverride ?? rejectionReason).trim() || candidateNotes.trim() || 'Rejected during editorial review';
    try {
      setBusyActionKey(`editorial_reject:${candidate.id}`);
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:candidate_reject:${candidate.id}:${Date.now()}`,
        commandType: 'candidate_reject',
        targetId: candidate.id,
        payload: {
          notes: reason,
          rejectionReason: reason,
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      clearCuratorCandidateDraft(candidate.id);
      setShowRejectDrawer(false);
      setRejectionReason('');
      if (nextId) {
        setSelectedCandidateId(nextId);
      }
      addToast({
        message: `Rejected "${candidate.title}" and removed from active review queue.`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Rejection failed.',
        type: 'error',
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  // Primary Editorial Review Action 3: SAVE FOR LATER (DEFER)
  const handleEditorialSaveForLater = async (candidate: CuratorCandidateRecord) => {
    if (busyActionKey) return;
    const nextId = findNextPendingCandidateId(candidate.id);
    try {
      setBusyActionKey(`editorial_defer:${candidate.id}`);
      if (activeCandidateDraft) {
        await persistCandidateEditsToSqlite(candidate, true);
      }
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:candidate_defer:${candidate.id}:${Date.now()}`,
        commandType: 'candidate_defer',
        targetId: candidate.id,
        payload: {
          notes: candidateNotes.trim() || 'Saved for later in deferred review queue',
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      if (nextId) {
        setSelectedCandidateId(nextId);
      }
      addToast({
        message: `Saved "${editForm.title || candidate.title}" for later in the deferred queue.`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Could not save event for later.',
        type: 'error',
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  // Independent Flyer or Hero Reroll / Style Change
  const handleIndependentArtworkReroll = async (
    candidate: CuratorCandidateRecord,
    role: 'flyer' | 'hero',
    styleCategoryOverride?: string,
  ) => {
    if (rerollingRole) return;
    const styleId = styleCategoryOverride || (role === 'flyer' ? flyerStyleCategory : heroStyleCategory);
    const styleObj = getCuratorArtworkStyleCategory(styleId);
    try {
      setRerollingRole(role);
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:reroll:${candidate.id}:${role}:${styleId}:${Date.now()}`,
        commandType: 'artwork_regenerate',
        targetId: candidate.id,
        payload: {
          targetRole: role,
          styleCategory: styleId,
          editorialReroll: true,
          notes: `Independent ${role} reroll in ${styleObj.label} style`,
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      addToast({
        message: `Generated new ${role === 'flyer' ? 'Flyer (4:5)' : 'Hero (16:9)'} variation in "${styleObj.label}" style (${role === 'flyer' ? 'Hero' : 'Flyer'} preserved unchanged).`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message:
          err instanceof Error
            ? `Artwork generation failed (${role} preserved): ${err.message}`
            : `Failed to generate ${role}; previous artwork preserved.`,
        type: 'error',
      });
    } finally {
      setRerollingRole(null);
    }
  };

  // Open Creative Brief Prompt Modal for Flyer or Hero (NEVER triggers image generation or modifies artwork)
  const handleOpenPromptModal = (
    candidate: CuratorCandidateRecord,
    role: CuratorArtworkRole,
  ) => {
    const selectedStyleId = role === 'flyer' ? flyerStyleCategory : heroStyleCategory;
    const styleCat = getCuratorArtworkStyleCategory(selectedStyleId);
    const stored = getStoredCuratorArtworkPrompt(candidate.id, role);
    if (stored && stored.styleCategoryId === styleCat.id && stored.promptText.trim()) {
      setPromptModalState({
        candidateId: candidate.id,
        role,
        styleCategoryId: stored.styleCategoryId,
        styleCategoryLabel: stored.styleCategoryLabel || styleCat.label,
        targetAspectRatio: role === 'flyer' ? '4:5' : '16:9',
        targetResolution: stored.targetResolution || (role === 'flyer' ? '1080 × 1350' : '1920 × 1080'),
        promptText: stored.promptText,
        variationSeed: 0,
        copiedStatus: 'idle',
      });
      return;
    }

    const generated = generateCuratorArtworkPrompt(candidate, {
      role,
      styleCategoryId: selectedStyleId,
      draft: activeCandidateDraft,
      mediaItem: mediaByCandidateId.get(candidate.id) || null,
      variationSeed: 0,
    });
    saveStoredCuratorArtworkPrompt({
      candidateId: candidate.id,
      role,
      styleCategoryId: styleCat.id,
      styleCategoryLabel: generated.styleCategoryLabel,
      targetResolution: generated.targetResolution,
      promptText: generated.promptText,
    });
    setPromptModalState({
      candidateId: candidate.id,
      role,
      styleCategoryId: styleCat.id,
      styleCategoryLabel: generated.styleCategoryLabel,
      targetAspectRatio: generated.targetAspectRatio,
      targetResolution: generated.targetResolution,
      promptText: generated.promptText,
      variationSeed: 0,
      copiedStatus: 'idle',
    });
  };

  const handleRegeneratePromptInModal = () => {
    if (!promptModalState || !selectedCandidate) return;
    const nextSeed = promptModalState.variationSeed + 1;
    const selectedStyleId =
      promptModalState.role === 'flyer' ? flyerStyleCategory : heroStyleCategory;
    const styleCat = getCuratorArtworkStyleCategory(selectedStyleId);
    const generated = generateCuratorArtworkPrompt(selectedCandidate, {
      role: promptModalState.role,
      styleCategoryId: selectedStyleId,
      draft: activeCandidateDraft,
      mediaItem: mediaByCandidateId.get(selectedCandidate.id) || null,
      variationSeed: nextSeed,
    });
    saveStoredCuratorArtworkPrompt({
      candidateId: selectedCandidate.id,
      role: promptModalState.role,
      styleCategoryId: styleCat.id,
      styleCategoryLabel: generated.styleCategoryLabel,
      targetResolution: generated.targetResolution,
      promptText: generated.promptText,
    });
    setPromptModalState({
      ...promptModalState,
      styleCategoryId: styleCat.id,
      styleCategoryLabel: generated.styleCategoryLabel,
      targetAspectRatio: generated.targetAspectRatio,
      targetResolution: generated.targetResolution,
      promptText: generated.promptText,
      variationSeed: nextSeed,
      copiedStatus: 'idle',
    });
  };

  const handleUpdatePromptModalText = (nextText: string) => {
    if (!promptModalState) return;
    setPromptModalState({
      ...promptModalState,
      promptText: nextText,
      copiedStatus: 'idle',
    });
    saveStoredCuratorArtworkPrompt({
      candidateId: promptModalState.candidateId,
      role: promptModalState.role,
      styleCategoryId: promptModalState.styleCategoryId,
      styleCategoryLabel: promptModalState.styleCategoryLabel,
      targetResolution: promptModalState.targetResolution,
      promptText: nextText,
    });
  };

  const handleCopyPromptToClipboard = async () => {
    if (!promptModalState) return;
    const textToCopy = promptModalState.promptText;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else if (typeof document !== 'undefined') {
        const tempArea = document.createElement('textarea');
        tempArea.value = textToCopy;
        tempArea.setAttribute('readonly', 'true');
        tempArea.style.position = 'fixed';
        tempArea.style.opacity = '0';
        document.body.appendChild(tempArea);
        tempArea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(tempArea);
        if (!ok) {
          throw new Error('Fallback clipboard copy command returned false.');
        }
      }
      setPromptModalState((prev) => (prev ? { ...prev, copiedStatus: 'copied' } : null));
      addToast({
        message: `Copied ${promptModalState.role === 'flyer' ? 'Flyer (4:5)' : 'Hero (16:9)'} creative prompt to clipboard.`,
        type: 'success',
      });
    } catch {
      setPromptModalState((prev) => (prev ? { ...prev, copiedStatus: 'error' } : null));
      addToast({
        message: 'Could not copy automatically — please select the prompt text and press Ctrl+C / Cmd+C.',
        type: 'error',
      });
    }
  };

  const measureImageDataUrlDimensions = (
    dataUrl: string,
    role: 'flyer' | 'hero',
  ): Promise<{ width: number; height: number }> =>
    new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve(role === 'flyer' ? { width: 1080, height: 1350 } : { width: 1920, height: 1080 });
        return;
      }
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || (role === 'flyer' ? 1080 : 1920),
          height: img.naturalHeight || (role === 'flyer' ? 1350 : 1080),
        });
      };
      img.onerror = () => {
        resolve(role === 'flyer' ? { width: 1080, height: 1350 } : { width: 1920, height: 1080 });
      };
      img.src = dataUrl;
    });

  // Independent Flyer or Hero File Upload / Drag-and-Drop Replacement (validates & opens confirmation preview first)
  const handleIndependentFileUpload = (
    candidate: CuratorCandidateRecord,
    role: 'flyer' | 'hero',
    file: File | undefined,
    previousPreviewUrl?: string | null,
  ) => {
    if (!file) return;
    const validation = validateCuratorArtworkUploadFile(file);
    if (!validation.valid) {
      addToast({
        message: validation.error || 'Unsupported image file.',
        type: 'error',
      });
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      addToast({
        message: `Could not read "${file.name}". Previous ${role} image preserved.`,
        type: 'error',
      });
    };
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        addToast({
          message: `Invalid image data in "${file.name}". Previous ${role} image preserved.`,
          type: 'error',
        });
        return;
      }
      const { width, height } = await measureImageDataUrlDimensions(dataUrl, role);
      const aspectAnalysis = analyzeCuratorArtworkDimensions(role, width, height);
      const currentMedia = mediaByCandidateId.get(candidate.id);
      const fallbackPrevUrl =
        previousPreviewUrl !== undefined
          ? previousPreviewUrl
          : role === 'flyer'
            ? editForm.flyerUrl ||
              candidate.stagedMedia?.flyerPreviewUrl ||
              currentMedia?.previewUrls?.flyer ||
              candidate.flyerUrl ||
              null
            : editForm.customHeaderUrl ||
              candidate.stagedMedia?.heroPreviewUrl ||
              currentMedia?.previewUrls?.hero ||
              null;

      setPendingUploadConfirmation({
        candidate,
        role,
        fileName: file.name || `${role}-replacement.png`,
        fileSize: file.size,
        mimeType: validation.normalizedMimeType || file.type || 'image/png',
        dataUrl,
        width,
        height,
        aspectAnalysis,
        // Never silently force-crop when aspect ratios differ: default to 'contain' when mismatched
        fitMode: aspectAnalysis.aspectMismatch ? 'contain' : 'cover',
        previousPreviewUrl: fallbackPrevUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmPendingArtworkUpload = async () => {
    if (!pendingUploadConfirmation || rerollingRole) return;
    const { candidate, role, fileName, dataUrl, fitMode } = pendingUploadConfirmation;
    try {
      setRerollingRole(role);
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:upload:${candidate.id}:${role}:${Date.now()}`,
        commandType: 'artwork_regenerate',
        targetId: candidate.id,
        payload: {
          targetRole: role,
          replacementDataUrl: dataUrl,
          replacementFitMode: fitMode,
          source: 'editorial_artwork_replacement',
          editorialReroll: true,
          notes: `Uploaded custom ${role} replacement (${fileName}, fit: ${fitMode})`,
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      setPendingUploadConfirmation(null);
      addToast({
        message: `Replaced ${role === 'flyer' ? 'Flyer (4:5)' : 'Hero (16:9)'} with "${fileName}" (${role === 'flyer' ? 'Hero' : 'Flyer'} and version history preserved).`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message:
          err instanceof Error
            ? `Upload failed (${role} preserved): ${err.message}`
            : `Failed to upload ${role} replacement; previous artwork preserved.`,
        type: 'error',
      });
    } finally {
      setRerollingRole(null);
    }
  };

  const handleArtworkRoleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    candidate: CuratorCandidateRecord,
    role: 'flyer' | 'hero',
    currentPreviewUrl: string | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRole(null);
    if (rerollingRole || busyActionKey) return;
    const droppedFile = e.dataTransfer?.files?.[0];
    if (!droppedFile) {
      addToast({
        message: 'Drop a PNG, JPG/JPEG, or WebP image file onto the preview frame.',
        type: 'error',
      });
      return;
    }
    handleIndependentFileUpload(candidate, role, droppedFile, currentPreviewUrl);
  };

  // Independent Flyer or Hero Version Selection / Restore Previous Version
  const handleSelectRoleVersion = async (
    candidate: CuratorCandidateRecord,
    role: 'flyer' | 'hero',
    versionId: string,
  ) => {
    try {
      setRerollingRole(role);
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:select_ver:${candidate.id}:${role}:${versionId}:${Date.now()}`,
        commandType: 'artwork_select_version',
        targetId: candidate.id,
        payload: {
          targetRole: role,
          versionId,
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      addToast({
        message: `Selected version ${versionId} for ${role === 'flyer' ? 'Flyer' : 'Hero'} (${role === 'flyer' ? 'Hero' : 'Flyer'} unchanged).`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : `Could not restore ${role} version.`,
        type: 'error',
      });
    } finally {
      setRerollingRole(null);
    }
  };

  // Choose from Media Library for Flyer or Hero
  const handleChooseFromMediaLibrary = async (
    candidate: CuratorCandidateRecord,
    role: 'flyer' | 'hero',
    selection: {
      sourceMediaId?: string;
      sourceVersionId?: string;
      sourceRole?: 'flyer' | 'hero';
      imageUrl?: string;
      label: string;
    },
  ) => {
    try {
      setRerollingRole(role);
      const res = await sendCuratorCommand({
        idempotencyKey: `curator:library:${candidate.id}:${role}:${Date.now()}`,
        commandType: 'artwork_regenerate',
        targetId: candidate.id,
        payload: {
          targetRole: role,
          librarySourceMediaId: selection.sourceMediaId,
          librarySourceVersionId: selection.sourceVersionId,
          librarySourceRole: selection.sourceRole || role,
          libraryImageUrl: selection.imageUrl,
          editorialReroll: true,
          notes: `Selected ${role} from Media Library: ${selection.label}`,
        },
      });
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      setMediaLibraryModalRole(null);
      addToast({
        message: `Applied "${selection.label}" to ${role === 'flyer' ? 'Flyer' : 'Hero'} (${role === 'flyer' ? 'Hero' : 'Flyer'} preserved unchanged).`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Failed to apply Media Library selection.',
        type: 'error',
      });
    } finally {
      setRerollingRole(null);
    }
  };

  const handleSelectExtractedMedia = async (
    candidate: CuratorCandidateRecord,
    image: CuratorDiscoveredImage,
    index: number,
  ) => {
    const targetUrl = image.highResUrl || image.originalUrl || image.url || '';
    if (!targetUrl) return;
    const actionKey = `select-extracted:${candidate.id}:${index}`;
    try {
      setBusyActionKey(actionKey);
      const res = await selectCandidateExtractedMedia(candidate.id, {
        url: targetUrl,
        highResUrl: image.highResUrl || targetUrl,
        originalUrl: image.originalUrl || targetUrl,
        index,
        classification: image.mediaClassification || image.sourceRole || 'official_event_flyer',
      });
      const existingDraft = getCuratorCandidateDraft(candidate.id);
      if (existingDraft && 'customFlyerUrl' in existingDraft) {
        const { customFlyerUrl: _removedFlyerUrl, ...restDraft } = existingDraft;
        if (Object.keys(restDraft).length === 0) {
          clearCuratorCandidateDraft(candidate.id);
        } else {
          saveCuratorCandidateDraft(candidate.id, restDraft);
        }
        setLocalDraftsMap(loadCuratorCandidateDrafts());
      }
      setEditForm((prev) => ({
        ...prev,
        flyerUrl: targetUrl,
      }));
      if (res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        await loadSnapshot(false);
      }
      addToast({
        message: `Selected extracted image (${(image.mediaClassification || 'official_event_flyer').replace(/_/g, ' ')}) as preferred flyer for "${candidate.title}".`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Failed to select extracted image.',
        type: 'error',
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  const livePublishPreview = useMemo(() => {
    if (!snapshot) return null;
    return gatherPublishableApprovedCandidates(snapshot, listings);
  }, [snapshot, listings]);

  const handleOpenPublishModal = () => {
    if (!snapshot) return;
    const preview = gatherPublishableApprovedCandidates(snapshot, listings);
    setPublishPreview(preview);
    setPublishSummary(null);
    setPublishProgress(null);
    setPublishModalOpen(true);
  };

  const handleExecuteManualPublish = async () => {
    if (!publishPreview || isPublishingBatch) return;
    try {
      setIsPublishingBatch(true);
      setPublishProgress({
        completed: 0,
        total: publishPreview.readyItems.length,
        currentTitle: publishPreview.readyItems[0]?.candidate.title || 'Preparing batch...',
      });
      const summary = await publishApprovedCuratorChanges(publishPreview, listings, {
        batchSize: 3,
        moderationApi: {
          saveEvent: api.saveEvent,
          approveSubmission: api.approveSubmission,
        },
        onProgress: (prog) => setPublishProgress(prog),
      });
      setPublishSummary(summary);
      if (summary.snapshot) {
        setSnapshot(summary.snapshot);
        setPublishPreview(gatherPublishableApprovedCandidates(summary.snapshot, listings));
      } else {
        await loadSnapshot(false);
      }
      await onDataChange();
      addToast({
        message: `Manual publish completed: ${summary.succeeded.length} published, ${summary.failed.length} failed, ${summary.skipped.length} skipped.`,
        type: summary.failed.length > 0 ? 'error' : 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Manual publication batch failed.',
        type: 'error',
      });
    } finally {
      setIsPublishingBatch(false);
      setPublishProgress(null);
    }
  };

  const handleCandidateAuthorizedPublish = async (
    candidate: CuratorCandidateRecord,
    mode: 'stage_submission' | 'approve_and_publish',
  ) => {
    const actionKey = `${mode}:${candidate.id}`;
    try {
      setBusyActionKey(actionKey);
      const result = await approveCandidateViaAuthorizedWorkflow(candidate, listings, {
        mode,
        notes: candidateNotes.trim() || undefined,
        moderationApi: {
          saveEvent: api.saveEvent,
          approveSubmission: api.approveSubmission,
        },
      });
      if (result.commandResponse.snapshot) {
        setSnapshot(result.commandResponse.snapshot);
      } else {
        await loadSnapshot(false);
      }
      await onDataChange();
      setCandidateNotes('');
      addToast({
        message:
          mode === 'approve_and_publish'
            ? `"${candidate.title}" approved & published through SwingSphere moderation (${result.savedListing.id}).`
            : `"${candidate.title}" staged in SwingSphere Submissions Queue (${result.savedListing.id}).`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Candidate approval failed.',
        type: 'error',
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  if (isLoading && !snapshot) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <h2 className="mt-3 text-base font-bold text-slate-900">Opening Editorial Content Curator...</h2>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Loading newly discovered events, generated flyer and hero artwork, and editorial review state.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadSnapshot(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Now
          </button>
        </div>
      </div>
    );
  }

  if (loadError && !snapshot) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-rose-900 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
          <div className="flex-1">
            <h2 className="text-base font-bold">Content Curator Bridge Unavailable</h2>
            <p className="mt-1 text-sm text-rose-800">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadSnapshot(false)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const activeVersion =
    selectedMedia?.versionHistory?.find((v) => v.versionId === inspectingVersionId) ||
    selectedMedia?.versionHistory?.at(-1) ||
    null;

  const displayFlyerUrl = activeVersion?.previewUrls?.flyer || selectedMedia?.previewUrls?.flyer || null;
  const displayHeroUrl = activeVersion?.previewUrls?.hero || selectedMedia?.previewUrls?.hero || null;
  const displayPortraitOrigUrl =
    activeVersion?.previewUrls?.portraitOriginal || selectedMedia?.previewUrls?.portraitOriginal || null;
  const displayLandscapeOrigUrl =
    activeVersion?.previewUrls?.landscapeOriginal || selectedMedia?.previewUrls?.landscapeOriginal || null;

  const nextScheduledJobIso =
    snapshot.agentAndJobs?.cronJobs
      ?.map((j) => j.schedulerOutcome?.nextRunAt)
      .filter((iso): iso is string => Boolean(iso))
      .sort()[0] || null;
  const lastSuccessfulJobIso =
    snapshot.agentAndJobs?.cronJobs
      ?.map((j) => j.schedulerOutcome?.lastRunAt)
      .filter((iso): iso is string => Boolean(iso))
      .sort()
      .at(-1) || snapshot.connection.lastSynchronizedAt;

  const processedEventsCount =
    (snapshot.summary.reviewQueue.approvedCount || 0) +
    (snapshot.summary.reviewQueue.readyToPublishCount || 0) +
    (snapshot.summary.reviewQueue.publishedCount || 0) +
    (snapshot.summary.reviewQueue.deferredCount || 0) +
    (snapshot.summary.reviewQueue.rejectedCount || 0);

  return (
    <div className="space-y-5" data-testid="admin-content-curator">
      {/* Compact Editorial Top Bar & 4-Section Navigation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                <Sparkles className="h-3 w-3 text-rose-400" />
                Content Curator · Editorial Studio
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(
                  snapshot.connection.status,
                )}`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {snapshot.connection.status === 'connected' ? 'Local Bridge Active' : snapshot.connection.status}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                <Lock className="h-3 w-3" />
                Local-Only · Controlled Publishing
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
                SwingSphere Editorial Event Review
              </h1>
              <span className="text-xs text-slate-500">
                Last synced{' '}
                <span className="font-semibold text-slate-700" data-testid="curator-last-sync-time">
                  {formatDateTime(snapshot.connection.lastSynchronizedAt)}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSnapshot(false)}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
              {isSyncing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              data-testid="curator-publish-approved-button"
              onClick={handleOpenPublishModal}
              disabled={isPublishingBatch}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Publish Approved Changes</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-black text-white">
                {livePublishPreview?.counts.readyToPublish ?? 0}
              </span>
            </button>
          </div>
        </div>

        {(snapshot.connection.status === 'offline' || snapshot.connection.status === 'degraded') && (
          <div
            data-testid="curator-offline-banner"
            className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <div className="font-bold">
                  Local OpenClaw Gateway {snapshot.connection.status === 'offline' ? 'Offline' : 'Degraded'} — Displaying Last Synchronized Snapshot
                </div>
                <div className="mt-0.5 text-amber-900">
                  Last synchronized: <strong>{formatDateTime(snapshot.connection.lastSynchronizedAt)}</strong>.{' '}
                  {snapshot.connection.offlineReason ||
                    'Local draft edits remain preserved in your browser until the local bridge reconnects.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadSnapshot(false)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconnect
            </button>
          </div>
        )}

        {/* Simplified 4-Section Primary Navigation */}
        <div
          className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3.5 sm:grid-cols-4"
          role="tablist"
          aria-label="Content Curator Sections"
        >
          <button
            type="button"
            role="tab"
            data-testid="curator-nav-event-review"
            aria-selected={activeSection === 'event-review'}
            onClick={() => handleSelectSection('event-review')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeSection === 'event-review'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <FileCheck2 className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="truncate">Event Review</span>
              </div>
              <div
                className={`mt-0.5 text-[11px] ${
                  activeSection === 'event-review' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Default review queue
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeSection === 'event-review' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {snapshot.summary.reviewQueue.pendingReview}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="curator-nav-community-discovery"
            aria-selected={activeSection === 'community-discovery'}
            onClick={() => handleSelectSection('community-discovery')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeSection === 'community-discovery'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <Users className="h-4 w-4 shrink-0 text-purple-400" />
                <span className="truncate">Community Discovery</span>
              </div>
              <div
                className={`mt-0.5 text-[11px] ${
                  activeSection === 'community-discovery' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Clubs &amp; promoters
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeSection === 'community-discovery'
                  ? 'bg-purple-500 text-white'
                  : 'bg-purple-100 text-purple-800'
              }`}
            >
              {snapshot.summary.communityCandidates?.pendingReview ?? snapshot.communityCandidates?.length ?? 0}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="curator-nav-approved-history"
            aria-selected={activeSection === 'approved-history'}
            onClick={() => handleSelectSection('approved-history')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeSection === 'approved-history'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <History className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="truncate">Approved &amp; History</span>
              </div>
              <div
                className={`mt-0.5 text-[11px] ${
                  activeSection === 'approved-history' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Approved, deferred &amp; studio
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeSection === 'approved-history'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {processedEventsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="curator-nav-settings-monitoring"
            aria-selected={activeSection === 'settings-monitoring'}
            onClick={() => handleSelectSection('settings-monitoring')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeSection === 'settings-monitoring'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <Settings className="h-4 w-4 shrink-0 text-sky-400" />
                <span className="truncate">Settings &amp; Monitoring</span>
              </div>
              <div
                className={`mt-0.5 text-[11px] ${
                  activeSection === 'settings-monitoring' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {snapshot.summary.sources.total} sources · {snapshot.summary.jobs.totalCronJobs} jobs
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeSection === 'settings-monitoring' ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {snapshot.summary.sources.total}
            </span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1: EVENT REVIEW QUEUE (DEFAULT EDITORIAL SCREEN)              */}
      {/* ===================================================================== */}
      {activeSection === 'event-review' && (
        <div className="space-y-4" data-testid="curator-view-review-queue">
          {/* Hidden File Inputs for Independent Flyer & Hero Replacement Uploads */}
          <input
            ref={flyerFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-testid="curator-flyer-file-input"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && selectedCandidate) {
                void handleIndependentFileUpload(selectedCandidate, 'flyer', file);
              }
              e.target.value = '';
            }}
          />
          <input
            ref={heroFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-testid="curator-hero-file-input"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && selectedCandidate) {
                void handleIndependentFileUpload(selectedCandidate, 'hero', file);
              }
              e.target.value = '';
            }}
          />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* LEFT COLUMN: COMPACT EDITORIAL EVENT QUEUE LIST */}
            <div className="space-y-3 xl:col-span-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Event Review Queue
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {filteredCandidates.length > 0 && selectedCandidateQueueIndex >= 0
                        ? `Event ${selectedCandidateQueueIndex + 1} of ${filteredCandidates.length}`
                        : `${filteredCandidates.length} events in queue`}
                    </p>
                  </div>
                  {Object.keys(localDraftsMap).length > 0 && (
                    <span
                      data-testid="curator-draft-count-badge"
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                    >
                      {Object.keys(localDraftsMap).length} draft{Object.keys(localDraftsMap).length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {/* Search Input */}
                <div className="relative mt-2.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    placeholder="Search title, organizer, city..."
                    data-testid="curator-queue-search-input"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Primary Event Significance Filter Pills (Default: Recommended) */}
                <div className="mt-2.5" data-testid="curator-significance-filter-bar">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Event Significance
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: 'recommended', label: `Recommended (${significanceCounts.recommended})` },
                        { id: 'special_event', label: `Special Events (${significanceCounts.special_event})` },
                        { id: 'monthly_signature', label: `Monthly / Periodic (${significanceCounts.monthly_signature})` },
                        { id: 'weekly_signature', label: `Weekly Signature (${significanceCounts.weekly_signature})` },
                        { id: 'routine_club_night', label: `Routine Nights (${significanceCounts.routine_club_night})` },
                        { id: 'needs_human_review', label: `Needs Review (${significanceCounts.needs_human_review})` },
                        { id: 'all', label: `All Candidates (${significanceCounts.all})` },
                      ] as const
                    ).map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        data-testid={`curator-significance-filter-${pill.id}`}
                        onClick={() => setSignificanceFilter(pill.id)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                          significanceFilter === pill.id
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Secondary Status Filter Pills */}
                <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                  {(
                    [
                      { id: 'pending_review', label: `Pending (${snapshot.summary.reviewQueue.pendingReview})` },
                      { id: 'with_artwork', label: 'With Artwork' },
                      { id: 'with_warnings', label: 'Warnings' },
                      { id: 'corrections', label: `Corrections (${snapshot.summary.reviewQueue.proposedCorrections})` },
                      { id: 'all_actionable', label: 'All Actionable' },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      data-testid={`curator-queue-filter-${pill.id}`}
                      onClick={() => setQueueQuickFilter(pill.id)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                        queueQuickFilter === pill.id
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Event Queue Cards (windowed to prevent mounting hundreds of offscreen images) */}
              <div
                className="max-h-[860px] space-y-2 overflow-y-auto pr-1"
                data-testid="curator-queue-candidate-list"
              >
                {filteredCandidates.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                    No discovered events match the current filter.
                  </div>
                ) : (
                  <>
                    {filteredCandidates
                      .slice(
                        0,
                        Math.max(
                          visibleQueueLimit,
                          selectedCandidateQueueIndex >= 0 ? selectedCandidateQueueIndex + 5 : visibleQueueLimit,
                        ),
                      )
                      .map((cand) => {
                        const draft = localDraftsMap[cand.id] || null;
                        const merged = mergeCandidateWithDraft(cand, draft);
                        const isSelected = selectedCandidate?.id === cand.id;
                        const hasDraft = Boolean(draft && Object.keys(draft).length > 0);
                        const val = validateCandidateForEditorialReview(cand, draft);
                        const mediaItem = mediaByCandidateId.get(cand.id);
                        const hasGeneratedPair = Boolean(
                          cand.stagedMedia?.hasGeneratedPair || mediaItem?.hasGeneratedPair,
                        );
                        const thumbUrl =
                          cand.selectedExtractedMedia?.previewUrl ||
                          merged.customFlyerUrl ||
                          cand.stagedMedia?.flyerPreviewUrl ||
                          mediaItem?.previewUrls?.flyer ||
                          cand.flyerUrl;

                        return (
                          <button
                            key={cand.id}
                            type="button"
                            data-testid={`curator-queue-item-${cand.id}`}
                            onClick={() => setSelectedCandidateId(cand.id)}
                            className={`group flex w-full items-start gap-2.5 rounded-2xl border p-2.5 text-left transition ${
                              isSelected
                                ? 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-500/20'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                            }`}
                          >
                            {/* Mini Flyer Thumbnail */}
                            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={merged.title}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center text-[9px] font-bold uppercase text-slate-400">
                                  <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                                  <span>No Img</span>
                                </div>
                              )}
                              {hasGeneratedPair && (
                                <span
                                  title="Generated Flyer + Hero Pair Ready"
                                  className="absolute bottom-0.5 right-0.5 rounded bg-emerald-500 px-1 text-[8px] font-black text-white"
                                >
                                  2×
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <span
                                  data-testid={`curator-queue-item-sig-badge-${cand.id}`}
                                  className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${significanceBadgeClass(
                                    cand.eventSignificance?.category,
                                  )}`}
                                >
                                  {cand.eventSignificance?.categoryLabel ||
                                    SIGNIFICANCE_CATEGORY_META[
                                      (cand.eventSignificance?.category as CuratorSignificanceCategory) ||
                                        'needs_human_review'
                                    ]?.shortLabel ||
                                    'Needs Review'}
                                </span>
                                {cand.eventSignificance?.manualOverride?.overridden && (
                                  <span className="rounded bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold text-purple-800">
                                    Manual
                                  </span>
                                )}
                                <span
                                  className={`rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase ${statusBadgeClass(
                                    cand.reviewState,
                                  )}`}
                                >
                                  {cand.reviewState === 'deferred'
                                    ? 'Saved'
                                    : cand.reviewState.replace(/_/g, ' ')}
                                </span>
                                {hasDraft && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                                    Draft
                                  </span>
                                )}
                                {val.blockingReasons.length > 0 && (
                                  <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800">
                                    {val.blockingReasons.length} req
                                  </span>
                                )}
                                {val.blockingReasons.length === 0 && val.allWarnings.length > 0 && (
                                  <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[9px] font-semibold text-amber-700">
                                    {val.allWarnings.length} warn
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 line-clamp-1 text-xs font-bold text-slate-900">
                                {merged.title}
                              </div>
                              <div className="line-clamp-1 text-[11px] font-medium text-slate-600">
                                {merged.clubName || merged.hostName || merged.venue || 'Unassigned Organizer'}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                                <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="truncate">
                                  {merged.date || 'Date missing'}
                                  {merged.city ? ` · ${merged.city}` : ''}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    {filteredCandidates.length > visibleQueueLimit && (
                      <button
                        type="button"
                        data-testid="curator-queue-load-more-button"
                        onClick={() => setVisibleQueueLimit((prev) => prev + 25)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Show More Events ({Math.min(visibleQueueLimit, filteredCandidates.length)} of{' '}
                        {filteredCandidates.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: EDITORIAL REVIEW WORKSPACE */}
            <div className="space-y-5 xl:col-span-9">
              {selectedCandidate && mergedCandidate ? (
                <>
                  {/* =============================================================== */}
                  {/* 1. EDITORIAL HEADER & PRIMARY REVIEW ACTIONS                     */}
                  {/* =============================================================== */}
                  <div
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
                    data-testid="curator-editorial-event-header"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        {/* Badges & Queue Navigation Row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                            <button
                              type="button"
                              disabled={selectedCandidateQueueIndex <= 0}
                              onClick={() => {
                                if (selectedCandidateQueueIndex > 0) {
                                  setSelectedCandidateId(
                                    filteredCandidates[selectedCandidateQueueIndex - 1].id,
                                  );
                                }
                              }}
                              data-testid="curator-prev-candidate-button"
                              className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-white disabled:opacity-40"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              Prev
                            </button>
                            <span className="px-2 text-[11px] font-semibold text-slate-500">
                              {selectedCandidateQueueIndex >= 0
                                ? `${selectedCandidateQueueIndex + 1} / ${filteredCandidates.length}`
                                : '1 / 1'}
                            </span>
                            <button
                              type="button"
                              disabled={
                                selectedCandidateQueueIndex < 0 ||
                                selectedCandidateQueueIndex >= filteredCandidates.length - 1
                              }
                              onClick={() => {
                                if (
                                  selectedCandidateQueueIndex >= 0 &&
                                  selectedCandidateQueueIndex < filteredCandidates.length - 1
                                ) {
                                  setSelectedCandidateId(
                                    filteredCandidates[selectedCandidateQueueIndex + 1].id,
                                  );
                                }
                              }}
                              data-testid="curator-next-candidate-button"
                              className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-white disabled:opacity-40"
                            >
                              Next
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <span
                            className={`rounded-md border px-2.5 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(
                              selectedCandidate.reviewState,
                            )}`}
                          >
                            {selectedCandidate.reviewState === 'deferred'
                              ? 'Saved for Later'
                              : selectedCandidate.reviewState.replace(/_/g, ' ')}
                          </span>

                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                            {reconciliationLabel(
                              selectedCandidate.reconciliationState,
                              selectedCandidate.candidateType,
                            )}
                          </span>

                          {activeCandidateDraft && (
                            <span
                              data-testid="curator-unsaved-draft-pill"
                              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-900"
                            >
                              <Edit3 className="h-3 w-3" />
                              Local Draft Saved
                            </span>
                          )}
                        </div>

                        {/* Event Title */}
                        <h2
                          className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl"
                          data-testid="curator-candidate-title"
                        >
                          {editForm.title || mergedCandidate.title}
                        </h2>

                        {/* Organizer, Date/Time, Location, Source Link */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                            <Users className="h-3.5 w-3.5 text-rose-600" />
                            {editForm.clubName ||
                              editForm.hostName ||
                              mergedCandidate.clubName ||
                              mergedCandidate.hostName ||
                              'Unassigned Organizer'}
                          </span>

                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-blue-600" />
                            <strong className="text-slate-900">
                              {formatReadableEventDate(editForm.date || mergedCandidate.date)}
                            </strong>
                            {editForm.endDate && editForm.endDate !== editForm.date
                              ? ` → ${editForm.endDate}`
                              : ''}
                            {editForm.startTime
                              ? ` · ${editForm.startTime}${editForm.endTime ? `–${editForm.endTime}` : ''}`
                              : ''}
                            {editForm.timezone ? ` (${editForm.timezone})` : ''}
                          </span>

                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                            {[editForm.venue, editForm.city, editForm.region, editForm.country]
                              .filter(Boolean)
                              .join(', ') ||
                              editForm.address ||
                              'Location pending'}
                          </span>

                          {(() => {
                            const safeHeaderSourceUrl = getSafeExternalHttpUrl(
                              editForm.sourceUrl || mergedCandidate.sourceUrl,
                            );
                            if (safeHeaderSourceUrl) {
                              return (
                                <a
                                  href={safeHeaderSourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid="curator-source-url-link"
                                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/70 px-2 py-0.5 font-bold text-blue-700 transition hover:bg-blue-100 hover:underline"
                                >
                                  Open Source Page <ExternalLink className="h-3 w-3" />
                                </a>
                              );
                            }
                            return (
                              <span
                                data-testid="curator-source-url-link-disabled"
                                title="Enter a valid http:// or https:// Original Event Source URL in the editor below"
                                className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-semibold text-slate-400"
                              >
                                Source URL Unavailable <ExternalLink className="h-3 w-3 opacity-50" />
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Primary Editorial Decision Bar: Approve, Save for Later, Reject, Edit */}
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                        <button
                          type="button"
                          data-testid="curator-approve-event-button"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => void handleEditorialApprove(selectedCandidate)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve Event
                        </button>

                        <button
                          type="button"
                          data-testid="curator-save-for-later-button"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => void handleEditorialSaveForLater(selectedCandidate)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <Bookmark className="h-4 w-4" />
                          Save for Later
                        </button>

                        <button
                          type="button"
                          data-testid="curator-reject-event-button"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => setShowRejectDrawer((prev) => !prev)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                            showRejectDrawer
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          }`}
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>

                        <button
                          type="button"
                          data-testid="curator-toggle-edit-details-button"
                          onClick={() => {
                            setIsEditingCandidate(true);
                            editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit Details
                        </button>
                      </div>
                    </div>

                    {/* Event Significance & Recurrence Classification + Admin Override Bar */}
                    <div
                      data-testid="curator-significance-panel"
                      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              data-testid="curator-significance-badge"
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-[11px] font-black ${significanceBadgeClass(
                                selectedCandidate.eventSignificance?.category,
                              )}`}
                            >
                              {selectedCandidate.eventSignificance?.fullCategoryLabel ||
                                SIGNIFICANCE_CATEGORY_META[
                                  (selectedCandidate.eventSignificance?.category as CuratorSignificanceCategory) ||
                                    'needs_human_review'
                                ]?.fullLabel ||
                                'Needs Human Review'}
                            </span>

                            {selectedCandidate.eventSignificance?.recurrenceFrequency && (
                              <span
                                data-testid="curator-significance-recurrence-badge"
                                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700"
                              >
                                Recurrence: {selectedCandidate.eventSignificance.recurrenceFrequency.replace(/_/g, ' ')}
                                {selectedCandidate.eventSignificance.seriesOccurrenceCount &&
                                selectedCandidate.eventSignificance.seriesOccurrenceCount > 1
                                  ? ` (${selectedCandidate.eventSignificance.seriesOccurrenceCount}×)`
                                  : ''}
                              </span>
                            )}

                            {selectedCandidate.eventSignificance?.confidence && (
                              <span
                                data-testid="curator-significance-confidence-badge"
                                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600"
                              >
                                Confidence: {selectedCandidate.eventSignificance.confidence}
                              </span>
                            )}

                            <span
                              data-testid="curator-significance-play-eligibility-badge"
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                                selectedCandidate.eventSignificance?.playPartyEligible ||
                                selectedCandidate.playPartyEligibility?.qualified
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {selectedCandidate.eventSignificance?.playPartyEligible ||
                              selectedCandidate.playPartyEligibility?.qualified
                                ? 'Play-Party Eligible'
                                : 'Play-Party Check Separate'}
                            </span>

                            {(selectedCandidate.sourceQuality?.classification === 'limited_detail_calendar' ||
                              selectedCandidate.eventSignificance?.sourceQuality?.classification ===
                                'limited_detail_calendar' ||
                              selectedCandidate.playPartyEligibility?.sourceQuality?.classification ===
                                'limited_detail_calendar') && (
                              <span
                                data-testid="curator-limited-detail-source-badge"
                                className="rounded-md border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                              >
                                Limited-Detail Calendar Source
                              </span>
                            )}

                            {(selectedCandidate.registrationMethodLabel ||
                              selectedCandidate.eventSignificance?.registrationMethodLabel ||
                              selectedCandidate.playPartyEligibility?.registrationMethodLabel) && (
                              <span
                                data-testid="curator-registration-method-badge"
                                className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800"
                              >
                                {selectedCandidate.registrationMethodLabel ||
                                  selectedCandidate.eventSignificance?.registrationMethodLabel ||
                                  selectedCandidate.playPartyEligibility?.registrationMethodLabel}
                              </span>
                            )}

                            {selectedCandidate.eventSignificance?.manualOverride?.overridden && (
                              <span
                                data-testid="curator-significance-manual-override-badge"
                                className="rounded-md border border-purple-300 bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-900"
                              >
                                Admin Override Active
                              </span>
                            )}
                          </div>

                          <p
                            data-testid="curator-significance-explanation"
                            className="text-xs font-medium text-slate-700"
                          >
                            {selectedCandidate.eventSignificance?.summaryReason ||
                              'Multi-signal event significance and recurrence evaluation.'}
                          </p>

                          {selectedCandidate.eventSignificance?.missingInformationExplanation && (
                            <div
                              data-testid="curator-missing-info-explanation"
                              className="rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-1.5 text-[11px] font-medium text-amber-900"
                            >
                              {selectedCandidate.eventSignificance.missingInformationExplanation}
                            </div>
                          )}

                          {((selectedCandidate.eventSignificance?.supportingEvidence?.length || 0) > 0 ||
                            (selectedCandidate.eventSignificance?.routineSignals?.length || 0) > 0 ||
                            (selectedCandidate.eventSignificance?.uncertaintyReasons?.length || 0) > 0) && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {(selectedCandidate.eventSignificance?.supportingEvidence || [])
                                .slice(0, 3)
                                .map((sig, idx) => (
                                  <span
                                    key={`sup-${idx}`}
                                    className="rounded border border-emerald-200 bg-emerald-50/70 px-2 py-0.5 text-[10px] font-medium text-emerald-800"
                                  >
                                    + {sig}
                                  </span>
                                ))}
                              {(selectedCandidate.eventSignificance?.routineSignals || [])
                                .slice(0, 2)
                                .map((sig, idx) => (
                                  <span
                                    key={`rout-${idx}`}
                                    className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                                  >
                                    • {sig}
                                  </span>
                                ))}
                              {(selectedCandidate.eventSignificance?.uncertaintyReasons || [])
                                .slice(0, 2)
                                .map((sig, idx) => (
                                  <span
                                    key={`unc-${idx}`}
                                    className="rounded border border-amber-200 bg-amber-50/80 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                                  >
                                    ? {sig}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>

                        {/* Admin Classification Override Controls */}
                        <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0">
                          <select
                            data-testid="curator-significance-override-select"
                            value={overrideCategoryInput}
                            onChange={(e) =>
                              setOverrideCategoryInput(e.target.value as CuratorSignificanceCategory)
                            }
                            aria-label="Override Event Significance Classification"
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-800 focus:border-rose-500 focus:outline-none"
                          >
                            <option value="special_event">Special Event — High Priority</option>
                            <option value="monthly_signature">Monthly / Periodic Signature — Include</option>
                            <option value="weekly_signature">Weekly Signature — Conditional</option>
                            <option value="routine_club_night">Routine Club Night — Low Priority</option>
                            <option value="needs_human_review">Needs Human Review</option>
                          </select>
                          <input
                            type="text"
                            data-testid="curator-significance-override-notes"
                            value={overrideNotesInput}
                            onChange={(e) => setOverrideNotesInput(e.target.value)}
                            placeholder="Optional override note..."
                            className="w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            data-testid="curator-significance-override-apply"
                            disabled={Boolean(busyActionKey)}
                            onClick={() =>
                              void handleOverrideSignificance(
                                selectedCandidate,
                                overrideCategoryInput,
                                overrideNotesInput,
                                false,
                              )
                            }
                            className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                          >
                            Apply Override
                          </button>
                          {selectedCandidate.eventSignificance?.manualOverride?.overridden && (
                            <button
                              type="button"
                              data-testid="curator-significance-override-reset"
                              disabled={Boolean(busyActionKey)}
                              onClick={() =>
                                void handleOverrideSignificance(selectedCandidate, undefined, '', true)
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                            >
                              Reset to Auto
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Optional Rejection Reason Drawer */}
                    {showRejectDrawer && (
                      <div
                        data-testid="curator-reject-drawer"
                        className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3.5"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs font-bold text-rose-900">
                            Reject Candidate &amp; Remove from Active Queue (Audit History Preserved)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_REJECTION_REASONS.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setRejectionReason(preset)}
                                className="rounded-lg border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-800 hover:bg-rose-100"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            data-testid="curator-rejection-reason-input"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Optional rejection reason for audit trail..."
                            className="flex-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            data-testid="curator-confirm-reject-button"
                            disabled={Boolean(busyActionKey)}
                            onClick={() => void handleEditorialReject(selectedCandidate, rejectionReason)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                            Confirm Reject &amp; Next
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRejectDrawer(false)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Validation Warnings & Missing Info Banner */}
                    {candidateValidation &&
                      (candidateValidation.blockingReasons.length > 0 ||
                        candidateValidation.allWarnings.length > 0 ||
                        selectedCandidate.playPartyEligibility?.requiresHumanReview) && (
                        <div
                          data-testid="curator-editorial-warnings"
                          className={`mt-4 rounded-xl border p-3.5 text-xs ${
                            candidateValidation.blockingReasons.length > 0
                              ? 'border-rose-200 bg-rose-50/70 text-rose-950'
                              : 'border-amber-200 bg-amber-50/70 text-amber-950'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-bold">
                              <AlertTriangle
                                className={`h-4 w-4 shrink-0 ${
                                  candidateValidation.blockingReasons.length > 0
                                    ? 'text-rose-600'
                                    : 'text-amber-600'
                                }`}
                              />
                              <span>
                                {candidateValidation.blockingReasons.length > 0
                                  ? `${candidateValidation.blockingReasons.length} Required Field / Eligibility Issue(s) Blocking Approval`
                                  : `${candidateValidation.allWarnings.length} Editorial Validation Notice(s)`}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {selectedCandidate.playPartyEligibility?.requiresHumanReview && (
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900">
                                  <input
                                    type="checkbox"
                                    data-testid="curator-verify-play-party-checkbox"
                                    checked={overrideEligibilityChecked}
                                    onChange={(e) => setOverrideEligibilityChecked(e.target.checked)}
                                    className="rounded border-amber-300 text-emerald-600"
                                  />
                                  <span>Verify Play-Party / Lifestyle Eligibility</span>
                                </label>
                              )}

                              {candidateValidation.allWarnings.length > 0 && (
                                <button
                                  type="button"
                                  data-testid="curator-toggle-validation-warnings"
                                  onClick={() => setValidationNoticesExpanded((prev) => !prev)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300/80 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-amber-900 transition hover:bg-amber-100"
                                >
                                  <span>
                                    {validationNoticesExpanded
                                      ? 'Hide Validation Details'
                                      : `Show ${candidateValidation.allWarnings.length} Notice${
                                          candidateValidation.allWarnings.length === 1 ? '' : 's'
                                        }`}
                                  </span>
                                  {validationNoticesExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {candidateValidation.blockingReasons.length > 0 && (
                            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] font-semibold text-rose-800">
                              {candidateValidation.blockingReasons.map((err, i) => (
                                <li key={`err-${i}`}>{err}</li>
                              ))}
                            </ul>
                          )}
                          {candidateValidation.allWarnings.length > 0 && validationNoticesExpanded && (
                            <ul
                              data-testid="curator-validation-warnings-list"
                              className="mt-2 list-disc space-y-0.5 border-t border-amber-200/70 pt-2 pl-5 text-[11px] text-amber-900"
                            >
                              {candidateValidation.allWarnings.map((warn, i) => (
                                <li key={`warn-${i}`}>
                                  <strong>{warn.category.replace(/_/g, ' ')}:</strong> {warn.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                  </div>

                  {/* =============================================================== */}
                  {/* 2. VISUAL ARTWORK REVIEW (INDEPENDENT FLYER & HERO CONTROLS)   */}
                  {/* =============================================================== */}
                  {(() => {
                    const versionHistory = selectedCandidateMedia?.versionHistory || [];
                    const activeFlyerVersionId =
                      selectedCandidate.stagedMedia?.selectedFlyerVersionId ||
                      selectedCandidateMedia?.selectedFlyerVersionId ||
                      selectedCandidate.stagedMedia?.selectedVersionId ||
                      selectedCandidateMedia?.selectedVersionId ||
                      versionHistory.at(-1)?.versionId ||
                      'v1';
                    const activeHeroVersionId =
                      selectedCandidate.stagedMedia?.selectedHeroVersionId ||
                      selectedCandidateMedia?.selectedHeroVersionId ||
                      selectedCandidate.stagedMedia?.selectedVersionId ||
                      selectedCandidateMedia?.selectedVersionId ||
                      versionHistory.at(-1)?.versionId ||
                      'v1';

                    const flyerVerObj =
                      versionHistory.find((v) => v.versionId === activeFlyerVersionId) ||
                      versionHistory.at(-1) ||
                      null;
                    const heroVerObj =
                      versionHistory.find((v) => v.versionId === activeHeroVersionId) ||
                      versionHistory.at(-1) ||
                      null;

                    const isOfficialOrSelectedStagedFlyer = Boolean(
                      selectedCandidate.selectedExtractedMedia ||
                        selectedCandidate.stagedMedia?.source === 'official_or_existing' ||
                        selectedCandidate.stagedMedia?.status === 'official_artwork_review' ||
                        selectedCandidate.stagedMedia?.flyerPreviewUrl?.includes('role=official_flyer') ||
                        selectedCandidate.stagedMedia?.flyerPreviewUrl?.includes('role=extracted_'),
                    );
                    const hasExplicitDraftFlyerOverride = Boolean(
                      activeCandidateDraft?.customFlyerUrl &&
                        activeCandidateDraft.customFlyerUrl !== selectedCandidate.flyerUrl,
                    );

                    const activeFlyerPreviewUrl = hasExplicitDraftFlyerOverride
                      ? editForm.flyerUrl
                      : isOfficialOrSelectedStagedFlyer
                        ? selectedCandidate.selectedExtractedMedia?.previewUrl ||
                          selectedCandidate.stagedMedia?.flyerPreviewUrl ||
                          editForm.flyerUrl ||
                          selectedCandidate.flyerUrl ||
                          null
                        : editForm.flyerUrl ||
                          flyerVerObj?.previewUrls?.flyer ||
                          selectedCandidate.stagedMedia?.flyerPreviewUrl ||
                          selectedCandidateMedia?.previewUrls?.flyer ||
                          selectedCandidate.flyerUrl ||
                          null;

                    const activeHeroPreviewUrl =
                      editForm.customHeaderUrl ||
                      heroVerObj?.previewUrls?.hero ||
                      selectedCandidate.stagedMedia?.heroPreviewUrl ||
                      selectedCandidateMedia?.previewUrls?.hero ||
                      null;

                    const activeFlyerIdx = versionHistory.findIndex(
                      (v) => v.versionId === activeFlyerVersionId,
                    );
                    const priorFlyerCandidates =
                      activeFlyerIdx > 0
                        ? versionHistory.slice(0, activeFlyerIdx).reverse()
                        : [...versionHistory].reverse();
                    const previousFlyerVersion =
                      priorFlyerCandidates.find(
                        (v) =>
                          v.versionId !== activeFlyerVersionId &&
                          (!v.targetRole || v.targetRole === 'flyer' || v.targetRole === 'both') &&
                          Boolean(v.previewUrls?.flyer || v.flyerPath),
                      ) ||
                      priorFlyerCandidates.find(
                        (v) =>
                          v.versionId !== activeFlyerVersionId &&
                          Boolean(v.previewUrls?.flyer || v.flyerPath),
                      ) ||
                      null;

                    const activeHeroIdx = versionHistory.findIndex(
                      (v) => v.versionId === activeHeroVersionId,
                    );
                    const priorHeroCandidates =
                      activeHeroIdx > 0
                        ? versionHistory.slice(0, activeHeroIdx).reverse()
                        : [...versionHistory].reverse();
                    const previousHeroVersion =
                      priorHeroCandidates.find(
                        (v) =>
                          v.versionId !== activeHeroVersionId &&
                          (!v.targetRole || v.targetRole === 'hero' || v.targetRole === 'both') &&
                          Boolean(v.previewUrls?.hero || v.heroPath),
                      ) ||
                      priorHeroCandidates.find(
                        (v) =>
                          v.versionId !== activeHeroVersionId &&
                          Boolean(v.previewUrls?.hero || v.heroPath),
                      ) ||
                      null;

                    const flyerProvenance = resolveArtworkRoleProvenance(
                      selectedCandidate,
                      selectedCandidateMedia,
                      'flyer',
                    );
                    const heroProvenance = resolveArtworkRoleProvenance(
                      selectedCandidate,
                      selectedCandidateMedia,
                      'hero',
                    );
                    const flyerPromoSchema = buildCuratorPromotionalContentSchema(selectedCandidate, {
                      draft: editForm,
                      mediaItem: selectedCandidateMedia,
                      styleCategoryId: flyerStyleCategory,
                    });
                    const heroPromoSchema = buildCuratorPromotionalContentSchema(selectedCandidate, {
                      draft: editForm,
                      mediaItem: selectedCandidateMedia,
                      styleCategoryId: heroStyleCategory,
                    });
                    const anyTemplateFallback =
                      flyerProvenance.mode === 'procedural_template_fallback' ||
                      heroProvenance.mode === 'procedural_template_fallback';

                    return (
                      <div
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
                        data-testid="curator-visual-artwork-review"
                      >
                        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Sparkles className="h-4 w-4 text-purple-600" />
                              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                                Visual Artwork Review — Flyer &amp; Hero Image
                              </h3>
                              {(selectedCandidate.mediaExtractionStatus ||
                                selectedCandidate.mediaExtraction?.status ||
                                selectedCandidate.extractedMedia?.status) && (
                                <span
                                  data-testid="curator-media-extraction-status"
                                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    (selectedCandidate.mediaExtractionStatus ||
                                      selectedCandidate.mediaExtraction?.status) === 'Official Flyer Found'
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                      : (selectedCandidate.mediaExtractionStatus ||
                                            selectedCandidate.mediaExtraction?.status) ===
                                          'Additional Images Found'
                                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                                        : 'border-amber-300 bg-amber-50 text-amber-900'
                                  }`}
                                >
                                  {selectedCandidate.mediaExtractionStatus ||
                                    selectedCandidate.mediaExtraction?.status ||
                                    selectedCandidate.extractedMedia?.status}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Generate a detailed creative prompt for external AI generation, drag-and-drop custom
                              artwork onto either preview frame, or reroll independent flyer and hero variations.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {versionHistory.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  data-testid="curator-compare-flyer-variations-button"
                                  onClick={() => setCompareModalRole('flyer')}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-800 hover:bg-purple-100"
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                  Compare Flyer ({versionHistory.length})
                                </button>
                                <button
                                  type="button"
                                  data-testid="curator-compare-hero-variations-button"
                                  onClick={() => setCompareModalRole('hero')}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100"
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                  Compare Hero ({versionHistory.length})
                                </button>
                              </>
                            )}
                            {selectedCandidateMedia?.officialSourceArtworkUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxImage({
                                    url: selectedCandidateMedia.officialSourceArtworkUrl!,
                                    title: `${mergedCandidate.title} — Official Source Graphic`,
                                    subtitle: 'Original promoter/club source image discovered on calendar',
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Official Source Image
                              </button>
                            )}
                          </div>
                        </div>

                        {anyTemplateFallback && (
                          <div
                            data-testid="curator-template-fallback-notice"
                            className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                              <div>
                                <span className="font-bold">Template Fallback Active (No AI Base Image Staged): </span>
                                <span className="text-amber-900">
                                  One or both roles are currently rendered from the local SVG poster template rather
                                  than an AI image model. Click <strong>Generate Prompt</strong> below to export a
                                  tailored creative brief, generate the artwork externally, and drag the image directly
                                  onto the preview frame.
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Side-by-Side Independent Artwork Cards with Generous Breathing Room */}
                        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
                          {/* LEFT CARD: VERTICAL EVENT FLYER (4:5 · 1080 × 1350) */}
                          <div
                            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-md lg:col-span-5"
                            data-testid="curator-flyer-card"
                          >
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <span className="text-xs font-black uppercase tracking-wider text-white">
                                    Event Flyer (4:5 Poster)
                                  </span>
                                  <div className="text-[11px] text-slate-400">
                                    1080 × 1350 · Drop PNG, JPG, or WebP onto frame
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    data-testid="curator-flyer-provenance-badge"
                                    title={flyerProvenance.description}
                                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                      flyerProvenance.mode === 'ai_model_stage_a'
                                        ? 'border-purple-400/50 bg-purple-500/20 text-purple-200'
                                        : flyerProvenance.mode === 'custom_upload'
                                          ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                                          : 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                                    }`}
                                  >
                                    {flyerProvenance.shortLabel}
                                  </span>
                                  <span
                                    data-testid="curator-flyer-version-badge"
                                    className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300"
                                  >
                                    {activeFlyerVersionId}
                                  </span>
                                </div>
                              </div>

                              {/* Vertical 4:5 Flyer Frame + Drag-and-Drop Dropzone */}
                              <div
                                data-testid="curator-flyer-dropzone"
                                onDragEnter={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDragOverRole('flyer');
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'copy';
                                  if (dragOverRole !== 'flyer') setDragOverRole('flyer');
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (e.currentTarget === e.target) setDragOverRole(null);
                                }}
                                onDrop={(e) => void handleArtworkRoleDrop(e, selectedCandidate, 'flyer')}
                                className={`group relative mx-auto mt-4 aspect-[4/5] w-full max-w-[350px] overflow-hidden rounded-xl border-2 transition ${
                                  dragOverRole === 'flyer'
                                    ? 'border-dashed border-purple-400 bg-purple-950/40 ring-4 ring-purple-500/30'
                                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                                } shadow-inner`}
                              >
                                {activeFlyerPreviewUrl ? (
                                  <img
                                    src={activeFlyerPreviewUrl}
                                    alt={`${mergedCandidate.title} vertical event flyer`}
                                    data-testid="curator-flyer-image"
                                    loading="eager"
                                    fetchPriority="high"
                                    decoding="async"
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                                    <ImageIcon className="h-8 w-8 text-slate-600" />
                                    <div className="text-xs font-bold text-slate-300">
                                      No Vertical Flyer Generated Yet
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      Drag &amp; drop a 4:5 poster image here, generate a prompt, or reroll below.
                                    </p>
                                  </div>
                                )}

                                {dragOverRole === 'flyer' && (
                                  <div
                                    data-testid="curator-flyer-drag-overlay"
                                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-purple-950/85 p-4 text-center backdrop-blur-xs"
                                  >
                                    <Upload className="h-8 w-8 text-purple-300" />
                                    <span className="mt-2 text-xs font-black uppercase tracking-wider text-white">
                                      Drop Image to Preview Flyer Replacement
                                    </span>
                                    <span className="mt-1 text-[11px] text-purple-200">
                                      PNG, JPG, or WebP · Target 4:5 (1080 × 1350) · Confirmation required before upload
                                    </span>
                                  </div>
                                )}

                                {rerollingRole === 'flyer' && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 p-4 text-center backdrop-blur-xs">
                                    <RefreshCw className="h-6 w-6 animate-spin text-purple-400" />
                                    <span className="mt-2 text-xs font-bold text-white">
                                      Updating Flyer Artwork...
                                    </span>
                                    <span className="mt-0.5 text-[10px] text-slate-300">
                                      Previous flyer preserved until complete
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Independent Flyer Controls */}
                            <div className="mt-4 space-y-3 border-t border-slate-800 pt-3.5">
                              {/* Artistic Style Selector for Flyer */}
                              <div>
                                <label className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  <span className="inline-flex items-center gap-1">
                                    <Palette className="h-3 w-3 text-purple-400" />
                                    Flyer Artistic Style
                                  </span>
                                  <span className="text-purple-300">
                                    {getCuratorArtworkStyleCategory(flyerStyleCategory).label}
                                  </span>
                                </label>
                                <select
                                  aria-label="Select Flyer Artistic Style"
                                  data-testid="curator-flyer-style-select"
                                  value={flyerStyleCategory}
                                  onChange={(e) => setFlyerStyleCategory(e.target.value)}
                                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white focus:border-purple-500 focus:outline-none"
                                >
                                  {CURATOR_ARTWORK_STYLE_CATEGORIES.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.label} — {cat.visualLanguage}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Compact Promotional Flyer Content Preview */}
                              <div
                                data-testid="curator-flyer-content-summary"
                                className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                                  <span>Flyer Content ({flyerPromoSchema.flyerIncludedFields.length} fields)</span>
                                  <span className="font-mono text-[9px] text-slate-400">
                                    {flyerPromoSchema.flyerLayoutPattern.label} · Logo: {flyerPromoSchema.logoPlacement}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {flyerPromoSchema.flyerIncludedFields.map((item) => (
                                    <span
                                      key={`flyer-inc-${item.key}`}
                                      title={`${item.label}: ${item.value}`}
                                      className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-slate-700/80 bg-slate-950/90 px-1.5 py-0.5 text-[10px] text-slate-200"
                                    >
                                      <strong className="text-purple-300">{item.label.split(' (')[0]}:</strong>
                                      <span className="truncate">{item.value}</span>
                                    </span>
                                  ))}
                                </div>
                                {flyerPromoSchema.missingRequiredFields.length > 0 && (
                                  <div className="mt-1 text-[10px] font-semibold text-amber-300">
                                    Omitted (missing in source): {flyerPromoSchema.missingRequiredFields.join(', ')}
                                  </div>
                                )}
                              </div>

                              {/* Primary Flyer Action Buttons */}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  data-testid="curator-flyer-generate-prompt-button"
                                  onClick={() => handleOpenPromptModal(selectedCandidate, 'flyer')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-purple-500/60 bg-purple-950/60 px-3 py-2 text-xs font-bold text-purple-200 shadow-xs transition hover:bg-purple-900/70"
                                >
                                  <FileText className="h-3.5 w-3.5 text-purple-300" />
                                  Generate Prompt
                                </button>

                                <button
                                  type="button"
                                  data-testid="curator-flyer-reroll-button"
                                  disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                                  onClick={() => void handleIndependentArtworkReroll(selectedCandidate, 'flyer')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-purple-500 disabled:opacity-50"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${rerollingRole === 'flyer' ? 'animate-spin' : ''}`}
                                  />
                                  Regenerate / Reroll
                                </button>

                                <button
                                  type="button"
                                  data-testid="curator-flyer-upload-button"
                                  disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                                  onClick={() => flyerFileInputRef.current?.click()}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  Upload / Drop File
                                </button>

                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    data-testid="curator-flyer-library-button"
                                    disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                                    onClick={() => {
                                      setMediaLibrarySearch('');
                                      setMediaLibraryModalRole('flyer');
                                    }}
                                    title="Choose from Local Media Library"
                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    <FolderOpen className="h-3.5 w-3.5" />
                                    Library
                                  </button>

                                  <button
                                    type="button"
                                    data-testid="curator-flyer-fullsize-button"
                                    disabled={!activeFlyerPreviewUrl}
                                    onClick={() => {
                                      if (activeFlyerPreviewUrl) {
                                        setLightboxImage({
                                          url: activeFlyerPreviewUrl,
                                          title: `${mergedCandidate.title} — Vertical Event Flyer (1080×1350)`,
                                          subtitle: `Active Flyer Version: ${activeFlyerVersionId} · ${flyerProvenance.label} · Style: ${
                                            getCuratorArtworkStyleCategory(flyerStyleCategory).label
                                          }`,
                                        });
                                      }
                                    }}
                                    title="View Full Size"
                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    Zoom
                                  </button>
                                </div>
                              </div>

                              {/* Restore Previous Flyer Version + Variation Strip */}
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <button
                                  type="button"
                                  data-testid="curator-flyer-restore-button"
                                  disabled={!previousFlyerVersion || Boolean(rerollingRole)}
                                  onClick={() => {
                                    if (previousFlyerVersion) {
                                      void handleSelectRoleVersion(
                                        selectedCandidate,
                                        'flyer',
                                        previousFlyerVersion.versionId,
                                      );
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Restore Previous ({previousFlyerVersion?.versionId || 'None'})
                                </button>

                                <span className="text-[10px] text-slate-400">
                                  {versionHistory.length || 1} variation{versionHistory.length === 1 ? '' : 's'}
                                </span>
                              </div>

                              {versionHistory.length > 1 && (
                                <div
                                  data-testid="curator-flyer-variations"
                                  className="flex items-center gap-2 overflow-x-auto pb-1 pt-1"
                                >
                                  {versionHistory.map((ver) => {
                                    const isSelectedVer = activeFlyerVersionId === ver.versionId;
                                    return (
                                      <button
                                        key={`flyer-ver-${ver.versionId}`}
                                        type="button"
                                        data-testid={`curator-flyer-version-${ver.versionId}`}
                                        onClick={() =>
                                          void handleSelectRoleVersion(selectedCandidate, 'flyer', ver.versionId)
                                        }
                                        className={`group relative flex shrink-0 items-center gap-1.5 rounded-lg border p-1 pr-2 text-left transition ${
                                          isSelectedVer
                                            ? 'border-emerald-400 bg-emerald-950/60 text-white'
                                            : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700'
                                        }`}
                                      >
                                        {ver.previewUrls?.flyer && (
                                          <img
                                            src={ver.previewUrls.flyer}
                                            alt={ver.versionId}
                                            className="h-9 w-7 rounded object-cover"
                                          />
                                        )}
                                        <div>
                                          <div className="font-mono text-[10px] font-bold">{ver.versionId}</div>
                                          <div className="max-w-[72px] truncate text-[9px] text-slate-400">
                                            {ver.styleCategoryLabel || ver.styleFamily || 'Standard'}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* RIGHT CARD: HORIZONTAL HERO IMAGE (16:9 · 1920 × 1080) */}
                          <div
                            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-md lg:col-span-7"
                            data-testid="curator-hero-card"
                          >
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <span className="text-xs font-black uppercase tracking-wider text-white">
                                    Hero Banner (16:9 Landscape)
                                  </span>
                                  <div className="text-[11px] text-slate-400">
                                    1920 × 1080 · Drop PNG, JPG, or WebP onto frame
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    data-testid="curator-hero-provenance-badge"
                                    title={heroProvenance.description}
                                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                      heroProvenance.mode === 'ai_model_stage_a'
                                        ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                                        : heroProvenance.mode === 'custom_upload'
                                          ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                                          : 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                                    }`}
                                  >
                                    {heroProvenance.shortLabel}
                                  </span>
                                  <span
                                    data-testid="curator-hero-version-badge"
                                    className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300"
                                  >
                                    {activeHeroVersionId}
                                  </span>
                                </div>
                              </div>

                              {/* Horizontal 16:9 Hero Frame + Drag-and-Drop Dropzone */}
                              <div
                                data-testid="curator-hero-dropzone"
                                onDragEnter={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDragOverRole('hero');
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'copy';
                                  if (dragOverRole !== 'hero') setDragOverRole('hero');
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (e.currentTarget === e.target) setDragOverRole(null);
                                }}
                                onDrop={(e) => void handleArtworkRoleDrop(e, selectedCandidate, 'hero')}
                                className={`group relative mt-4 aspect-video w-full overflow-hidden rounded-xl border-2 transition ${
                                  dragOverRole === 'hero'
                                    ? 'border-dashed border-sky-400 bg-sky-950/40 ring-4 ring-sky-500/30'
                                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                                } shadow-inner`}
                              >
                                {activeHeroPreviewUrl ? (
                                  <img
                                    src={activeHeroPreviewUrl}
                                    alt={`${mergedCandidate.title} horizontal hero image`}
                                    data-testid="curator-hero-image"
                                    loading="eager"
                                    fetchPriority="high"
                                    decoding="async"
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                                    <ImageIcon className="h-8 w-8 text-slate-600" />
                                    <div className="text-xs font-bold text-slate-300">
                                      No Horizontal Hero Image Generated Yet
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      Drag &amp; drop a 16:9 hero banner here, generate a prompt, or reroll below.
                                    </p>
                                  </div>
                                )}

                                {dragOverRole === 'hero' && (
                                  <div
                                    data-testid="curator-hero-drag-overlay"
                                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-sky-950/85 p-4 text-center backdrop-blur-xs"
                                  >
                                    <Upload className="h-8 w-8 text-sky-300" />
                                    <span className="mt-2 text-xs font-black uppercase tracking-wider text-white">
                                      Drop Image to Preview Hero Replacement
                                    </span>
                                    <span className="mt-1 text-[11px] text-sky-200">
                                      PNG, JPG, or WebP · Target 16:9 (1920 × 1080) · Confirmation required before upload
                                    </span>
                                  </div>
                                )}

                                {rerollingRole === 'hero' && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 p-4 text-center backdrop-blur-xs">
                                    <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                                    <span className="mt-2 text-xs font-bold text-white">
                                      Updating Hero Artwork...
                                    </span>
                                    <span className="mt-0.5 text-[10px] text-slate-300">
                                      Previous hero preserved until complete
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Independent Hero Controls */}
                            <div className="mt-4 space-y-3 border-t border-slate-800 pt-3.5">
                              {/* Artistic Style Selector for Hero */}
                              <div>
                                <label className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  <span className="inline-flex items-center gap-1">
                                    <Palette className="h-3 w-3 text-sky-400" />
                                    Hero Artistic Style
                                  </span>
                                  <span className="text-sky-300">
                                    {getCuratorArtworkStyleCategory(heroStyleCategory).label}
                                  </span>
                                </label>
                                <select
                                  aria-label="Select Hero Artistic Style"
                                  data-testid="curator-hero-style-select"
                                  value={heroStyleCategory}
                                  onChange={(e) => setHeroStyleCategory(e.target.value)}
                                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white focus:border-sky-500 focus:outline-none"
                                >
                                  {CURATOR_ARTWORK_STYLE_CATEGORIES.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.label} — {cat.visualLanguage}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Compact Promotional Hero Content Preview */}
                              <div
                                data-testid="curator-hero-content-summary"
                                className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                                  <span>Hero Content ({heroPromoSchema.heroIncludedFields.length} fields · Lighter 16:9 Density)</span>
                                  <span className="font-mono text-[9px] text-slate-400">
                                    {heroPromoSchema.heroLayoutPattern.label} · Logo: {heroPromoSchema.heroLogoPlacement}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {heroPromoSchema.heroIncludedFields.map((item) => (
                                    <span
                                      key={`hero-inc-${item.key}`}
                                      title={`${item.label}: ${item.value}`}
                                      className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-slate-700/80 bg-slate-950/90 px-1.5 py-0.5 text-[10px] text-slate-200"
                                    >
                                      <strong className="text-sky-300">{item.label.split(' (')[0]}:</strong>
                                      <span className="truncate">{item.value}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Primary Hero Action Buttons */}
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                <button
                                  type="button"
                                  data-testid="curator-hero-generate-prompt-button"
                                  onClick={() => handleOpenPromptModal(selectedCandidate, 'hero')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/60 bg-sky-950/60 px-3 py-2 text-xs font-bold text-sky-200 shadow-xs transition hover:bg-sky-900/70"
                                >
                                  <FileText className="h-3.5 w-3.5 text-sky-300" />
                                  Generate Prompt
                                </button>

                                <button
                                  type="button"
                                  data-testid="curator-hero-reroll-button"
                                  disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                                  onClick={() => void handleIndependentArtworkReroll(selectedCandidate, 'hero')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-sky-500 disabled:opacity-50"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${rerollingRole === 'hero' ? 'animate-spin' : ''}`}
                                  />
                                  Regenerate / Reroll
                                </button>

                                <button
                                  type="button"
                                  data-testid="curator-hero-upload-button"
                                  disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                                  onClick={() => heroFileInputRef.current?.click()}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  Upload / Drop
                                </button>

                                <button
                                  type="button"
                                  data-testid="curator-hero-library-button"
                                  disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                                  onClick={() => {
                                    setMediaLibrarySearch('');
                                    setMediaLibraryModalRole('hero');
                                  }}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                  Choose Library
                                </button>

                                <button
                                  type="button"
                                  data-testid="curator-hero-fullsize-button"
                                  disabled={!activeHeroPreviewUrl}
                                  onClick={() => {
                                    if (activeHeroPreviewUrl) {
                                      setLightboxImage({
                                        url: activeHeroPreviewUrl,
                                        title: `${mergedCandidate.title} — Horizontal Hero Image (1920×1080)`,
                                        subtitle: `Active Hero Version: ${activeHeroVersionId} · ${heroProvenance.label} · Style: ${
                                          getCuratorArtworkStyleCategory(heroStyleCategory).label
                                        }`,
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View Full Size
                                </button>
                              </div>

                              {/* Restore Previous Hero Version + Variation Strip */}
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <button
                                  type="button"
                                  data-testid="curator-hero-restore-button"
                                  disabled={!previousHeroVersion || Boolean(rerollingRole)}
                                  onClick={() => {
                                    if (previousHeroVersion) {
                                      void handleSelectRoleVersion(
                                        selectedCandidate,
                                        'hero',
                                        previousHeroVersion.versionId,
                                      );
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Restore Previous ({previousHeroVersion?.versionId || 'None'})
                                </button>

                                <span className="text-[10px] text-slate-400">
                                  {versionHistory.length || 1} variation{versionHistory.length === 1 ? '' : 's'}
                                </span>
                              </div>

                              {versionHistory.length > 1 && (
                                <div
                                  data-testid="curator-hero-variations"
                                  className="flex items-center gap-2 overflow-x-auto pb-1 pt-1"
                                >
                                  {versionHistory.map((ver) => {
                                    const isSelectedVer = activeHeroVersionId === ver.versionId;
                                    return (
                                      <button
                                        key={`hero-ver-${ver.versionId}`}
                                        type="button"
                                        data-testid={`curator-hero-version-${ver.versionId}`}
                                        onClick={() =>
                                          void handleSelectRoleVersion(selectedCandidate, 'hero', ver.versionId)
                                        }
                                        className={`group relative flex shrink-0 items-center gap-1.5 rounded-lg border p-1 pr-2 text-left transition ${
                                          isSelectedVer
                                            ? 'border-sky-400 bg-sky-950/60 text-white'
                                            : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700'
                                        }`}
                                      >
                                        {ver.previewUrls?.hero && (
                                          <img
                                            src={ver.previewUrls.hero}
                                            alt={ver.versionId}
                                            className="h-8 w-14 rounded object-cover"
                                          />
                                        )}
                                        <div>
                                          <div className="font-mono text-[10px] font-bold">{ver.versionId}</div>
                                          <div className="max-w-[84px] truncate text-[9px] text-slate-400">
                                            {ver.styleCategoryLabel || ver.styleFamily || 'Standard'}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const officialItem =
                            selectedCandidate.extractedMedia?.officialFlyer ||
                            selectedCandidate.mediaExtraction?.officialFlyer ||
                            null;
                          const additionalItems =
                            selectedCandidate.stagedMedia?.additionalExtractedImages ||
                            selectedCandidate.extractedMedia?.additionalMedia ||
                            selectedCandidate.mediaExtraction?.additionalMedia ||
                            [];
                          const rawDiscovered = selectedCandidate.discoveredImages || [];
                          const galleryMap = new Map<string, CuratorDiscoveredImage>();
                          if (officialItem) {
                            const key =
                              officialItem.highResUrl ||
                              officialItem.originalUrl ||
                              officialItem.url;
                            if (key) {
                              galleryMap.set(key, {
                                ...officialItem,
                                previewUrl:
                                  officialItem.previewUrl ||
                                  selectedCandidate.stagedMedia?.officialFlyerPreviewUrl ||
                                  officialItem.highResUrl ||
                                  officialItem.url,
                              });
                            }
                          }
                          for (const img of additionalItems) {
                            const key = img.highResUrl || img.originalUrl || img.url;
                            if (key && !galleryMap.has(key)) {
                              galleryMap.set(key, img);
                            }
                          }
                          for (const img of rawDiscovered) {
                            const key = img.highResUrl || img.originalUrl || img.url;
                            if (key && !galleryMap.has(key)) {
                              galleryMap.set(key, img);
                            }
                          }
                          const extractedList = Array.from(galleryMap.values());
                          if (extractedList.length === 0) return null;

                          const currentPreferredUrl =
                            selectedCandidate.selectedExtractedMedia?.url ||
                            selectedCandidate.customFlyerUrl ||
                            selectedCandidate.flyerUrl ||
                            '';

                          return (
                            <div
                              data-testid="curator-extracted-media-gallery"
                              className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                                    Extracted Source Media ({extractedList.length})
                                  </h4>
                                  <p className="text-[11px] text-slate-600">
                                    Official organizer flyers and additional event images discovered from{' '}
                                    <span className="font-semibold">
                                      {selectedCandidate.platform === 'modern_lifestyle'
                                        ? 'Modern Lifestyle'
                                        : 'the event source page'}
                                    </span>
                                    . Select any image as the preferred flyer without AI generation.
                                  </p>
                                </div>
                                {selectedCandidate.selectedExtractedMedia?.url && (
                                  <span
                                    data-testid="curator-selected-extracted-badge"
                                    className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900"
                                  >
                                    Preferred Selection Saved ({selectedCandidate.selectedExtractedMedia.classification.replace(/_/g, ' ')})
                                  </span>
                                )}
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {extractedList.map((img, idx) => {
                                  const targetUrl = img.highResUrl || img.originalUrl || img.url || '';
                                  const displayUrl =
                                    img.previewUrl || img.highResUrl || img.originalUrl || img.url || '';
                                  const isPreferred =
                                    Boolean(targetUrl) && targetUrl === currentPreferredUrl;
                                  const classification =
                                    img.mediaClassification || img.sourceRole || 'event_image';
                                  const dimText =
                                    img.dimensions ||
                                    (img.width && img.height ? `${img.width}×${img.height}` : null);
                                  const isSelecting =
                                    busyActionKey === `select-extracted:${selectedCandidate.id}:${idx}`;

                                  return (
                                    <div
                                      key={`extracted-${idx}-${targetUrl}`}
                                      data-testid={`curator-extracted-media-card-${idx}`}
                                      className={`flex flex-col justify-between rounded-xl border p-2.5 transition ${
                                        isPreferred
                                          ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                                          : 'border-slate-200 bg-white hover:border-slate-300'
                                      }`}
                                    >
                                      <div>
                                        <div className="relative h-36 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                                          <img
                                            src={displayUrl}
                                            alt={img.alt || `${mergedCandidate.title} extracted ${idx + 1}`}
                                            loading="lazy"
                                            decoding="async"
                                            onClick={() =>
                                              setLightboxImage({
                                                url: displayUrl,
                                                title: `${mergedCandidate.title} — ${classification.replace(/_/g, ' ')}`,
                                                subtitle: targetUrl,
                                              })
                                            }
                                            className="h-full w-full cursor-pointer object-contain"
                                          />
                                          <span className="absolute left-1.5 top-1.5 rounded bg-slate-950/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                            {classification.replace(/_/g, ' ')}
                                          </span>
                                          {dimText && (
                                            <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-slate-200">
                                              {dimText}
                                            </span>
                                          )}
                                        </div>

                                        <div className="mt-2 space-y-0.5 text-[10px] text-slate-600">
                                          <div className="truncate font-mono text-[9px] text-slate-500" title={targetUrl}>
                                            {targetUrl}
                                          </div>
                                          {img.extractionMethod && (
                                            <div>
                                              Method: <strong className="text-slate-800">{img.extractionMethod}</strong>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="mt-2.5 flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={isPreferred || Boolean(busyActionKey)}
                                          data-testid={`curator-select-extracted-image-${idx}`}
                                          onClick={() =>
                                            void handleSelectExtractedMedia(selectedCandidate, img, idx)
                                          }
                                          className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                                            isPreferred
                                              ? 'cursor-default border border-emerald-300 bg-emerald-600 text-white'
                                              : 'border border-slate-300 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50'
                                          }`}
                                        >
                                          {isSelecting
                                            ? 'Selecting...'
                                            : isPreferred
                                              ? 'Preferred Flyer (Active)'
                                              : 'Use as Preferred Flyer'}
                                        </button>
                                        {getSafeExternalHttpUrl(targetUrl) && (
                                          <a
                                            href={getSafeExternalHttpUrl(targetUrl)!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Open original source image URL"
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                                          >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* =============================================================== */}
                  {/* 3. INLINE EVENT DETAILS EDITOR (LOCAL DRAFT PRESERVATION)       */}
                  {/* =============================================================== */}
                  <div
                    ref={editorSectionRef}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
                    data-testid="curator-event-details-editor"
                  >
                    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Edit3 className="h-4 w-4 text-blue-600" />
                          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                            Event Details Editor
                          </h3>
                          {activeCandidateDraft && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                              Draft Auto-Saved Locally
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Inline edits are preserved automatically in your local browser draft across refreshes and
                          never trigger automatic artwork regeneration.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {activeCandidateDraft && (
                          <button
                            type="button"
                            data-testid="curator-revert-draft-button"
                            onClick={() => {
                              clearCuratorCandidateDraft(selectedCandidate.id);
                              setLocalDraftsMap((prev) => {
                                const next = { ...prev };
                                delete next[selectedCandidate.id];
                                return next;
                              });
                              setEditForm({
                                title: selectedCandidate.title || '',
                                date: selectedCandidate.date || '',
                                endDate: selectedCandidate.endDate || '',
                                startTime: selectedCandidate.startTime || '',
                                endTime: selectedCandidate.endTime || '',
                                timezone: selectedCandidate.timezone || 'America/New_York',
                                venue: selectedCandidate.venue || '',
                                address: selectedCandidate.address || '',
                                city: selectedCandidate.city || '',
                                region: selectedCandidate.region || '',
                                country: selectedCandidate.country || 'USA',
                                clubId: selectedCandidate.clubId || '',
                                clubName: selectedCandidate.clubName || '',
                                hostId: selectedCandidate.hostId || '',
                                hostName: selectedCandidate.hostName || '',
                                theme: formatCuratorDetail(
                                  selectedCandidate.theme || selectedCandidate.eventDetails?.theme,
                                ),
                                dressCode: formatCuratorDetail(
                                  selectedCandidate.dressCode || selectedCandidate.eventDetails?.dressCode,
                                ),
                                restrictions: formatCuratorDetail(
                                  selectedCandidate.restrictions || selectedCandidate.eventDetails?.restrictions,
                                ),
                                admission: formatCuratorDetail(
                                  selectedCandidate.admission || selectedCandidate.eventDetails?.admission,
                                ),
                                membershipRequirement: formatCuratorDetail(
                                  selectedCandidate.membershipRequirement ||
                                    selectedCandidate.eventDetails?.membershipRequirement,
                                ),
                                rsvpRequirement: formatCuratorDetail(
                                  selectedCandidate.rsvpRequirement || selectedCandidate.eventDetails?.rsvpRequirement,
                                ),
                                ageRequirement: formatCuratorDetail(
                                  selectedCandidate.ageRequirement || selectedCandidate.eventDetails?.ageRequirement,
                                ),
                                scheduleChanges: formatCuratorDetail(
                                  selectedCandidate.scheduleChanges || selectedCandidate.eventDetails?.scheduleChanges,
                                ),
                                sourceUrl: selectedCandidate.sourceUrl || '',
                                ticketUrl: selectedCandidate.ticketUrl || '',
                                rsvpUrl: selectedCandidate.rsvpUrl || '',
                                displayDescription:
                                  selectedCandidate.displayDescription || selectedCandidate.description || '',
                                flyerUrl: selectedCandidate.customFlyerUrl || selectedCandidate.flyerUrl || '',
                                customHeaderUrl: selectedCandidate.customHeaderUrl || '',
                                customArtworkLocked: Boolean(selectedCandidate.customArtworkLocked),
                              });
                              addToast({
                                message: `Reverted unsaved local draft for "${selectedCandidate.title}".`,
                                type: 'info',
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Revert Draft
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="curator-save-edits-button"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => void persistCandidateEditsToSqlite(selectedCandidate, false)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save Edits to Queue
                        </button>
                      </div>
                    </div>

                    {/* Proposed Correction Diffs Table (when candidate has changed fields vs catalog) */}
                    {selectedCandidate.fieldDiffs.some((d) => d.changed) && (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                        <div className="text-xs font-bold uppercase tracking-wider text-blue-900">
                          Conflicting / Updated Fields vs. Existing Listing
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {selectedCandidate.fieldDiffs
                            .filter((d) => d.changed)
                            .map((d, idx) => (
                              <div
                                key={`${d.field}-${idx}`}
                                className="rounded-lg border border-blue-200 bg-white p-2.5 text-xs"
                              >
                                <div className="font-bold text-slate-800">{d.label}</div>
                                <div className="mt-0.5 text-[11px] text-slate-500 line-through">
                                  Current:{' '}
                                  {d.originalValue !== null && d.originalValue !== undefined
                                    ? String(d.originalValue)
                                    : '—'}
                                </div>
                                <div className="text-[11px] font-semibold text-blue-800">
                                  Discovered:{' '}
                                  {d.proposedValue !== null && d.proposedValue !== undefined
                                    ? String(d.proposedValue)
                                    : '—'}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Structured Scannable Editor Grid */}
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
                      {/* Title */}
                      <div className="md:col-span-8">
                        <label className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-700">
                          <span>Event Title *</span>
                          {!editForm.title.trim() && (
                            <span className="text-[10px] font-bold text-rose-600">Required</span>
                          )}
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-title"
                          value={editForm.title}
                          onChange={(e) => updateDraftField('title', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Event Theme */}
                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Event Theme / Concept
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-theme"
                          value={editForm.theme}
                          onChange={(e) => updateDraftField('theme', e.target.value)}
                          placeholder="e.g., Masquerade, Neon Glow, Gala..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Date, End Date, Start Time, End Time, Timezone */}
                      <div className="md:col-span-3">
                        <label className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-700">
                          <span>Event Date (YYYY-MM-DD) *</span>
                          {selectedCandidate.inferredFields.some((f) => f.field === 'date') && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                              Inferred Year
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          data-testid="curator-edit-date"
                          value={editForm.date}
                          onChange={(e) => updateDraftField('date', e.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none ${
                            !editForm.date
                              ? 'border-rose-300 bg-rose-50/40'
                              : 'border-slate-200 bg-slate-50 focus:border-blue-500'
                          }`}
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          End Date (Optional)
                        </label>
                        <input
                          type="date"
                          data-testid="curator-edit-end-date"
                          value={editForm.endDate}
                          onChange={(e) => updateDraftField('endDate', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Start Time *
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-start-time"
                          value={editForm.startTime}
                          onChange={(e) => updateDraftField('startTime', e.target.value)}
                          placeholder="21:00"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          End Time
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-end-time"
                          value={editForm.endTime}
                          onChange={(e) => updateDraftField('endTime', e.target.value)}
                          placeholder="02:00"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Timezone *
                        </label>
                        <input
                          type="text"
                          list="curator-timezone-options"
                          data-testid="curator-edit-timezone"
                          value={editForm.timezone}
                          onChange={(e) => updateDraftField('timezone', e.target.value)}
                          placeholder="America/New_York"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                        <datalist id="curator-timezone-options">
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz} value={tz} />
                          ))}
                        </datalist>
                      </div>

                      {/* Organizer Association: Club Name, Host Name, Club ID, Host ID */}
                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Organizer / Club Name *
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-club-name"
                          value={editForm.clubName}
                          onChange={(e) => updateDraftField('clubName', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Promoter / Host Name
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-host-name"
                          value={editForm.hostName}
                          onChange={(e) => updateDraftField('hostName', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Club ID Association
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-club-id"
                          value={editForm.clubId}
                          onChange={(e) => updateDraftField('clubId', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Host ID Association
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-host-id"
                          value={editForm.hostId}
                          onChange={(e) => updateDraftField('hostId', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Location & Venue */}
                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Venue Name
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-venue"
                          value={editForm.venue}
                          onChange={(e) => updateDraftField('venue', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-8">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Street Address / Location *
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-address"
                          value={editForm.address}
                          onChange={(e) => updateDraftField('address', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">City *</label>
                        <input
                          type="text"
                          data-testid="curator-edit-city"
                          value={editForm.city}
                          onChange={(e) => updateDraftField('city', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          State / Region
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-region"
                          value={editForm.region}
                          onChange={(e) => updateDraftField('region', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Country *
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-country"
                          value={editForm.country}
                          onChange={(e) => updateDraftField('country', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Source & Ticket URLs + Metadata */}
                      <div className="md:col-span-4">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-[11px] font-bold text-slate-700">
                            Original Event Source URL *
                          </label>
                          {(() => {
                            const safeEditorSourceUrl = getSafeExternalHttpUrl(editForm.sourceUrl);
                            if (safeEditorSourceUrl) {
                              return (
                                <a
                                  href={safeEditorSourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid="curator-editor-open-source-link"
                                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
                                >
                                  Open Source Page <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              );
                            }
                            return (
                              <span
                                data-testid="curator-editor-open-source-link-disabled"
                                title="Enter a valid http:// or https:// URL"
                                className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
                              >
                                Open Source Page <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                              </span>
                            );
                          })()}
                        </div>
                        <input
                          type="url"
                          data-testid="curator-edit-source-url"
                          value={editForm.sourceUrl}
                          onChange={(e) => updateDraftField('sourceUrl', e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-[11px] font-bold text-slate-700">
                            Ticket / Registration URL
                          </label>
                          {(() => {
                            const safeEditorTicketUrl = getSafeExternalHttpUrl(editForm.ticketUrl);
                            if (safeEditorTicketUrl) {
                              return (
                                <a
                                  href={safeEditorTicketUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid="curator-editor-open-ticket-link"
                                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
                                >
                                  Open Ticket Page <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              );
                            }
                            return (
                              <span
                                data-testid="curator-editor-open-ticket-link-disabled"
                                title="Enter a valid http:// or https:// URL"
                                className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
                              >
                                Open Ticket Page <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                              </span>
                            );
                          })()}
                        </div>
                        <input
                          type="url"
                          data-testid="curator-edit-ticket-url"
                          value={editForm.ticketUrl}
                          onChange={(e) => updateDraftField('ticketUrl', e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Admission &amp; Pricing Summary
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-admission"
                          value={editForm.admission}
                          onChange={(e) => updateDraftField('admission', e.target.value)}
                          placeholder="e.g., $60 Couples · RSVP required"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-6">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Dress Code
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-dress-code"
                          value={editForm.dressCode}
                          onChange={(e) => updateDraftField('dressCode', e.target.value)}
                          placeholder="e.g., Upscale Evening Attire, Black Tie, Lingerie"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-6">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Attendance Policy &amp; Restrictions
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-restrictions"
                          value={editForm.restrictions}
                          onChange={(e) => updateDraftField('restrictions', e.target.value)}
                          placeholder="e.g., Couples & Single Females, 21+ Members Only"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Event Description */}
                      <div className="md:col-span-12">
                        <label className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-700">
                          <span>Event Description &amp; Details *</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {editForm.displayDescription.length} chars
                          </span>
                        </label>
                        <textarea
                          rows={4}
                          data-testid="curator-edit-description"
                          value={editForm.displayDescription}
                          onChange={(e) => updateDraftField('displayDescription', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Reviewer Notes */}
                      <div className="md:col-span-12">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700">
                          Editorial Reviewer Notes (Internal Audit Trail)
                        </label>
                        <input
                          type="text"
                          data-testid="curator-edit-reviewer-notes"
                          value={candidateNotes}
                          onChange={(e) => setCandidateNotes(e.target.value)}
                          placeholder="Optional internal note for this candidate..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <h3 className="mt-3 text-base font-black text-slate-900">
                    No Pending Events in Current Filter
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Switch the queue filter on the left to inspect All Actionable, Warnings, or Approved &amp; History.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: COMMUNITY DISCOVERY                                        */}
      {/* ===================================================================== */}
      {activeSection === 'community-discovery' && (
        <div className="space-y-4" data-testid="curator-community-candidates-section">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600" />
                <h2 className="text-base font-black text-slate-900">
                  Community Discovery — New Clubs, Promoters &amp; Communities
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Assess newly discovered lifestyle clubs, hosts, promoters, and community organizations before adding
                them to the monitored directory.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={communitySearch}
                  onChange={(e) => setCommunitySearch(e.target.value)}
                  placeholder="Search discovered communities..."
                  className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs font-medium text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter community candidate status"
                value={communityStatusFilter}
                onChange={(e) => setCommunityStatusFilter(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Statuses ({(snapshot.communityCandidates || []).length})</option>
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="deferred">Deferred</option>
                <option value="rejected">Rejected</option>
              </select>
              <button
                type="button"
                disabled={busyActionKey === `agent_run_discovery:${snapshot.connection.agentId}`}
                onClick={() =>
                  void handleRunCommand(
                    'agent_run_discovery',
                    snapshot.connection.agentId,
                    { requestedFrom: 'community_discovery' },
                    'Executed multi-strategy community & promoter discovery pass.',
                  )
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-purple-800 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Run Discovery Pass
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredCommunityCandidates.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                No community candidates match the current filter.
              </div>
            ) : (
              filteredCommunityCandidates.map((org) => (
                <div
                  key={org.id}
                  data-testid={`curator-community-card-${org.id}`}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-800">
                          {org.entityType}
                        </span>
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-900">
                          {org.discoveryStrategy.replace(/_/g, ' ')}
                        </span>
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                          Confidence: {org.confidence}
                        </span>
                      </div>
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                          org.reviewState,
                        )}`}
                      >
                        {org.reviewState.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="mt-2 text-base font-black text-slate-900">{org.name}</div>
                    <div className="mt-0.5 text-slate-600">
                      📍 {[org.city, org.region, org.country].filter(Boolean).join(', ') || 'Location under review'}
                      {org.website && (
                        <>
                          {' · '}
                          <a
                            href={org.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                          >
                            {org.website} <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </div>

                    {org.qualifyingEventsEvidence?.length > 0 && (
                      <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          Evidence of Qualifying Play-Party Events
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-700">
                          {org.qualifyingEventsEvidence.map((ev, i) => (
                            <li key={i}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      disabled={busyActionKey === `community_candidate_approve:${org.id}`}
                      onClick={() =>
                        void handleRunCommand(
                          'community_candidate_approve',
                          org.id,
                          { notes: 'Approved community discovery candidate for onboarding & monitoring' },
                          `Approved community candidate "${org.name}".`,
                        )
                      }
                      className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve Candidate
                    </button>
                    <button
                      type="button"
                      disabled={busyActionKey === `community_candidate_defer:${org.id}`}
                      onClick={() =>
                        void handleRunCommand(
                          'community_candidate_defer',
                          org.id,
                          { notes: 'Deferred community candidate for additional verification' },
                          `Deferred community candidate "${org.name}".`,
                        )
                      }
                      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Save for Later
                    </button>
                    <button
                      type="button"
                      disabled={busyActionKey === `community_candidate_reject:${org.id}`}
                      onClick={() =>
                        void handleRunCommand(
                          'community_candidate_reject',
                          org.id,
                          { notes: 'Rejected community candidate' },
                          `Rejected community candidate "${org.name}".`,
                        )
                      }
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: APPROVED & HISTORY                                         */}
      {/* ===================================================================== */}
      {activeSection === 'approved-history' && (
        <div className="space-y-4" data-testid="curator-view-approved-history">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Approved, Saved for Later &amp; Processed History
              </h2>
              <p className="text-xs text-slate-500">
                Inspect approved events awaiting publication, deferred (&ldquo;Saved for Later&rdquo;) events, rejected
                candidates, and full creative artwork history.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHistorySubView('events');
                  setActiveTab('review-queue');
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  activeTab !== 'artwork-studio'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Processed Event Records ({filteredHistoryCandidates.length})
              </button>
              <button
                type="button"
                data-testid="curator-open-artwork-studio-button"
                onClick={() => {
                  setHistorySubView('artwork-studio');
                  setActiveTab('artwork-studio');
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  activeTab === 'artwork-studio'
                    ? 'bg-purple-700 text-white'
                    : 'border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Artwork Studio &amp; Media Catalog ({snapshot.summary.artwork.total})
              </button>
            </div>
          </div>

          {activeTab !== 'artwork-studio' && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'all_processed', label: 'All Processed / Saved' },
                      {
                        id: 'ready_to_publish',
                        label: `Approved / Ready (${
                          (snapshot.summary.reviewQueue.approvedCount || 0) +
                          (snapshot.summary.reviewQueue.readyToPublishCount || 0)
                        })`,
                      },
                      {
                        id: 'deferred',
                        label: `Saved for Later (${snapshot.summary.reviewQueue.deferredCount || 0})`,
                      },
                      {
                        id: 'published',
                        label: `Published (${snapshot.summary.reviewQueue.publishedCount || 0})`,
                      },
                      {
                        id: 'rejected',
                        label: `Rejected (${snapshot.summary.reviewQueue.rejectedCount || 0})`,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`curator-history-filter-${tab.id}`}
                      onClick={() => setHistoryStatusFilter(tab.id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        historyStatusFilter === tab.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Filter history by title, club, city..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[640px] overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3.5 py-2.5">Event &amp; Organizer</th>
                      <th className="px-3 py-2.5">Date &amp; Location</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Artwork</th>
                      <th className="px-3 py-2.5">Audit / Notes</th>
                      <th className="px-3.5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredHistoryCandidates.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                          No processed or deferred candidates match this filter yet.
                        </td>
                      </tr>
                    ) : (
                      filteredHistoryCandidates.map((cand) => (
                        <tr key={cand.id} className="hover:bg-slate-50/80">
                          <td className="px-3.5 py-2.5">
                            <div className="font-bold text-slate-900">{cand.title}</div>
                            <div className="text-[11px] text-slate-500">
                              {cand.clubName || cand.hostName || cand.venue}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-600">
                            <div className="font-semibold text-slate-800">{cand.date || '—'}</div>
                            <div>{[cand.city, cand.country].filter(Boolean).join(', ')}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span
                              className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                                cand.reviewState,
                              )}`}
                            >
                              {cand.reviewState === 'deferred'
                                ? 'Saved for Later'
                                : cand.reviewState.replace(/_/g, ' ')}
                            </span>
                            {cand.publicationRecord?.publishedListingId && (
                              <div className="mt-0.5 font-mono text-[10px] text-emerald-700">
                                {cand.publicationRecord.publishedListingId}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">
                            {cand.stagedMedia?.hasGeneratedPair ? (
                              <span className="rounded bg-purple-50 px-2 py-0.5 font-bold text-purple-800">
                                Flyer {cand.stagedMedia.selectedFlyerVersionId || cand.stagedMedia.selectedVersionId} ·
                                Hero {cand.stagedMedia.selectedHeroVersionId || cand.stagedMedia.selectedVersionId}
                              </span>
                            ) : (
                              <span className="text-slate-400">Standard / Source</span>
                            )}
                          </td>
                          <td className="max-w-xs truncate px-3 py-2.5 text-[11px] text-slate-600">
                            {cand.reviewDecision?.notes || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCandidateId(cand.id);
                                  setQueueQuickFilter('all_actionable');
                                  handleSelectSection('event-review');
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                              >
                                Inspect / Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: SETTINGS & MONITORING (TECHNICAL DASHBOARD CONTROLS)       */}
      {/* ===================================================================== */}
      {activeSection === 'settings-monitoring' && (
        <div className="space-y-4" data-testid="curator-view-settings-monitoring">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Settings, Source Inventory &amp; Scheduler Monitoring
              </h2>
              <p className="text-xs text-slate-500">
                Manage 84 monitored club/promoter sources, adaptive scan schedules, OpenClaw cron jobs, and bridge
                diagnostics.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="curator-settings-subtab-sources"
                onClick={() => {
                  setSettingsSubView('monitored-sources');
                  setActiveTab('monitored-sources');
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  activeTab === 'monitored-sources'
                    ? 'bg-sky-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                Monitored Sources ({snapshot.summary.sources.total})
              </button>
              <button
                type="button"
                data-testid="curator-settings-subtab-jobs"
                onClick={() => {
                  setSettingsSubView('agent-jobs');
                  setActiveTab('agent-jobs');
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  activeTab === 'agent-jobs'
                    ? 'bg-sky-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Scheduler, Cron Jobs &amp; Diagnostics ({snapshot.summary.jobs.totalCronJobs})
              </button>
            </div>
          </div>

          {/* Operational Health Telemetry Strip (tucked inside Settings & Monitoring) */}
          {snapshot.operationalHealth && (
            <div
              data-testid="curator-operational-health-strip"
              className="grid grid-cols-2 gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:grid-cols-3 lg:grid-cols-6"
            >
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Rolling 7d Coverage
                </div>
                <div className="mt-0.5 text-sm font-black text-slate-900">
                  {snapshot.operationalHealth.rolling7dClubCoverageCount} /{' '}
                  {snapshot.operationalHealth.rolling7dClubTotal} clubs (
                  {snapshot.operationalHealth.rolling7dClubCoveragePct}%)
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Due Sources Queue
                </div>
                <div className="mt-0.5 text-sm font-black text-slate-900">
                  {snapshot.operationalHealth.dueSourcesCount} due ·{' '}
                  <span className="text-rose-600">
                    {snapshot.operationalHealth.overdueSourcesCount} overdue
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Missing Event URLs
                </div>
                <div className="mt-0.5 text-sm font-black text-amber-700">
                  {snapshot.operationalHealth.missingEventSourceUrlCount} sources flagged
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Pending Event / Artwork
                </div>
                <div className="mt-0.5 text-sm font-black text-slate-900">
                  {snapshot.operationalHealth.pendingCandidateReviewCount} events ·{' '}
                  {snapshot.operationalHealth.pendingArtworkReviewCount} media
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Last Cycle Outcome
                </div>
                <div className="mt-0.5 text-sm font-black text-emerald-700">
                  {snapshot.operationalHealth.lastScanOutcome} (
                  {formatDateTime(snapshot.operationalHealth.lastScanCompletedAt)})
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  15m Bridge Sync
                </div>
                <div className="mt-0.5 text-sm font-black text-blue-700">
                  Every {snapshot.operationalHealth.bridgeSyncIntervalMinutes}m ·{' '}
                  {formatDateTime(snapshot.operationalHealth.lastBridgeSyncAt)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW B: ARTWORK STUDIO                                                */}
      {/* ===================================================================== */}
      {activeTab === 'artwork-studio' && (
        <div className="space-y-4" data-testid="curator-view-artwork-studio">
          {/* Separation of Artwork vs Event Publication Notice */}
          <div className="flex flex-col justify-between gap-2 rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5 text-xs text-purple-950">
              <Sparkles className="h-4 w-4 shrink-0 text-purple-700" />
              <span>
                <strong>Independent Creative Gate:</strong> Approving or regenerating artwork in Artwork Studio never
                autonomously publishes the underlying event. Event publication remains strictly gated in the Review Queue.
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-purple-200/80 px-2.5 py-0.5 text-[11px] font-bold text-purple-900">
              {snapshot.summary.artwork.generatedPairs} Staged Flyer/Hero Pairs Ready
            </span>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={mediaSearch}
                onChange={(e) => setMediaSearch(e.target.value)}
                placeholder="Search artwork by event title, club, style family, or sensuality direction..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter artwork category"
                value={mediaCategoryFilter}
                onChange={(e) => setMediaCategoryFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="generated_pairs">
                  Generated Flyer &amp; Hero Pairs ({snapshot.summary.artwork.generatedPairs})
                </option>
                <option value="candidate_pairs">
                  Candidate Event Pairs ({snapshot.summary.artwork.candidateGeneratedPairs})
                </option>
                <option value="validation_pairs">
                  Style Diversity Validation Pairs ({snapshot.summary.artwork.validationDiversityPairs})
                </option>
                <option value="official_review">
                  Official Source Artwork Review ({snapshot.summary.artwork.officialArtworkReview})
                </option>
                <option value="brief_ready">Creative Brief Ready ({snapshot.summary.artwork.briefReady})</option>
                <option value="all">All Media Records ({snapshot.summary.artwork.total})</option>
              </select>

              <select
                aria-label="Filter artwork review status"
                value={mediaStatusFilter}
                onChange={(e) => setMediaStatusFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Review Statuses</option>
                <option value="pending_review">Pending Visual Review</option>
                <option value="approved">Approved Artwork</option>
                <option value="regeneration_requested">Regeneration Requested</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Left Selector Column */}
            <div className="max-h-[820px] space-y-2 overflow-y-auto pr-1 xl:col-span-4">
              {filteredMediaItems.map((item) => {
                const isSelected = selectedMedia?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedMediaId(item.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-bold uppercase tracking-wider text-purple-700">
                        {item.styleFamily || 'Official Reference'}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                          item.visualReview?.artworkApproved ? 'approved' : item.status,
                        )}`}
                      >
                        {item.visualReview?.artworkApproved ? 'Artwork Approved' : item.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-1.5 font-bold text-slate-900">{item.eventTitle}</div>
                    <div className="text-xs text-slate-600">
                      {item.clubName} {item.eventDate ? `· ${item.eventDate}` : ''}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {item.creativeProcess && (
                        <span
                          className={`rounded px-1.5 py-0.5 font-bold uppercase ${
                            item.creativeProcess === 'reference_first'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.creativeProcess === 'reference_first' ? 'Reference-First' : 'Description-First'}
                        </span>
                      )}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                        {item.sensualityDirection?.mode || 'Tasteful Nightlife'}
                      </span>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">
                        Quality Eval: {item.visualEvaluation?.passedCount ?? 10}/
                        {item.visualEvaluation?.totalCriteria ?? 10}
                      </span>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                        {item.selectedVersionId || 'v1'} ({item.versionHistory?.length || 1} ver)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Studio Workspace */}
            <div className="xl:col-span-8">
              {selectedMedia ? (
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  {/* Studio Item Header */}
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(
                            selectedMedia.visualReview?.artworkApproved ? 'approved' : selectedMedia.status,
                          )}`}
                        >
                          Artwork:{' '}
                          {selectedMedia.visualReview?.artworkApproved
                            ? 'Approved'
                            : selectedMedia.status.replace(/_/g, ' ')}
                        </span>
                        {selectedMedia.creativeProcess && (
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${
                              selectedMedia.creativeProcess === 'reference_first'
                                ? 'border-blue-200 bg-blue-50 text-blue-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            Process:{' '}
                            {selectedMedia.creativeProcess === 'reference_first'
                              ? 'Reference-First (Official Graphic + Details)'
                              : 'Description-First (Event Details + Club Identity)'}
                          </span>
                        )}
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          Event Status: {selectedMedia.eventReviewState.replace(/_/g, ' ')}
                        </span>
                        <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-800">
                          Active Version: {selectedMedia.selectedVersionId}
                        </span>
                      </div>
                      <h2 className="mt-2 text-lg font-black text-slate-900 sm:text-xl">{selectedMedia.eventTitle}</h2>
                      <p className="text-xs text-slate-600">
                        Club: <span className="font-bold text-slate-800">{selectedMedia.clubName}</span>
                        {selectedMedia.hostName ? ` · Host: ${selectedMedia.hostName}` : ''}
                        {selectedMedia.eventDate ? ` · Date: ${selectedMedia.eventDate}` : ''}
                        {' · '}Provenance: <span className="font-semibold text-slate-700">{selectedMedia.provenance}</span>
                      </p>
                    </div>
                  </div>

                  {/* Side-by-Side Portrait Flyer (1080x1350) & Landscape Hero (1920x1080) */}
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Side-by-Side Staged Pair (Inspecting {inspectingVersionId || selectedMedia.selectedVersionId})
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {displayPortraitOrigUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: displayPortraitOrigUrl,
                                title: `${selectedMedia.eventTitle} — Unlettered Portrait Base`,
                                subtitle: `Version ${inspectingVersionId} · 4:5 Unlettered AI Base`,
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            View Unlettered Portrait
                          </button>
                        )}
                        {displayLandscapeOrigUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: displayLandscapeOrigUrl,
                                title: `${selectedMedia.eventTitle} — Unlettered Landscape Base`,
                                subtitle: `Version ${inspectingVersionId} · 16:9 Recomposed AI Base`,
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            View Unlettered Landscape
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedMedia.hasGeneratedPair && displayFlyerUrl && displayHeroUrl ? (
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        {/* Portrait Flyer 4:5 */}
                        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-950 p-3 text-white lg:col-span-5">
                          <div className="mb-2 flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-200">Portrait Event Flyer (4:5)</span>
                            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                              1080 × 1350 px
                            </span>
                          </div>
                          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-slate-900">
                            <img
                              src={displayFlyerUrl}
                              alt={`${selectedMedia.eventTitle} portrait flyer`}
                              className="max-h-[380px] w-auto object-contain"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: displayFlyerUrl,
                                title: `${selectedMedia.eventTitle} — Portrait Flyer (1080×1350)`,
                                subtitle: `${selectedMedia.styleFamily} · ${selectedMedia.sensualityDirection?.mode}`,
                              })
                            }
                            className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Full-Size Flyer Preview
                          </button>
                        </div>

                        {/* Landscape Hero 16:9 */}
                        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-950 p-3 text-white lg:col-span-7">
                          <div className="mb-2 flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-200">Recomposed Landscape Hero (16:9)</span>
                            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                              1920 × 1080 px
                            </span>
                          </div>
                          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-slate-900">
                            <img
                              src={displayHeroUrl}
                              alt={`${selectedMedia.eventTitle} landscape hero`}
                              className="max-h-[380px] w-full object-contain"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: displayHeroUrl,
                                title: `${selectedMedia.eventTitle} — Landscape Hero (1920×1080)`,
                                subtitle: `${selectedMedia.styleFamily} · Recomposed 16:9 Scene`,
                              })
                            }
                            className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Full-Size Hero Preview
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                        <div className="text-sm font-bold text-slate-800">
                          {selectedMedia.officialSourceArtworkUrl
                            ? 'Official Promoter / Club Source Artwork Staged for Permission & Aspect Verification'
                            : 'Creative Brief Prepared (No AI Generation Cost Incurred Yet)'}
                        </div>
                        {selectedMedia.officialSourceArtworkUrl && (
                          <div className="mt-3 flex flex-col items-center gap-2">
                            <img
                              src={selectedMedia.officialSourceArtworkUrl}
                              alt={selectedMedia.eventTitle}
                              className="max-h-64 rounded-lg border border-slate-200 object-contain shadow-sm"
                            />
                            <a
                              href={selectedMedia.officialSourceArtworkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                            >
                              Inspect Official Source Image URL <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Club Identity Direction & Contextual Sensuality Grid */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Club Identity & Canonical Logo Source Inspection */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          1. Inspected Club Identity &amp; Canonical Logo Source
                        </div>
                        {selectedMedia.logoSource && (
                          <span
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                              selectedMedia.logoSource.missingLogoFlag
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {selectedMedia.logoSource.missingLogoFlag
                              ? 'Missing Logo (Text Crest Fallback)'
                              : selectedMedia.logoSource.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-2 text-xs text-slate-700">
                        <div className="flex items-center gap-3">
                          {selectedMedia.clubIdentity?.logoUrl ? (
                            <img
                              src={selectedMedia.clubIdentity.logoUrl}
                              alt={selectedMedia.clubIdentity.clubName}
                              className="h-10 w-10 rounded-lg border border-slate-200 bg-slate-900 object-contain p-1"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-600">
                              LOGO
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900">{selectedMedia.clubIdentity?.clubName}</div>
                            <div className="text-[11px] text-slate-500">
                              {selectedMedia.clubIdentity?.atmosphereSummary}
                            </div>
                          </div>
                        </div>
                        {selectedMedia.logoSource?.logoUrl && (
                          <div className="truncate text-[11px] text-slate-600">
                            <span className="font-semibold">Canonical Logo URL:</span>{' '}
                            <a
                              href={selectedMedia.logoSource.logoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-blue-600 hover:underline"
                            >
                              {selectedMedia.logoSource.logoUrl}
                            </a>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-slate-600">Brand Colors: </span>
                          <span className="inline-flex flex-wrap gap-1">
                            {(selectedMedia.clubIdentity?.brandColors || []).map((c, i) => (
                              <span
                                key={i}
                                className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800"
                              >
                                {c}
                              </span>
                            ))}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600">Club Motifs: </span>
                          {(selectedMedia.clubIdentity?.brandMotifs || []).join(' · ')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Existing Club Flyers Referenced: {selectedMedia.clubIdentity?.existingFlyerUrls?.length || 0} ·{' '}
                          {selectedMedia.clubIdentity?.usagePolicy}
                        </div>
                      </div>
                    </div>

                    {/* Creative Director System & Contextual Sensuality Brief */}
                    <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-900">
                          2. Creative Director Design System &amp; Brief
                        </div>
                        <span className="rounded bg-purple-100 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-900">
                          {selectedMedia.designSkill || 'swingsphere-creative-director'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5 text-xs text-slate-700">
                        <div>
                          <span className="font-bold text-slate-900">Creative Process:</span>{' '}
                          <span className="font-semibold text-purple-900">
                            {selectedMedia.creativeProcess === 'reference_first'
                              ? 'Reference-First (Official Event Graphic + Event Description)'
                              : 'Description-First (Full Event Description + Club Identity)'}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">Style Family &amp; Medium:</span>{' '}
                          <span className="font-semibold text-slate-900">{selectedMedia.styleFamily}</span>
                          {selectedMedia.medium ? (
                            <span className="ml-1.5 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-800">
                              {selectedMedia.medium.replace(/_/g, ' ')}
                            </span>
                          ) : null}{' '}
                          ({selectedMedia.technique})
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">Poster Layout Template:</span>{' '}
                          <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-900">
                            {selectedMedia.layoutTemplateName || selectedMedia.layoutTemplate || 'Editorial Couture Frame'}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">Sensuality Mode:</span>{' '}
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 font-bold text-purple-900">
                            {selectedMedia.sensualityDirection?.mode}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">Atmosphere Cues:</span>{' '}
                          {(selectedMedia.sensualityDirection?.atmosphereCues || []).join('; ')}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">Composition &amp; Palette:</span>{' '}
                          {selectedMedia.composition} · Palette: {(selectedMedia.palette || []).join(', ')}
                        </div>
                        {selectedMedia.officialImageAnalysis?.stylisticDirection && (
                          <div className="rounded border border-blue-200 bg-blue-50/70 p-2 text-[11px] text-blue-900">
                            <span className="font-bold">Official Image Reference Analysis:</span>{' '}
                            {selectedMedia.officialImageAnalysis.stylisticDirection}
                          </div>
                        )}
                        {selectedMedia.descriptionAnalysis?.styleSelectionRationale &&
                          selectedMedia.creativeProcess === 'description_first' && (
                            <div className="rounded border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-900">
                              <span className="font-bold">Description-First Analysis:</span>{' '}
                              {selectedMedia.descriptionAnalysis.styleSelectionRationale}
                            </div>
                          )}
                        <div className="text-[11px] text-slate-500">
                          <span className="font-semibold">Two-Stage Architecture:</span> Stage A generates unlettered
                          artwork with layout safe zones; Stage B deterministically composites crisp SVG typography &amp;
                          canonical club branding.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stage B Applied Factual Fields Inspection */}
                  {selectedMedia.appliedFacts && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          3. Stage B Deterministic Factual Overlay Fields (Rendered on Flyer)
                        </h3>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                            selectedMedia.appliedFacts.hasMissingFacts
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {selectedMedia.appliedFacts.hasMissingFacts
                            ? `Missing Required Facts Flagged: ${selectedMedia.appliedFacts.missingRequiredFacts.join(', ')}`
                            : 'All Required Poster Facts Verified'}
                        </span>
                      </div>
                      <div className="mt-2.5 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="text-[10px] font-bold uppercase text-slate-500">Event Title &amp; Kicker</div>
                          <div className="mt-0.5 font-bold text-slate-900">{selectedMedia.appliedFacts.title}</div>
                          {selectedMedia.appliedFacts.themeKicker && (
                            <div className="text-[11px] text-purple-700">{selectedMedia.appliedFacts.themeKicker}</div>
                          )}
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="text-[10px] font-bold uppercase text-slate-500">Date &amp; Badge</div>
                          <div className="mt-0.5 font-bold text-slate-900">
                            {selectedMedia.appliedFacts.dateFormatted}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Badge: {selectedMedia.appliedFacts.weekdayShort} · {selectedMedia.appliedFacts.dateBadge}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="text-[10px] font-bold uppercase text-slate-500">Time &amp; Timezone</div>
                          <div className="mt-0.5 font-bold text-slate-900">
                            {selectedMedia.appliedFacts.timeFormatted}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            TZ: {selectedMedia.appliedFacts.timezone || 'Local'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="text-[10px] font-bold uppercase text-slate-500">Club, Venue &amp; City</div>
                          <div className="mt-0.5 font-bold text-slate-900">
                            {selectedMedia.appliedFacts.presentingLine}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {selectedMedia.appliedFacts.venueName}
                            {selectedMedia.appliedFacts.city ? ` · ${selectedMedia.appliedFacts.city}` : ''}
                          </div>
                        </div>
                      </div>
                      {(selectedMedia.appliedFacts.calloutPills?.length > 0 ||
                        selectedMedia.appliedFacts.rsvpOrMembership) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-bold text-slate-600">Callout Pills:</span>
                          {(selectedMedia.appliedFacts.calloutPills || []).map((pill, idx) => (
                            <span
                              key={idx}
                              className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-800"
                            >
                              {pill}
                            </span>
                          ))}
                          {selectedMedia.appliedFacts.rsvpOrMembership && (
                            <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 font-semibold text-purple-900">
                              {selectedMedia.appliedFacts.rsvpOrMembership}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 12-Point Creative Director Technical + Aesthetic Quality Evaluation */}
                  {selectedMedia.qualityEvaluation && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Creative Director 12-Point Quality Check (Technical Validation + Aesthetic Review)
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                            Technical: {selectedMedia.qualityEvaluation.technicalValidation?.passedCount ?? 7}/
                            {selectedMedia.qualityEvaluation.technicalValidation?.total ?? 7}
                          </span>
                          <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                            Aesthetic: {selectedMedia.qualityEvaluation.aestheticEvaluation?.passedCount ?? 5}/
                            {selectedMedia.qualityEvaluation.aestheticEvaluation?.total ?? 5}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {(selectedMedia.qualityEvaluation.criteria || []).map((crit) => (
                          <div
                            key={crit.id}
                            className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                          >
                            <CheckCircle2
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                crit.passed ? 'text-emerald-600' : 'text-amber-500'
                              }`}
                            />
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                <span>
                                  {crit.number}. {crit.question}
                                </span>
                                {crit.category && (
                                  <span
                                    className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                                      crit.category === 'technical'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-purple-100 text-purple-800'
                                    }`}
                                  >
                                    {crit.category}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-600">{crit.notes}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 10-Point Visual Relevance Evaluation */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        10-Point Universal Visual Quality Checklist
                      </h3>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                          selectedMedia.visualEvaluation?.allPassed
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {selectedMedia.visualEvaluation?.passedCount ?? 10} /{' '}
                        {selectedMedia.visualEvaluation?.totalCriteria ?? 10} Criteria Passed
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(selectedMedia.visualEvaluation?.criteria || []).map((crit) => (
                        <div
                          key={crit.id}
                          className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                        >
                          <CheckCircle2
                            className={`mt-0.5 h-4 w-4 shrink-0 ${
                              crit.passed ? 'text-emerald-600' : 'text-amber-500'
                            }`}
                          />
                          <div>
                            <div className="font-bold text-slate-900">
                              {crit.number}. {crit.question}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-600">{crit.notes}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Generation History & Version Selection */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                        <History className="h-3.5 w-3.5" />
                        Generation History &amp; Version Selection ({selectedMedia.versionHistory?.length || 1})
                      </h3>
                    </div>
                    <div className="mt-2.5 space-y-2">
                      {(selectedMedia.versionHistory || []).map((ver) => {
                        const isPreferred = selectedMedia.selectedVersionId === ver.versionId;
                        const isInspecting = inspectingVersionId === ver.versionId;
                        return (
                          <div
                            key={ver.versionId}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs ${
                              isInspecting ? 'border-blue-400 bg-white' : 'border-slate-200 bg-white/70'
                            }`}
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{ver.versionId}</span>
                                <span className="font-semibold text-slate-700">{ver.styleFamily}</span>
                                {(ver.layoutTemplateName || ver.layoutTemplate) && (
                                  <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-semibold text-blue-800">
                                    {ver.layoutTemplateName || ver.layoutTemplate}
                                  </span>
                                )}
                                {ver.regenerationLevel && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold uppercase text-slate-700">
                                    Level: {ver.regenerationLevel}
                                  </span>
                                )}
                                {ver.sensualityMode && (
                                  <span className="rounded bg-purple-50 px-1.5 py-0.2 text-[10px] font-semibold text-purple-800">
                                    {ver.sensualityMode}
                                  </span>
                                )}
                                {isPreferred && (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                                    Preferred Active Version
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {ver.composition} · Created {formatDateTime(ver.createdAt)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setInspectingVersionId(ver.versionId)}
                                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                {isInspecting ? 'Viewing' : 'Preview Version'}
                              </button>
                              {!isPreferred && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRunCommand(
                                      'artwork_select_version',
                                      selectedMedia.id,
                                      { versionId: ver.versionId },
                                      `Selected ${ver.versionId} as preferred version for "${selectedMedia.eventTitle}".`,
                                    )
                                  }
                                  className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700"
                                >
                                  Select as Preferred
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Artwork Approval / Rejection & Feedback-Driven Regeneration */}
                  <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2">
                    {/* Approve / Reject Artwork Pair */}
                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Artwork Review Decision (Separate from Event Publishing)
                      </div>
                      <textarea
                        rows={2}
                        value={artworkReviewNotes}
                        onChange={(e) => setArtworkReviewNotes(e.target.value)}
                        placeholder="Optional visual review notes for this flyer & hero pair..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busyActionKey === `artwork_approve:${selectedMedia.id}`}
                          onClick={() =>
                            void handleRunCommand(
                              'artwork_approve',
                              selectedMedia.id,
                              {
                                versionId: inspectingVersionId || selectedMedia.selectedVersionId,
                                notes: artworkReviewNotes.trim() || 'Approved in Admin Artwork Studio',
                              },
                              `Approved artwork pair (${inspectingVersionId || selectedMedia.selectedVersionId}) for "${selectedMedia.eventTitle}".`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve Artwork Pair
                        </button>
                        <button
                          type="button"
                          disabled={busyActionKey === `artwork_reject:${selectedMedia.id}`}
                          onClick={() =>
                            void handleRunCommand(
                              'artwork_reject',
                              selectedMedia.id,
                              {
                                versionId: inspectingVersionId || selectedMedia.selectedVersionId,
                                notes: artworkReviewNotes.trim() || 'Rejected in Admin Artwork Studio',
                              },
                              `Rejected artwork pair for "${selectedMedia.eventTitle}".`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject Artwork
                        </button>
                      </div>
                    </div>

                    {/* Feedback-Based Regeneration Request */}
                    <div className="space-y-2.5 rounded-xl border border-purple-200 bg-purple-50/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-900">
                          Feedback-Driven Revision Request (Preserves Verified Event Facts)
                        </div>
                        <span className="rounded border border-purple-200 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-purple-800">
                          {snapshot.connection.imageProvider?.cliCommand || 'openclaw infer image'} ·{' '}
                          {snapshot.connection.imageProvider?.model || 'openai/gpt-image-1.5'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                          aria-label="Select regeneration level"
                          value={regenLevel}
                          onChange={(e) => setRegenLevel(e.target.value as 'artwork' | 'layout' | 'typography')}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-purple-950"
                        >
                          <option value="artwork">Full Artwork + Poster Composition (Stage A + B)</option>
                          <option value="layout">Recompose Poster Layout Only (Stage B · Zero AI Cost)</option>
                          <option value="typography">Recompose Typography / Facts Only (Stage B · Zero AI Cost)</option>
                        </select>
                        <select
                          aria-label="Override poster layout template"
                          value={regenLayoutTemplate}
                          onChange={(e) => setRegenLayoutTemplate(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                        >
                          <option value="">Keep / Auto Poster Layout Template</option>
                          {(snapshot.creativeCatalog.layoutTemplates || []).map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.name} ({tpl.category})
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Override style family"
                          value={regenStyleFamily}
                          onChange={(e) => setRegenStyleFamily(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                        >
                          <option value="">Keep / Auto Style Family (30 Families)</option>
                          {snapshot.creativeCatalog.styles.map((s) => (
                            <option key={s.family} value={s.family}>
                              {s.family} {s.medium ? `[${s.medium}]` : ''}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Override contextual sensuality mode"
                          value={regenSensualityMode}
                          onChange={(e) => setRegenSensualityMode(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                        >
                          <option value="">Keep / Auto Sensuality Direction</option>
                          {snapshot.creativeCatalog.sensualityTechniques.map((t) => (
                            <option key={t.id} value={t.label}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        value={regenFeedback}
                        onChange={(e) => setRegenFeedback(e.target.value)}
                        placeholder="Describe desired atmosphere, lighting, layout adjustment, or typography hierarchy changes..."
                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900"
                      />
                      <label className="flex items-center gap-2 text-xs font-medium text-purple-950">
                        <input
                          type="checkbox"
                          checked={regenGenerateNow}
                          onChange={(e) => setRegenGenerateNow(e.target.checked)}
                          className="rounded border-purple-300 text-purple-700"
                        />
                        <span>
                          {regenLevel === 'artwork' ? (
                            <>
                              Invoke existing OpenClaw image provider immediately (
                              <code className="font-mono text-[11px]">
                                {snapshot.connection.imageProvider?.cliCommand || 'openclaw infer image'}
                              </code>
                              ; no separate API integration required)
                            </>
                          ) : (
                            'Re-render Stage B SVG layout & typography immediately on existing Stage A artwork (zero paid AI generation cost)'
                          )}
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={busyActionKey === `artwork_regenerate:${selectedMedia.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'artwork_regenerate',
                            selectedMedia.id,
                            {
                              notes:
                                regenFeedback.trim() ||
                                'Refine adult nightlife atmosphere, poster layout hierarchy, and club-specific visual alignment.',
                              regenerationLevel: regenLevel,
                              layoutTemplate: regenLayoutTemplate || undefined,
                              styleFamily: regenStyleFamily || undefined,
                              sensualityMode: regenSensualityMode || undefined,
                              compositionDirection: regenComposition || undefined,
                              generateNow: regenGenerateNow || regenLevel !== 'artwork',
                            },
                            regenLevel !== 'artwork'
                              ? `Recomposed Stage B ${regenLevel} for "${selectedMedia.eventTitle}" on existing artwork without paid AI generation.`
                              : regenGenerateNow
                                ? `Invoked OpenClaw image provider for "${selectedMedia.eventTitle}" without altering verified event facts.`
                                : `Staged feedback-driven revision for "${selectedMedia.eventTitle}" without altering verified event facts.`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {regenLevel !== 'artwork'
                          ? `Recompose Poster ${regenLevel === 'layout' ? 'Layout' : 'Typography'} (Stage B)`
                          : regenGenerateNow
                            ? 'Regenerate via OpenClaw Provider'
                            : 'Stage Feedback-Based Revision'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW C: MONITORED SOURCES                                             */}
      {/* ===================================================================== */}
      {activeTab === 'monitored-sources' && (
        <div className="space-y-4" data-testid="curator-view-monitored-sources">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Monitored Sources</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{snapshot.summary.sources.total}</div>
              <div className="text-[11px] text-slate-500">
                {snapshot.summary.sources.clubs} clubs · {snapshot.summary.sources.promoters} promoters
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">7-Day Coverage</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.sources.clubsCheckedRolling7d} / {snapshot.summary.sources.clubs}
              </div>
              <div className="text-[11px] text-slate-500">Clubs verified in rolling 7d</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Clean Extractions</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{snapshot.summary.sources.successfulTotal}</div>
              <div className="text-[11px] text-slate-500">
                +{snapshot.summary.sources.partialTotal} partial cycles
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Failures / Blocked</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{snapshot.summary.sources.failedTotal}</div>
              <div className="text-[11px] text-slate-500">Bounded backoff circuit breaker</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Due For Scan Now</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{snapshot.summary.sources.dueNow}</div>
              <div className="text-[11px] text-slate-500">Eligible for next discovery window</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-purple-600">Manual Overrides</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.sources.manualOverridesTotal}
              </div>
              <div className="text-[11px] text-slate-500">{snapshot.summary.sources.pausedTotal} paused</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                placeholder="Search 84 monitored clubs & promoters by name, city, country, domain, or adapter..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter source entity type"
                value={sourceEntityFilter}
                onChange={(e) => setSourceEntityFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Entities ({snapshot.summary.sources.total})</option>
                <option value="club">Clubs ({snapshot.summary.sources.clubs})</option>
                <option value="promoter">Promoters &amp; Hosts ({snapshot.summary.sources.promoters})</option>
              </select>

              <select
                aria-label="Filter monitoring tier"
                value={sourceTierFilter}
                onChange={(e) => setSourceTierFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Monitoring Tiers (≤7d Weekly Window)</option>
                <option value="high">High Frequency (2d)</option>
                <option value="moderate">Moderate (4d)</option>
                <option value="normal">Normal (7d)</option>
                <option value="low">Low (7d)</option>
                <option value="static">Static (7d)</option>
              </select>

              <select
                aria-label="Filter extraction status"
                value={sourceStatusFilter}
                onChange={(e) => setSourceStatusFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Extraction Statuses</option>
                <option value="ok">OK ({snapshot.summary.sources.successfulTotal})</option>
                <option value="partial">Partial ({snapshot.summary.sources.partialTotal})</option>
                <option value="failed">Failed / Restricted ({snapshot.summary.sources.failedTotal})</option>
                <option value="due_now">Due Now ({snapshot.summary.sources.dueNow})</option>
                <option value="missing_url">
                  Missing Event-Source URL ({snapshot.summary.sources.missingEventSourceUrlCount ?? 0})
                </option>
                <option value="paused">Paused ({snapshot.summary.sources.pausedTotal})</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Sources Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-7">
              <div className="max-h-[720px] overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3.5 py-2.5">Source / Location</th>
                      <th className="px-3 py-2.5">Tier &amp; Interval</th>
                      <th className="px-3 py-2.5">Last / Next Scan</th>
                      <th className="px-3 py-2.5">Discovered</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSources.map((src) => {
                      const isSelected = selectedSource?.id === src.id;
                      return (
                        <tr
                          key={src.id}
                          onClick={() => setSelectedSourceId(src.id)}
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-3.5 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-900">
                              <span>{src.name}</span>
                              {src.missingEventSourceUrl && (
                                <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold uppercase text-rose-800">
                                  Missing Event URL
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              <span className="uppercase">{src.entityType}</span> ·{' '}
                              {[src.city, src.region, src.country].filter(Boolean).join(', ') || 'Multi-region'} ·{' '}
                              <code className="text-[10px]">{src.adapter}</code>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                                src.monitoringTier,
                              )}`}
                            >
                              {src.monitoringTier}
                            </span>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-700">
                              Every {src.currentIntervalDays}d ({src.scanFrequencyHours}h)
                            </div>
                            {src.manualOverride && (
                              <span className="text-[10px] font-bold text-purple-700">Manual Override</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-600">
                            <div>OK: {formatDateTime(src.lastSuccessfulScan)}</div>
                            <div className="text-slate-400">Next: {formatDateTime(src.nextScanAt)}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className="font-bold text-slate-900">{src.discoveredEventsCount}</span>
                            <span className="text-[11px] text-slate-500"> ({src.upcomingCandidatesCount} upcoming)</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span
                              className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                                src.extractionStatus,
                              )}`}
                            >
                              {src.extractionStatus}
                            </span>
                            {src.consecutiveFailures > 0 && (
                              <div className="mt-0.5 text-[10px] font-semibold text-rose-600">
                                {src.consecutiveFailures} fail ({src.failureBackoffDays}d backoff)
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Source Inspector & Scheduling Controls */}
            <div className="xl:col-span-5">
              {selectedSource ? (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                          {selectedSource.entityType}
                        </span>
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                            selectedSource.extractionStatus,
                          )}`}
                        >
                          Extraction: {selectedSource.extractionStatus}
                        </span>
                        {selectedSource.missingEventSourceUrl && (
                          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                            Missing Event-Source URL
                          </span>
                        )}
                      </div>
                      <h2 className="mt-1.5 text-lg font-black text-slate-900">{selectedSource.name}</h2>
                      <div className="text-xs text-slate-500">
                        {[selectedSource.city, selectedSource.region, selectedSource.country].filter(Boolean).join(', ')}{' '}
                        · Timezone: <code>{selectedSource.timezone || 'UTC'}</code>
                      </div>
                    </div>
                    {selectedSource.calendarUrl && (
                      <a
                        href={selectedSource.calendarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      >
                        Calendar <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {selectedSource.missingEventSourceUrl && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                      <div className="font-bold">Missing Dedicated Event-Source / Calendar URL</div>
                      <div className="mt-0.5">
                        {selectedSource.missingWebsiteUrl
                          ? 'This source has neither a website URL nor an event calendar URL configured.'
                          : 'This source only has a root homepage URL configured and requires a dedicated events/calendar endpoint or adapter verification.'}
                      </div>
                    </div>
                  )}

                  {/* Scan Timestamps & Discovered Counts */}
                  <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-400">Last Successful Scan</div>
                      <div className="font-semibold text-slate-800">
                        {formatDateTime(selectedSource.lastSuccessfulScan)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-400">Last Attempted Scan</div>
                      <div className="font-semibold text-slate-800">
                        {formatDateTime(selectedSource.lastAttemptedScan)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-400">Next Scheduled Scan</div>
                      <div className="font-semibold text-blue-700">{formatDateTime(selectedSource.nextScanAt)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-400">Events Discovered</div>
                      <div className="font-semibold text-slate-800">
                        {selectedSource.discoveredEventsCount} total ({selectedSource.upcomingCandidatesCount} upcoming ·{' '}
                        {selectedSource.correctionCandidatesCount} edits)
                      </div>
                    </div>
                  </div>

                  {/* Failures & Restrictions */}
                  {(selectedSource.cycleFailures.length > 0 || selectedSource.knownLimitations.length > 0) && (
                    <div className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900">
                      <div className="font-bold uppercase tracking-wider text-rose-800">
                        Failures, Restrictions &amp; Known Limitations
                      </div>
                      {selectedSource.cycleFailures.map((f, i) => (
                        <div key={i} className="text-[11px]">
                          • <span className="font-semibold">{f.reason}</span> on{' '}
                          <span className="underline">{f.url}</span>
                        </div>
                      ))}
                      {selectedSource.knownLimitations.map((lim, i) => (
                        <div key={`lim-${i}`} className="text-[11px] text-rose-800">
                          • Limitation: {lim}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Authorized Individual-Source Scheduling & Permitted Scan Controls */}
                  <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                        <Sliders className="h-3.5 w-3.5 text-blue-600" />
                        Authorized Source Schedule &amp; Scan Controls
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600">Monitoring Tier</label>
                        <select
                          aria-label="Source monitoring tier"
                          value={scheduleTierInput}
                          onChange={(e) => setScheduleTierInput(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value="high">High (2 days)</option>
                          <option value="moderate">Moderate (4 days)</option>
                          <option value="normal">Normal (7 days)</option>
                          <option value="low">Low (7 days)</option>
                          <option value="static">Static (7 days)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600">Interval (Days, 1–365)</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={scheduleIntervalInput}
                          onChange={(e) => setScheduleIntervalInput(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={scheduleAdaptiveInput}
                        onChange={(e) => setScheduleAdaptiveInput(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      Enable adaptive interval learning from verified event changes
                    </label>

                    <input
                      type="text"
                      value={scheduleReasonInput}
                      onChange={(e) => setScheduleReasonInput(e.target.value)}
                      placeholder="Reason for manual schedule override..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800"
                    />

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyActionKey === `source_update_schedule:${selectedSource.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'source_update_schedule',
                            selectedSource.id,
                            {
                              tier: scheduleTierInput,
                              intervalDays: Number(scheduleIntervalInput) || 7,
                              adaptiveEnabled: scheduleAdaptiveInput,
                              reason: scheduleReasonInput.trim() || 'Admin dashboard schedule update',
                            },
                            `Updated schedule for ${selectedSource.name}.`,
                          )
                        }
                        className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save Schedule Override
                      </button>

                      <button
                        type="button"
                        disabled={busyActionKey === `source_update_schedule:${selectedSource.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'source_update_schedule',
                            selectedSource.id,
                            {
                              paused: !selectedSource.paused,
                              reason: selectedSource.paused ? 'Resumed by admin' : 'Paused by admin',
                            },
                            `${selectedSource.paused ? 'Resumed' : 'Paused'} monitoring for ${selectedSource.name}.`,
                          )
                        }
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        {selectedSource.paused ? 'Resume Source' : 'Pause Source'}
                      </button>

                      <button
                        type="button"
                        data-testid="curator-source-check-now"
                        disabled={busyActionKey === `source_request_scan:${selectedSource.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'source_request_scan',
                            selectedSource.id,
                            {
                              runImmediately: true,
                              reason: 'Manual Check Now triggered from Admin Monitored Sources view',
                            },
                            `Executed immediate Check Now scan for ${selectedSource.name}.`,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Check Now
                      </button>

                      <button
                        type="button"
                        disabled={busyActionKey === `source_request_scan:${selectedSource.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'source_request_scan',
                            selectedSource.id,
                            {
                              runImmediately: false,
                              reason: 'Permitted scan queued from Admin Monitored Sources view',
                            },
                            `Permitted scan queued for ${selectedSource.name}.`,
                          )
                        }
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                      >
                        Queue Permitted Scan
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW D: AGENT & JOBS                                                  */}
      {/* ===================================================================== */}
      {activeTab === 'agent-jobs' && (
        <div className="space-y-4" data-testid="curator-view-agent-jobs">
          {/* Distinction Callout Banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950">
            <div className="font-bold uppercase tracking-wider text-blue-800">
              Scheduler Health vs. Source Extraction Outcome Distinction
            </div>
            <p className="mt-1 text-blue-900">
              Each operational job below reports two distinct states: <strong>(1) OpenClaw Cron Scheduler Status</strong>{' '}
              (whether the scheduled agent process launched and completed within its 1800s timeout) and{' '}
              <strong>(2) Local Extraction / Workflow Outcome</strong> (whether all due club websites succeeded or if
              individual external sources returned HTTP 403/429/timeout and were recorded as <code>partial</code> with
              bounded retry backoff).
            </p>
          </div>

          {/* Agent Status & Narrowly Scoped Controls */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">OpenClaw Agent Connection</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-lg font-black text-slate-900">{snapshot.connection.displayName}</span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div>
                  Agent ID: <code>{snapshot.connection.agentId}</code>
                </div>
                <div>Bridge Mode: {snapshot.connection.bridgeMode}</div>
                <div>
                  Auto-Sync Cadence:{' '}
                  <span className="font-semibold text-slate-800">
                    Every {snapshot.connection.bridgeSyncSchedule?.intervalMinutes || 15}m (
                    <code>{snapshot.connection.bridgeSyncSchedule?.cronExpression || '*/15 * * * *'}</code>)
                  </span>
                </div>
                <div>
                  Sync Policy:{' '}
                  <span className="font-semibold text-emerald-700">
                    Delta metadata &amp; command queue only (no scans or image gen)
                  </span>
                </div>
                <div>Last Sync: {formatDateTime(snapshot.connection.lastSynchronizedAt)}</div>
                <div>Catalog Sync: {formatDateTime(snapshot.connection.catalogSyncedAt)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Coverage &amp; Pending Review Counts
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">7-Day Club Coverage</div>
                  <div className="mt-0.5 text-lg font-black text-slate-900">
                    {snapshot.summary.sources.clubsCheckedRolling7d} / {snapshot.summary.sources.clubs}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Pending Event Review</div>
                  <div className="mt-0.5 text-lg font-black text-amber-700">
                    {snapshot.summary.reviewQueue.pendingReview}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Pending Artwork Review</div>
                  <div className="mt-0.5 text-lg font-black text-purple-700">
                    {snapshot.summary.artwork.pendingVisualReview}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Open Alerts</div>
                  <div className="mt-0.5 text-lg font-black text-rose-700">{snapshot.summary.jobs.openAlerts}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Narrowly Scoped Authenticated Controls
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Commands are allow-listed, deduplicated by idempotency key, and logged to the audit trail. No shell
                execution is exposed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleRunCommand(
                      'job_pause_all',
                      snapshot.connection.agentId,
                      { reason: 'Operator requested pause via Agent & Jobs view' },
                      'Recorded scheduler pause directive in Content Curator.',
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  Pause Scheduled Runs
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleRunCommand(
                      'job_resume_all',
                      snapshot.connection.agentId,
                      { reason: 'Operator resumed runs via Agent & Jobs view' },
                      'Recorded scheduler resume directive in Content Curator.',
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Resume Scheduled Runs
                </button>
              </div>
            </div>
          </div>

          {/* 5 Operational Cron Jobs */}
          <div className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
              Five Operational OpenClaw Cron Jobs
            </h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              {snapshot.agentAndJobs.cronJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        {job.command}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-emerald-700">
                        {job.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-black text-slate-900">{job.name}</h3>
                    <p className="mt-1 text-[11px] text-slate-500">{job.description}</p>

                    <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px]">
                      <div className="font-bold text-slate-700">{job.schedule.humanLabel}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        cron: {job.schedule.expr} ({job.schedule.tz})
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">OpenClaw Scheduler:</span>
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[10px] font-bold uppercase ${statusBadgeClass(
                            job.schedulerOutcome.lastStatus,
                          )}`}
                        >
                          {job.schedulerOutcome.lastStatus}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Workflow Extraction:</span>
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[10px] font-bold uppercase ${statusBadgeClass(
                            job.extractionOutcome.status,
                          )}`}
                        >
                          {job.extractionOutcome.status}
                          {job.extractionOutcome.failedSources > 0
                            ? ` (${job.extractionOutcome.failedSources} src fail)`
                            : ''}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        Last Run: <span className="font-semibold text-slate-700">{formatDateTime(job.schedulerOutcome.lastRunAt)}</span>
                      </div>
                      <div className="text-slate-500">
                        Next Run: <span className="font-semibold text-blue-700">{formatDateTime(job.schedulerOutcome.nextRunAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-2.5 text-[10px] text-slate-500">
                    {job.statusDistinctionNote}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts & Command Audit Queue */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Alerts & Integrity */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Source &amp; Integrity Alerts ({snapshot.agentAndJobs.alerts.length})
              </h3>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
                {snapshot.agentAndJobs.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            alert.status === 'open' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {alert.status}
                        </span>
                        <span className="font-bold text-slate-800">{alert.type.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600">{alert.message}</div>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(alert.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Authenticated Command Queue Audit Log */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Authenticated Command &amp; Approval Queue ({snapshot.agentAndJobs.commandQueue.length})
              </h3>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
                {snapshot.agentAndJobs.commandQueue.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    No administrative commands queued yet in this session.
                  </div>
                ) : (
                  snapshot.agentAndJobs.commandQueue.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-mono text-[11px] font-bold text-blue-700">{cmd.commandType}</span>
                        <div className="flex items-center gap-1.5">
                          {cmd.recoveredFromInterruption && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                              Recovered
                            </span>
                          )}
                          {cmd.retriedAfterFailure && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-900">
                              Retried
                            </span>
                          )}
                          <span
                            className={`rounded border px-1.5 py-0.2 text-[10px] font-bold uppercase ${statusBadgeClass(
                              cmd.status === 'acknowledged' ? 'approved' : cmd.status,
                            )}`}
                          >
                            {cmd.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-700">
                        Target: <code>{cmd.targetId}</code> · Actor: <span className="font-semibold">{cmd.actor}</span>{' '}
                        · Attempts: <span className="font-semibold">{cmd.attempts || 1}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                        Idempotency Key: {cmd.idempotencyKey} · {formatDateTime(cmd.updatedAt)}
                      </div>
                      {cmd.error && <div className="mt-1 text-[11px] text-rose-700">Error: {cmd.error}</div>}
                      {(cmd.status === 'failed' || cmd.status === 'processing') && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleRunCommand(
                                cmd.commandType,
                                cmd.targetId,
                                cmd.payload || {},
                                `Recovered and acknowledged command "${cmd.commandType}".`,
                                {
                                  idempotencyKey: cmd.idempotencyKey,
                                  recoverInterrupted: cmd.status === 'processing',
                                  retryFailed: cmd.status === 'failed',
                                },
                              )
                            }
                            className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                          >
                            {cmd.status === 'failed' ? 'Retry Command' : 'Recover Interrupted Command'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Publish Approved Changes Modal */}
      {publishModalOpen && publishPreview && (
        <div
          data-testid="curator-publish-approved-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!isPublishingBatch) setPublishModalOpen(false);
          }}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Manual Production Publishing Workflow
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  Publish Approved Changes to SwingSphere
                </h2>
                <p className="text-xs text-slate-500">
                  Only explicitly approved records that have not yet been published (or whose approved content hash has
                  changed) are included below.
                </p>
              </div>
              <button
                type="button"
                disabled={isPublishingBatch}
                onClick={() => setPublishModalOpen(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Preview Counts Strip */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-emerald-700">Ready to Publish</div>
                <div className="mt-0.5 text-xl font-black text-emerald-950">
                  {publishPreview.counts.readyToPublish}
                </div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-blue-700">New Inserts</div>
                <div className="mt-0.5 text-xl font-black text-blue-950">{publishPreview.counts.inserts}</div>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-indigo-700">Updates</div>
                <div className="mt-0.5 text-xl font-black text-indigo-950">{publishPreview.counts.updates}</div>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-purple-700">Media Uploads</div>
                <div className="mt-0.5 text-xl font-black text-purple-950">
                  {publishPreview.counts.mediaUploadsRequired}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="text-[10px] font-bold uppercase text-amber-700">Blocked / Invalid</div>
                <div className="mt-0.5 text-xl font-black text-amber-950">
                  {publishPreview.counts.blockedByValidation}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-500">Skipped (Current)</div>
                <div className="mt-0.5 text-xl font-black text-slate-800">
                  {publishPreview.counts.skippedAlreadyPublished}
                </div>
              </div>
            </div>

            {isPublishingBatch && publishProgress && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-950">
                <div className="flex items-center justify-between font-bold">
                  <span>
                    Publishing in bounded batches: {publishProgress.completed} / {publishProgress.total}
                  </span>
                  <span>{publishProgress.currentTitle}</span>
                </div>
              </div>
            )}

            {/* Post-execution Summary */}
            {publishSummary && (
              <div
                data-testid="curator-publish-summary"
                className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs"
              >
                <div className="font-black text-slate-900">
                  Publication Batch Summary ({formatDateTime(publishSummary.completedAt)})
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] font-bold">
                  <span className="text-emerald-700">
                    Succeeded: {publishSummary.succeeded.length}
                  </span>
                  <span className="text-rose-700">Failed: {publishSummary.failed.length}</span>
                  <span className="text-slate-600">Skipped: {publishSummary.skipped.length}</span>
                </div>
                {publishSummary.succeeded.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {publishSummary.succeeded.map((item) => (
                      <div
                        key={item.candidateId}
                        className="flex flex-wrap items-center justify-between rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="font-bold text-slate-900">
                          [{item.operationType.toUpperCase()}] {item.title}
                        </span>
                        <span className="font-mono text-[10px] text-emerald-700">
                          ID: {item.publishedListingId} · Hash: {item.contentHash.slice(0, 12)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {publishSummary.failed.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {publishSummary.failed.map((item) => (
                      <div
                        key={item.candidateId}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-900"
                      >
                        <strong>{item.title}:</strong> {item.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Proposed Inserts & Updates Preview List */}
            <div className="mt-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Proposed Production Inserts &amp; Updates ({publishPreview.readyItems.length})
              </div>
              {publishPreview.readyItems.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  No unpublished approved changes are waiting to be published. Approve candidates in the Review Queue first.
                </div>
              ) : (
                <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                  {publishPreview.readyItems.map((item) => (
                    <div
                      key={item.candidate.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                              item.operationType === 'update'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {item.operationType === 'update' ? 'Update Existing' : 'New Insert'}
                          </span>
                          <span className="font-bold text-slate-900">{item.candidate.title}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          Target ID: {item.targetListingId} · Hash: {item.contentHash.slice(0, 12)}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600">
                        Date: <strong>{item.candidate.date}</strong> · Club/Venue:{' '}
                        <strong>{item.candidate.venue || item.candidate.clubName}</strong> · Media:{' '}
                        <span>{item.mediaStatusLabel}</span>
                      </div>
                      {item.changedFields.length > 0 && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
                          <div className="font-bold text-slate-700">Affected Fields:</div>
                          <div className="mt-1 space-y-0.5">
                            {item.changedFields.slice(0, 5).map((ch) => (
                              <div key={ch.field} className="text-slate-600">
                                <strong>{ch.label}:</strong>{' '}
                                <span className="line-through text-slate-400">{ch.before || '—'}</span> →{' '}
                                <span className="font-semibold text-slate-900">{ch.after || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {publishPreview.invalidItems.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <div className="font-bold">
                    Blocked by Validation ({publishPreview.invalidItems.length})
                  </div>
                  <div className="mt-1 space-y-1">
                    {publishPreview.invalidItems.map((inv) => (
                      <div key={inv.candidate.id} className="text-[11px]">
                        <strong>{inv.candidate.title}:</strong> {inv.validationErrors.join(' · ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isPublishingBatch}
                onClick={() => setPublishModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                data-testid="curator-confirm-publish-button"
                disabled={isPublishingBatch || publishPreview.readyItems.length === 0}
                onClick={() => void handleExecuteManualPublish()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {isPublishingBatch
                  ? 'Publishing Approved Batch...'
                  : `Confirm & Publish ${publishPreview.readyItems.length} Approved Change(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Library Picker Modal (Independent Flyer or Hero Selection) */}
      {mediaLibraryModalRole && selectedCandidate && (
        <div
          data-testid="curator-media-library-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setMediaLibraryModalRole(null)}
        >
          <div
            className="relative max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold uppercase text-purple-800">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Media Library — Choose {mediaLibraryModalRole === 'flyer' ? 'Event Flyer (4:5)' : 'Hero Image (16:9)'}
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  Select Replacement {mediaLibraryModalRole === 'flyer' ? 'Flyer' : 'Hero'} for &ldquo;
                  {selectedCandidate.title}&rdquo;
                </h2>
                <p className="text-xs text-slate-500">
                  Selecting an asset below updates only the{' '}
                  <strong>{mediaLibraryModalRole === 'flyer' ? 'Flyer' : 'Hero'}</strong> while preserving the{' '}
                  <strong>{mediaLibraryModalRole === 'flyer' ? 'Hero' : 'Flyer'}</strong> unchanged.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Media Library"
                onClick={() => setMediaLibraryModalRole(null)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={mediaLibrarySearch}
                  onChange={(e) => setMediaLibrarySearch(e.target.value)}
                  placeholder="Search Media Library by event title, club, or artistic style..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {snapshot.mediaItems
                .filter((m) => {
                  const url =
                    mediaLibraryModalRole === 'flyer'
                      ? m.previewUrls?.flyer || m.officialSourceArtworkUrl
                      : m.previewUrls?.hero || m.officialSourceArtworkUrl;
                  if (!url) return false;
                  const q = mediaLibrarySearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    m.eventTitle.toLowerCase().includes(q) ||
                    m.clubName.toLowerCase().includes(q) ||
                    (m.styleFamily || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 24)
                .map((item) => {
                  const previewUrl =
                    mediaLibraryModalRole === 'flyer'
                      ? item.previewUrls?.flyer || item.officialSourceArtworkUrl
                      : item.previewUrls?.hero || item.officialSourceArtworkUrl;
                  return (
                    <div
                      key={`lib-${item.id}`}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div>
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                          {previewUrl && (
                            <img
                              src={previewUrl}
                              alt={item.eventTitle}
                              className="h-40 w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="mt-2 line-clamp-1 font-bold text-slate-900">{item.eventTitle}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.clubName} · {item.styleFamily || 'Official'}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid={`curator-library-select-${item.id}`}
                        disabled={Boolean(rerollingRole)}
                        onClick={() =>
                          void handleChooseFromMediaLibrary(selectedCandidate, mediaLibraryModalRole, {
                            sourceMediaId: item.id,
                            sourceVersionId: item.selectedVersionId || 'v1',
                            sourceRole: mediaLibraryModalRole,
                            imageUrl: previewUrl || undefined,
                            label: `${item.eventTitle} (${item.styleFamily || 'Media Library'})`,
                          })
                        }
                        className="mt-3 w-full rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50"
                      >
                        Use for {mediaLibraryModalRole === 'flyer' ? 'Flyer' : 'Hero'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Generated Variations Comparison Modal */}
      {compareModalRole && selectedCandidate && selectedCandidateMedia && (
        <div
          data-testid="curator-compare-variations-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setCompareModalRole(null)}
        >
          <div
            className="relative max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-black text-white">
                  Compare Generated {compareModalRole === 'flyer' ? 'Flyer (4:5)' : 'Hero (16:9)'} Variations
                </h2>
                <p className="text-xs text-slate-400">
                  Compare all generated variations for &ldquo;{selectedCandidate.title}&rdquo; and select your preferred{' '}
                  {compareModalRole === 'flyer' ? 'Flyer' : 'Hero'} version independently.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalRole(null)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(selectedCandidateMedia.versionHistory || []).map((ver) => {
                const activeVerId =
                  compareModalRole === 'flyer'
                    ? selectedCandidate.stagedMedia?.selectedFlyerVersionId ||
                      selectedCandidateMedia.selectedFlyerVersionId ||
                      selectedCandidateMedia.selectedVersionId
                    : selectedCandidate.stagedMedia?.selectedHeroVersionId ||
                      selectedCandidateMedia.selectedHeroVersionId ||
                      selectedCandidateMedia.selectedVersionId;
                const isSelectedVer = activeVerId === ver.versionId;
                const imgUrl =
                  compareModalRole === 'flyer' ? ver.previewUrls?.flyer : ver.previewUrls?.hero;

                return (
                  <div
                    key={`cmp-${ver.versionId}`}
                    className={`flex flex-col justify-between rounded-xl border p-3 ${
                      isSelectedVer
                        ? 'border-emerald-400 bg-emerald-950/30'
                        : 'border-slate-800 bg-slate-950/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-white">{ver.versionId}</span>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                          {ver.styleCategoryLabel || ver.styleFamily || 'Standard'}
                        </span>
                      </div>
                      {imgUrl && (
                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                          <img
                            src={imgUrl}
                            alt={ver.versionId}
                            className="max-h-64 w-full object-contain"
                          />
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-slate-400">{ver.feedbackNote}</div>
                    </div>
                    <button
                      type="button"
                      disabled={isSelectedVer || Boolean(rerollingRole)}
                      onClick={() => {
                        void handleSelectRoleVersion(selectedCandidate, compareModalRole, ver.versionId);
                        setCompareModalRole(null);
                      }}
                      className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-bold ${
                        isSelectedVer
                          ? 'bg-emerald-600 text-white'
                          : 'bg-purple-600 text-white hover:bg-purple-500'
                      }`}
                    >
                      {isSelectedVer
                        ? `✓ Active ${compareModalRole === 'flyer' ? 'Flyer' : 'Hero'} Version`
                        : `Select ${ver.versionId} for ${compareModalRole === 'flyer' ? 'Flyer' : 'Hero'}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Full-Size Artwork Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-5xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold">{lightboxImage.title}</h3>
                <p className="text-xs text-slate-400">{lightboxImage.subtitle}</p>
              </div>
              <button
                type="button"
                aria-label="Close full-size preview"
                onClick={() => setLightboxImage(null)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center justify-center overflow-auto">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[78vh] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Prompt Preview, Editing, and Copying Modal */}
      {promptModalState && (
        <div
          data-testid="curator-prompt-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setPromptModalState(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="curator-prompt-modal-role"
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                      promptModalState.role === 'flyer'
                        ? 'border-purple-400/50 bg-purple-500/20 text-purple-200'
                        : 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                    }`}
                  >
                    {promptModalState.role === 'flyer' ? 'Flyer Prompt (4:5 Poster)' : 'Hero Prompt (16:9 Banner)'}
                  </span>
                  <span
                    data-testid="curator-prompt-modal-style"
                    className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-200"
                  >
                    Style: {promptModalState.styleCategoryLabel}
                  </span>
                  <span
                    data-testid="curator-prompt-modal-resolution"
                    className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-300"
                  >
                    {promptModalState.targetAspectRatio} · {promptModalState.targetResolution}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-black text-white">
                  Creative Brief &amp; External Image Prompt — {editForm.title || mergedCandidate?.title || 'Event'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Review or customize this prompt before copying it to your external image generator. Generating or
                  copying a prompt never overwrites staged artwork.
                </p>
              </div>
              <button
                type="button"
                data-testid="curator-prompt-modal-close-icon"
                onClick={() => setPromptModalState(null)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <label
                htmlFor="curator-prompt-textarea"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                Editable Creative Direction Prompt
              </label>
              <textarea
                id="curator-prompt-textarea"
                data-testid="curator-prompt-modal-textarea"
                rows={16}
                value={promptModalState.promptText}
                onChange={(e) => handleUpdatePromptModalText(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-purple-400 focus:outline-none"
              />

              {promptModalState.copiedStatus !== 'idle' && (
                <div
                  data-testid="curator-prompt-modal-feedback"
                  className={`mt-3 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
                    promptModalState.copiedStatus === 'error'
                      ? 'border-rose-500/50 bg-rose-950/60 text-rose-200'
                      : 'border-emerald-500/50 bg-emerald-950/60 text-emerald-200'
                  }`}
                >
                  {promptModalState.copiedStatus === 'error'
                    ? 'Clipboard access failed — please select the text above and press Ctrl+C / Cmd+C.'
                    : 'Prompt copied to clipboard!'}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3.5">
              <button
                type="button"
                data-testid="curator-prompt-modal-regenerate-button"
                onClick={handleRegeneratePromptInModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate Prompt
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="curator-prompt-modal-copy-button"
                  onClick={() => void handleCopyPromptToClipboard()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-purple-500"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {promptModalState.copiedStatus === 'copied' ? 'Copied to Clipboard!' : 'Copy Prompt'}
                </button>
                <button
                  type="button"
                  data-testid="curator-prompt-modal-close-button"
                  onClick={() => setPromptModalState(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drag-and-Drop / File Upload Replacement Preview & Confirmation Modal */}
      {pendingUploadConfirmation && (
        <div
          data-testid="curator-upload-confirm-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setPendingUploadConfirmation(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                      pendingUploadConfirmation.role === 'flyer'
                        ? 'border-purple-400/50 bg-purple-500/20 text-purple-200'
                        : 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                    }`}
                  >
                    Confirm {pendingUploadConfirmation.role === 'flyer' ? 'Flyer (4:5)' : 'Hero (16:9)'} Replacement
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                    {pendingUploadConfirmation.width > 0 && pendingUploadConfirmation.height > 0
                      ? `${pendingUploadConfirmation.width} × ${pendingUploadConfirmation.height} (${pendingUploadConfirmation.aspectAnalysis.actualRatioLabel})`
                      : pendingUploadConfirmation.mimeType}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-black text-white">
                  Replace {pendingUploadConfirmation.role === 'flyer' ? 'Vertical Flyer' : 'Horizontal Hero'} for{' '}
                  {pendingUploadConfirmation.candidate.title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  File: <strong className="text-slate-200">{pendingUploadConfirmation.fileName}</strong> (
                  {Math.max(1, Math.round(pendingUploadConfirmation.fileSize / 1024))} KB) · Only the{' '}
                  {pendingUploadConfirmation.role === 'flyer' ? 'flyer' : 'hero'} slot will be updated; previous
                  versions remain restorable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingUploadConfirmation(null)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {pendingUploadConfirmation.aspectAnalysis.warningMessage && (
                <div
                  data-testid="curator-upload-aspect-warning"
                  className="rounded-xl border border-amber-500/50 bg-amber-950/60 p-3.5 text-xs text-amber-200"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div>
                      <div className="font-bold text-amber-100">Aspect Ratio Difference Detected</div>
                      <p className="mt-0.5 text-amber-200/90">
                        {pendingUploadConfirmation.aspectAnalysis.warningMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fit / Crop Strategy Selector */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Framing &amp; Crop Mode
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    data-testid="curator-upload-fit-contain"
                    onClick={() =>
                      setPendingUploadConfirmation((prev) => (prev ? { ...prev, fitMode: 'contain' } : null))
                    }
                    className={`rounded-xl border p-2.5 text-left text-xs transition ${
                      pendingUploadConfirmation.fitMode === 'contain'
                        ? 'border-emerald-400 bg-emerald-950/50 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold">Preserve Full Image (No Silent Crop)</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Letterboxes or pillarboxes inside {pendingUploadConfirmation.aspectAnalysis.targetDimensionsLabel}{' '}
                      so no artwork or typography is cut off.
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="curator-upload-fit-cover"
                    onClick={() =>
                      setPendingUploadConfirmation((prev) => (prev ? { ...prev, fitMode: 'cover' } : null))
                    }
                    className={`rounded-xl border p-2.5 text-left text-xs transition ${
                      pendingUploadConfirmation.fitMode === 'cover'
                        ? 'border-purple-400 bg-purple-950/50 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold">Fill Target Frame (Intentional Center Crop)</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Scales and center-crops to fill {pendingUploadConfirmation.aspectAnalysis.targetDimensionsLabel}{' '}
                      edge-to-edge.
                    </div>
                  </button>
                </div>
              </div>

              {/* Replacement Image Preview */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-2 text-[11px] font-semibold text-slate-400">
                  Preview ({pendingUploadConfirmation.fitMode === 'contain' ? 'Full Image Preserved' : 'Center-Cropped'}{' '}
                  · {pendingUploadConfirmation.aspectAnalysis.targetRatioLabel})
                </div>
                <div
                  className={`overflow-hidden rounded-lg border border-slate-800 bg-slate-900 ${
                    pendingUploadConfirmation.role === 'flyer' ? 'aspect-[4/5] w-56' : 'aspect-video w-full max-w-md'
                  }`}
                >
                  <img
                    src={pendingUploadConfirmation.dataUrl}
                    alt="Pending replacement preview"
                    data-testid="curator-upload-preview-image"
                    className={`h-full w-full ${
                      pendingUploadConfirmation.fitMode === 'contain' ? 'object-contain' : 'object-cover'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3.5">
              <button
                type="button"
                data-testid="curator-upload-cancel-button"
                onClick={() => setPendingUploadConfirmation(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-700"
              >
                Cancel (Keep Current Image)
              </button>
              <button
                type="button"
                data-testid="curator-upload-confirm-button"
                disabled={Boolean(rerollingRole) || Boolean(busyActionKey)}
                onClick={() => void handleConfirmPendingArtworkUpload()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm &amp; Upload Replacement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminContentCurator;
