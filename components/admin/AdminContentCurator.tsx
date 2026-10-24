import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  Filter,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sliders,
  X,
  XCircle,
} from 'lucide-react';
import type { Listing } from '../../types';
import { useAppStore } from '../../store/appStore';
import * as api from '../../lib/api';
import {
  approveCandidateViaAuthorizedWorkflow,
  buildCommandIdempotencyKey,
  fetchCuratorDashboardSnapshot,
  gatherPublishableApprovedCandidates,
  publishApprovedCuratorChanges,
  sendCuratorCommand,
  type CuratorCandidateRecord,
  type CuratorCommandType,
  type CuratorDashboardSnapshot,
  type CuratorManualPublishPreview,
  type CuratorManualPublishSummary,
  type CuratorMediaItem,
  type CuratorMonitoredSource,
} from '../../lib/contentCuratorApi';

export type CuratorPrimaryTab = 'review-queue' | 'artwork-studio' | 'monitored-sources' | 'agent-jobs';

interface AdminContentCuratorProps {
  listings: Listing[];
  onDataChange: () => Promise<void> | void;
  onOpenSubmissionInEditor?: (listingId: string) => void;
  initialTab?: CuratorPrimaryTab;
}

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
    if (Array.isArray(detail.tiers)) return detail.tiers.map((tier) => {
      if (typeof tier !== 'object' || tier === null) return formatCuratorDetail(tier);
      const entry = tier as Record<string, unknown>;
      return [entry.label ?? entry.category, entry.price].map(formatCuratorDetail).filter(Boolean).join(': ');
    }).filter(Boolean).join(' · ');
    return '';
  }
  return '';
};

const formatShortDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Missing Date';
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

const AdminContentCurator: React.FC<AdminContentCuratorProps> = ({
  listings,
  onDataChange,
  onOpenSubmissionInEditor,
  initialTab = 'review-queue',
}) => {
  const { addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState<CuratorPrimaryTab>(initialTab);
  const [snapshot, setSnapshot] = useState<CuratorDashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  // View A: Review Queue state
  const [candidateSearch, setCandidateSearch] = useState('');
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
  const [isEditingCandidate, setIsEditingCandidate] = useState(false);
  const [showListingPreview, setShowListingPreview] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: string;
    city: string;
    region: string;
    country: string;
    theme: string;
    dressCode: string;
    sourceUrl: string;
    ticketUrl: string;
    displayDescription: string;
    flyerUrl: string;
    customArtworkLocked: boolean;
  }>({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    venue: '',
    city: '',
    region: '',
    country: '',
    theme: '',
    dressCode: '',
    sourceUrl: '',
    ticketUrl: '',
    displayDescription: '',
    flyerUrl: '',
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

  const loadSnapshot = async (mirrorSupabase = false) => {
    try {
      if (!snapshot) setIsLoading(true);
      setIsSyncing(true);
      setLoadError(null);
      const data = await fetchCuratorDashboardSnapshot({ mirrorSupabase });
      setSnapshot(data);
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

  // Filtered Candidates for Review Queue
  const filteredCandidates = useMemo(() => {
    if (!snapshot) return [];
    const q = candidateSearch.trim().toLowerCase();
    return snapshot.candidates.filter((c) => {
      if (candidateFilter === 'actionable') {
        if (
          c.candidateType === 'closure_notice' ||
          c.auditCategory === 'historical_event' ||
          c.auditCategory === 'already_in_catalog'
        ) {
          return false;
        }
      } else if (candidateFilter === 'new') {
        if (c.reconciliationState !== 'new' || c.candidateType !== 'event') return false;
      } else if (candidateFilter === 'correction_proposed') {
        if (c.reconciliationState !== 'correction_proposed') return false;
      } else if (candidateFilter === 'warnings') {
        if (c.warnings.length === 0 && c.missingFields.length === 0) return false;
      } else if (candidateFilter === 'closure') {
        if (c.candidateType !== 'closure_notice' && c.reconciliationState !== 'possible_duplicate') return false;
      } else if (candidateFilter === 'inferred_year') {
        if (!c.inferredFields.some((f) => f.field === 'date')) return false;
      } else if (candidateFilter === 'ambiguous_play_party') {
        if (!c.playPartyEligibility?.requiresHumanReview) return false;
      }

      if (candidateReviewFilter !== 'all') {
        if (candidateReviewFilter === 'approved') {
          if (c.reviewState !== 'approved' && c.reviewState !== 'staged_in_submissions') return false;
        } else if (c.reviewState !== candidateReviewFilter) {
          return false;
        }
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
  }, [snapshot, candidateSearch, candidateFilter, candidateReviewFilter]);

  const selectedCandidate: CuratorCandidateRecord | null = useMemo(() => {
    if (!filteredCandidates.length) return null;
    return (
      filteredCandidates.find((c) => c.id === selectedCandidateId) ||
      snapshot?.candidates.find((c) => c.id === selectedCandidateId) ||
      filteredCandidates[0]
    );
  }, [filteredCandidates, selectedCandidateId, snapshot]);

  useEffect(() => {
    if (selectedCandidate) {
      setEditForm({
        title: selectedCandidate.title || '',
        date: selectedCandidate.date || '',
        startTime: selectedCandidate.startTime || '',
        endTime: selectedCandidate.endTime || '',
        venue: selectedCandidate.venue || '',
        city: selectedCandidate.city || '',
        region: selectedCandidate.region || '',
        country: selectedCandidate.country || '',
        theme: formatCuratorDetail(selectedCandidate.theme || selectedCandidate.eventDetails?.theme),
        dressCode: formatCuratorDetail(selectedCandidate.dressCode || selectedCandidate.eventDetails?.dressCode),
        sourceUrl: selectedCandidate.sourceUrl || '',
        ticketUrl: selectedCandidate.ticketUrl || '',
        displayDescription: selectedCandidate.displayDescription || selectedCandidate.description || '',
        flyerUrl: selectedCandidate.customFlyerUrl || selectedCandidate.flyerUrl || '',
        customArtworkLocked: Boolean(selectedCandidate.customArtworkLocked),
      });
    }
  }, [selectedCandidate?.id]);

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

  // Handlers
  const handleRunCommand = async (
    commandType: CuratorCommandType,
    targetId: string,
    payload: Record<string, unknown> = {},
    successMessage?: string,
    options?: {
      idempotencyKey?: string;
      recoverInterrupted?: boolean;
      retryFailed?: boolean;
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
      addToast({
        message: res.duplicate
          ? `Command already acknowledged (deduplicated: ${commandType}).`
          : successMessage || `Curator command "${commandType}" acknowledged.`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : 'Failed to execute Content Curator command.',
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
        <h2 className="mt-3 text-base font-bold text-slate-900">Connecting to OpenClaw Content Curator...</h2>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Loading staged event candidates, generated artwork pairs, monitored club/promoter sources, community discovery queue, and operational cron job state.
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

  return (
    <div className="space-y-6" data-testid="admin-content-curator">
      {/* Top Header & Security Status Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                <Sparkles className="h-3 w-3" />
                Admin → Content → Content Curator
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(
                  snapshot.connection.status,
                )}`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                Agent {snapshot.connection.status}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                <Lock className="h-3 w-3" />
                Approval Gated (Autonomous Publish: Off)
              </span>
            </div>
            <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              SwingSphere Content Curator &amp; Creative Review
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Authoritative operational state in OpenClaw SQLite · Authoritative published catalog in SwingSphere Supabase · Last synced{' '}
              <span className="font-semibold text-slate-700" data-testid="curator-last-sync-time">
                {formatDateTime(snapshot.connection.lastSynchronizedAt)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSnapshot(false)}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
              {isSyncing ? 'Refreshing...' : 'Refresh Local State'}
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

        {/* Operational Health & Activity Strip */}
        <div
          data-testid="curator-operational-health-strip"
          className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs sm:grid-cols-5 lg:grid-cols-10"
        >
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400">Monitored</div>
            <div className="font-black text-slate-900">{snapshot.summary.sources.total}</div>
            <div className="text-[10px] text-slate-500">
              {snapshot.summary.sources.clubs}c · {snapshot.summary.sources.promoters}p
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-emerald-600">Checked ≤7d</div>
            <div className="font-black text-slate-900">
              {snapshot.summary.sources.sourcesCheckedRolling7d ?? snapshot.summary.sources.clubsCheckedRolling7d}/
              {snapshot.summary.sources.total}
            </div>
            <div className="text-[10px] text-slate-500">Rolling 7-day window</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-amber-600">Overdue / Due</div>
            <div className="font-black text-slate-900">{snapshot.summary.sources.dueNow}</div>
            <div className="text-[10px] text-slate-500">Ready for scan</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-rose-600">Missing URL</div>
            <div className="font-black text-slate-900">
              {snapshot.summary.sources.missingEventSourceUrlCount ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">No calendar URL</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-blue-600">New Events</div>
            <div className="font-black text-slate-900">{snapshot.summary.reviewQueue.newEvents}</div>
            <div className="text-[10px] text-slate-500">
              +{snapshot.summary.reviewQueue.proposedCorrections} edits
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-indigo-600">Pending Review</div>
            <div className="font-black text-slate-900">{snapshot.summary.reviewQueue.pendingReview}</div>
            <div className="text-[10px] text-slate-500">
              {snapshot.summary.reviewQueue.ambiguousPlayPartyCount ?? 0} ambiguous
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-purple-600">New Communities</div>
            <div className="font-black text-slate-900">
              {snapshot.summary.communityCandidates?.pendingReview ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">
              of {snapshot.summary.communityCandidates?.total ?? 0} discovered
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Duplicates Skipped</div>
            <div className="font-black text-slate-900">
              {snapshot.summary.reviewQueue.possibleDuplicates +
                snapshot.summary.reviewQueue.duplicateTranslations +
                snapshot.summary.reviewQueue.alreadyInCatalog}
            </div>
            <div className="text-[10px] text-slate-500">
              {snapshot.summary.reviewQueue.alreadyInCatalog} in catalog
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-rose-600">Failed Checks</div>
            <div className="font-black text-slate-900">{snapshot.summary.sources.failedTotal}</div>
            <div className="text-[10px] text-slate-500">With ≤72h backoff</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Last / Next Run</div>
            <div className="truncate font-bold text-slate-800" title={formatDateTime(lastSuccessfulJobIso)}>
              {formatDateTime(lastSuccessfulJobIso)}
            </div>
            <div className="truncate text-[10px] text-blue-600" title={formatDateTime(nextScheduledJobIso)}>
              Next: {formatDateTime(nextScheduledJobIso)}
            </div>
          </div>
        </div>

        {(snapshot.connection.status === 'offline' || snapshot.connection.status === 'degraded') && (
          <div
            data-testid="curator-offline-banner"
            className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <div className="font-bold">
                  Local OpenClaw Gateway {snapshot.connection.status === 'offline' ? 'Offline' : 'Degraded'} — Displaying Last Synchronized Snapshot
                </div>
                <div className="mt-0.5 text-amber-900">
                  Last successful synchronization:{' '}
                  <strong className="font-bold">{formatDateTime(snapshot.connection.lastSynchronizedAt)}</strong> (
                  <code className="font-mono text-[11px]">{snapshot.connection.lastSynchronizedAt}</code>).{' '}
                  {snapshot.connection.offlineReason ||
                    'Administrative commands submitted while offline are queued in the authenticated command queue with idempotency protection and execute when the local gateway reconnects.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadSnapshot(false)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconnect Gateway
            </button>
          </div>
        )}

        {/* Primary 4-View Navigation Tabs */}
        <div
          className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-4"
          role="tablist"
          aria-label="Content Curator Views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'review-queue'}
            onClick={() => setActiveTab('review-queue')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeTab === 'review-queue'
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <FileCheck2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Review Queue</span>
              </div>
              <div className={`mt-0.5 text-[11px] ${activeTab === 'review-queue' ? 'text-blue-100' : 'text-slate-500'}`}>
                {snapshot.summary.reviewQueue.newEvents} new · {snapshot.summary.reviewQueue.proposedCorrections} edits
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === 'review-queue' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {snapshot.summary.reviewQueue.actionableEventCandidates}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'artwork-studio'}
            onClick={() => setActiveTab('artwork-studio')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeTab === 'artwork-studio'
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <ImageIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">Artwork Studio</span>
              </div>
              <div className={`mt-0.5 text-[11px] ${activeTab === 'artwork-studio' ? 'text-blue-100' : 'text-slate-500'}`}>
                {snapshot.summary.artwork.generatedPairs} pairs · {snapshot.summary.artwork.officialArtworkReview} official
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === 'artwork-studio' ? 'bg-white text-blue-700' : 'bg-purple-100 text-purple-800'
              }`}
            >
              {snapshot.summary.artwork.total}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'monitored-sources'}
            onClick={() => setActiveTab('monitored-sources')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeTab === 'monitored-sources'
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <Globe className="h-4 w-4 shrink-0" />
                <span className="truncate">Monitored Sources</span>
              </div>
              <div
                className={`mt-0.5 text-[11px] ${activeTab === 'monitored-sources' ? 'text-blue-100' : 'text-slate-500'}`}
              >
                {snapshot.summary.sources.clubs} clubs · {snapshot.summary.sources.promoters} promoters
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === 'monitored-sources' ? 'bg-white text-blue-700' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {snapshot.summary.sources.total}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'agent-jobs'}
            onClick={() => setActiveTab('agent-jobs')}
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
              activeTab === 'agent-jobs'
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <Activity className="h-4 w-4 shrink-0" />
                <span className="truncate">Agent &amp; Jobs</span>
              </div>
              <div className={`mt-0.5 text-[11px] ${activeTab === 'agent-jobs' ? 'text-blue-100' : 'text-slate-500'}`}>
                {snapshot.summary.jobs.enabledCronJobs} cron jobs · {snapshot.summary.jobs.openAlerts} alerts
              </div>
            </div>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === 'agent-jobs' ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {snapshot.summary.jobs.totalCronJobs}
            </span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW A: REVIEW QUEUE                                                  */}
      {/* ===================================================================== */}
      {activeTab === 'review-queue' && (
        <div className="space-y-4" data-testid="curator-view-review-queue">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Actionable Queue</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.reviewQueue.actionableEventCandidates}
              </div>
              <div className="text-[11px] text-slate-500">
                of {snapshot.summary.reviewQueue.totalStaged} total staged records
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">New Events</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{snapshot.summary.reviewQueue.newEvents}</div>
              <div className="text-[11px] text-slate-500">Discovered from official calendars</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Proposed Corrections</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.reviewQueue.proposedCorrections}
              </div>
              <div className="text-[11px] text-slate-500">Original vs. proposed diffs</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Inferred Year</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.reviewQueue.inferredYearCount}
              </div>
              <div className="text-[11px] text-slate-500">Verified against local timezone</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Duplicates &amp; Closures</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.reviewQueue.possibleDuplicates +
                  snapshot.summary.reviewQueue.closureNotices +
                  snapshot.summary.reviewQueue.duplicateTranslations}
              </div>
              <div className="text-[11px] text-slate-500">
                {snapshot.summary.reviewQueue.closureNotices} closures · {snapshot.summary.reviewQueue.possibleDuplicates}{' '}
                duplicates
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Reviewed Decisions</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {snapshot.summary.reviewQueue.approvedCount +
                  snapshot.summary.reviewQueue.rejectedCount +
                  snapshot.summary.reviewQueue.changesRequestedCount}
              </div>
              <div className="text-[11px] text-slate-500">
                {snapshot.summary.reviewQueue.approvedCount} approved · {snapshot.summary.reviewQueue.rejectedCount}{' '}
                rejected
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                placeholder="Search by event title, club, host, venue, city, or date..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter candidate category"
                value={candidateFilter}
                onChange={(e) => setCandidateFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="actionable">Actionable Event Queue ({snapshot.summary.reviewQueue.actionableEventCandidates})</option>
                <option value="all">All Staged Records ({snapshot.summary.reviewQueue.totalStaged})</option>
                <option value="new">New Events ({snapshot.summary.reviewQueue.newEvents})</option>
                <option value="correction_proposed">
                  Proposed Corrections ({snapshot.summary.reviewQueue.proposedCorrections})
                </option>
                <option value="ambiguous_play_party">
                  Ambiguous Play-Party Flagged ({snapshot.summary.reviewQueue.ambiguousPlayPartyCount ?? 0})
                </option>
                <option value="inferred_year">Inferred-Year Events ({snapshot.summary.reviewQueue.inferredYearCount})</option>
                <option value="warnings">With Warnings / Missing Info</option>
                <option value="closure">Duplicates &amp; Closure Notices</option>
              </select>

              <select
                aria-label="Filter candidate review status"
                value={candidateReviewFilter}
                onChange={(e) => setCandidateReviewFilter(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Editorial Statuses</option>
                <option value="pending_review">Discovered / Pending Review ({snapshot.summary.reviewQueue.pendingReview})</option>
                <option value="approved">Approved ({snapshot.summary.reviewQueue.approvedCount})</option>
                <option value="ready_to_publish">
                  Ready to Publish ({snapshot.summary.reviewQueue.readyToPublishCount ?? 0})
                </option>
                <option value="published">Published ({snapshot.summary.reviewQueue.publishedCount ?? 0})</option>
                <option value="publish_failed">
                  Publish Failed ({snapshot.summary.reviewQueue.publishFailedCount ?? 0})
                </option>
                <option value="changes_requested">Changes Requested</option>
                <option value="deferred">Deferred ({snapshot.summary.reviewQueue.deferredCount ?? 0})</option>
                <option value="rejected">Rejected ({snapshot.summary.reviewQueue.rejectedCount})</option>
              </select>
            </div>
          </div>

          {/* Master-Detail Split */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Candidate List */}
            <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1 xl:col-span-5">
              {filteredCandidates.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  No staged candidates match the current filters.
                </div>
              ) : (
                filteredCandidates.map((cand) => {
                  const isSelected = selectedCandidate?.id === cand.id;
                  const hasInferredYear = cand.inferredFields.some((f) => f.field === 'date');
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            cand.reconciliationState === 'correction_proposed'
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : cand.candidateType === 'closure_notice'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : cand.reconciliationState === 'possible_duplicate'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {reconciliationLabel(cand.reconciliationState, cand.candidateType)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                            cand.reviewState,
                          )}`}
                        >
                          {cand.reviewState.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="mt-2 font-bold text-slate-900">{cand.title}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-600">
                        {cand.clubName}
                        {cand.hostName && cand.hostName !== cand.clubName ? ` · Host: ${cand.hostName}` : ''}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span>
                          📅 {formatShortDate(cand.date)}
                          {cand.startTime ? ` • ${cand.startTime.slice(0, 5)}` : ''}
                        </span>
                        <span>📍 {[cand.venue, cand.city, cand.region].filter(Boolean).join(', ') || 'Venue TBD'}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {cand.playPartyEligibility && (
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              cand.playPartyEligibility.qualified
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {cand.playPartyEligibility.qualified
                              ? '✓ Qualifying Play Party'
                              : '⚠ Ambiguous — Needs Human Review'}
                          </span>
                        )}
                        {cand.customArtworkLocked && (
                          <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-900">
                            🔒 Custom Artwork Locked
                          </span>
                        )}
                        {hasInferredYear && (
                          <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            ⚡ Year Inferred
                          </span>
                        )}
                        {cand.isClosureNotice && (
                          <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            ⛔ Closure Warning
                          </span>
                        )}
                        {cand.reconciliationState === 'possible_duplicate' && (
                          <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            ⚠️ Duplicate Check
                          </span>
                        )}
                        {cand.missingFields.filter((f) => f !== 'series_relationship').length > 0 && (
                          <span className="inline-flex items-center rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            Missing: {cand.missingFields.filter((f) => f !== 'series_relationship').join(', ')}
                          </span>
                        )}
                        {cand.stagedMedia?.hasGeneratedPair && (
                          <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                            🎨 Staged Artwork Pair
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Candidate Inspector Panel */}
            <div className="xl:col-span-7">
              {selectedCandidate ? (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(
                            selectedCandidate.reviewState,
                          )}`}
                        >
                          Status: {selectedCandidate.reviewState.replace(/_/g, ' ')}
                        </span>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {reconciliationLabel(selectedCandidate.reconciliationState, selectedCandidate.candidateType)}
                        </span>
                        {selectedCandidate.playPartyEligibility && (
                          <span
                            data-testid="curator-play-party-eligibility"
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${
                              selectedCandidate.playPartyEligibility.qualified
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-amber-300 bg-amber-50 text-amber-900'
                            }`}
                          >
                            {selectedCandidate.playPartyEligibility.qualified
                              ? 'Qualifying Play Party'
                              : 'Ambiguous — Flagged for Review'}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">{selectedCandidate.id}</span>
                      </div>
                      <h2 className="mt-2 text-lg font-black text-slate-900 sm:text-xl">{selectedCandidate.title}</h2>
                      <p className="mt-0.5 text-xs font-medium text-slate-600">
                        Club: <span className="font-bold text-slate-800">{selectedCandidate.clubName}</span>
                        {selectedCandidate.hostName ? ` · Host: ${selectedCandidate.hostName}` : ''}
                        {' · '}Venue: <span className="font-bold text-slate-800">{selectedCandidate.venue || 'Unspecified'}</span>
                        {selectedCandidate.city ? ` (${[selectedCandidate.city, selectedCandidate.region, selectedCandidate.country].filter(Boolean).join(', ')})` : ''}
                      </p>
                      {selectedCandidate.publicSlug && (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-600">Proposed Event URL:</span>
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-800">
                            /events/{selectedCandidate.publicSlug}
                          </code>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowListingPreview((v) => !v)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>{showListingPreview ? 'Hide Preview' : 'Preview Listing'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingCandidate((v) => !v)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        <span>{isEditingCandidate ? 'Close Editor' : 'Edit & Artwork'}</span>
                      </button>
                      {selectedCandidate.sourceUrl && (
                        <a
                          href={selectedCandidate.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <span>Official Source Page</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Play-Party Eligibility Rationale Banner */}
                  {selectedCandidate.playPartyEligibility && (
                    <div
                      className={`rounded-xl border p-3 text-xs ${
                        selectedCandidate.playPartyEligibility.qualified
                          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
                          : 'border-amber-300 bg-amber-50 text-amber-950'
                      }`}
                    >
                      <div className="font-bold">
                        Play-Party Eligibility:{' '}
                        {selectedCandidate.playPartyEligibility.qualified
                          ? 'Explicitly Qualified Play Party / Lifestyle Club Event'
                          : 'Ambiguous / Generic Social or Nightlife — Requires Human Verification'}
                      </div>
                      <div className="mt-0.5">{selectedCandidate.playPartyEligibility.reason}</div>
                    </div>
                  )}

                  {/* Proposed Listing Preview Drawer */}
                  {showListingPreview && (
                    <div
                      data-testid="curator-proposed-listing-preview"
                      className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-white shadow-inner"
                    >
                      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
                        <span className="font-bold text-emerald-400">Proposed SwingSphere Event Card Preview</span>
                        <span className="font-mono text-[10px]">/events/{selectedCandidate.publicSlug}</span>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row">
                        {(selectedCandidate.customFlyerUrl ||
                          selectedCandidate.stagedMedia?.flyerPreviewUrl ||
                          selectedCandidate.flyerUrl) && (
                          <img
                            src={
                              selectedCandidate.customFlyerUrl ||
                              selectedCandidate.stagedMedia?.flyerPreviewUrl ||
                              selectedCandidate.flyerUrl ||
                              ''
                            }
                            alt={selectedCandidate.title}
                            className="h-40 w-32 shrink-0 rounded-lg border border-slate-700 bg-slate-900 object-cover"
                          />
                        )}
                        <div className="space-y-1.5 text-xs">
                          <div className="text-base font-black text-white">{selectedCandidate.title}</div>
                          <div className="font-semibold text-rose-400">
                            Hosted by {selectedCandidate.hostName || selectedCandidate.clubName}
                          </div>
                          <div className="text-slate-300">
                            📅 {formatShortDate(selectedCandidate.date)}
                            {selectedCandidate.startTime ? ` · ${selectedCandidate.startTime}` : ''}
                            {selectedCandidate.endTime ? ` – ${selectedCandidate.endTime}` : ''}{' '}
                            {selectedCandidate.timezone ? `(${selectedCandidate.timezone})` : ''}
                          </div>
                          <div className="text-slate-300">
                            📍 {[selectedCandidate.venue, selectedCandidate.address, selectedCandidate.city, selectedCandidate.region, selectedCandidate.country]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                          <p className="line-clamp-3 text-slate-400">
                            {selectedCandidate.displayDescription || selectedCandidate.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Candidate Field & Artwork Editor */}
                  {isEditingCandidate && (
                    <div
                      data-testid="curator-candidate-inline-editor"
                      className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                          Edit Candidate Details &amp; Custom Artwork Override
                        </h3>
                        <span className="text-[11px] text-indigo-700">
                          Persists to OpenClaw SQLite &amp; protects manual curations
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700">Event Title</label>
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700">Date</label>
                            <input
                              type="text"
                              value={editForm.date}
                              onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                              placeholder="YYYY-MM-DD"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700">Start</label>
                            <input
                              type="text"
                              value={editForm.startTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                              placeholder="21:00"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700">End</label>
                            <input
                              type="text"
                              value={editForm.endTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                              placeholder="02:00"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700">Venue Name</label>
                          <input
                            type="text"
                            value={editForm.venue}
                            onChange={(e) => setEditForm((f) => ({ ...f, venue: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700">City</label>
                            <input
                              type="text"
                              value={editForm.city}
                              onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700">Region</label>
                            <input
                              type="text"
                              value={editForm.region}
                              onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700">Country</label>
                            <input
                              type="text"
                              value={editForm.country}
                              onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700">Theme</label>
                          <input
                            type="text"
                            value={editForm.theme}
                            onChange={(e) => setEditForm((f) => ({ ...f, theme: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700">Dress Code</label>
                          <input
                            type="text"
                            value={editForm.dressCode}
                            onChange={(e) => setEditForm((f) => ({ ...f, dressCode: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-700">
                            Custom / Replacement Flyer Image URL
                          </label>
                          <input
                            type="text"
                            value={editForm.flyerUrl}
                            onChange={(e) => setEditForm((f) => ({ ...f, flyerUrl: e.target.value }))}
                            placeholder="https://... or /api/admin/curator/media-file?..."
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-700">Description</label>
                          <textarea
                            rows={3}
                            value={editForm.displayDescription}
                            onChange={(e) => setEditForm((f) => ({ ...f, displayDescription: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <label className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                          <input
                            type="checkbox"
                            checked={editForm.customArtworkLocked}
                            onChange={(e) => setEditForm((f) => ({ ...f, customArtworkLocked: e.target.checked }))}
                            className="rounded border-indigo-300 text-indigo-700"
                          />
                          Lock custom artwork against future automated overwrites
                        </label>
                        <button
                          type="button"
                          disabled={busyActionKey === `candidate_update_fields:${selectedCandidate.id}`}
                          onClick={() =>
                            void handleRunCommand(
                              'candidate_update_fields',
                              selectedCandidate.id,
                              {
                                fields: {
                                  title: editForm.title,
                                  date: editForm.date,
                                  startTime: editForm.startTime,
                                  endTime: editForm.endTime,
                                  venue: editForm.venue,
                                  city: editForm.city,
                                  region: editForm.region,
                                  country: editForm.country,
                                  theme: editForm.theme,
                                  dressCode: editForm.dressCode,
                                  displayDescription: editForm.displayDescription,
                                  flyerUrl: editForm.flyerUrl || undefined,
                                  customFlyerUrl: editForm.flyerUrl || undefined,
                                },
                                customArtworkLocked: editForm.customArtworkLocked,
                                notes: candidateNotes.trim() || 'Edited candidate fields & artwork in Admin Review Queue',
                              },
                              `Saved edits for "${editForm.title || selectedCandidate.title}".`,
                            )
                          }
                          className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Save Candidate Edits
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Independent 4-Dimension Readiness Matrix */}
                  {selectedCandidate.statusMatrix && (
                    <div
                      data-testid="curator-status-matrix"
                      className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-4"
                    >
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">1. Discovery</div>
                        <div className="mt-0.5 text-xs font-bold text-emerald-700">
                          {selectedCandidate.statusMatrix.discovery.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">2. Event Data</div>
                        <div
                          className={`mt-0.5 text-xs font-bold ${
                            selectedCandidate.statusMatrix.eventData === 'complete'
                              ? 'text-emerald-700'
                              : selectedCandidate.statusMatrix.eventData === 'partially_complete'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {selectedCandidate.statusMatrix.eventData.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">3. Artwork</div>
                        <div
                          className={`mt-0.5 text-xs font-bold ${
                            selectedCandidate.statusMatrix.artwork === 'approved' ||
                            selectedCandidate.statusMatrix.artwork === 'generated_pending_review'
                              ? 'text-purple-700'
                              : selectedCandidate.statusMatrix.artwork === 'official_reference_found'
                                ? 'text-blue-700'
                                : 'text-slate-700'
                          }`}
                        >
                          {selectedCandidate.statusMatrix.artwork.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">4. Publication</div>
                        <div className="mt-0.5 text-xs font-bold text-slate-800">
                          {selectedCandidate.statusMatrix.publication.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warnings, Closure, Duplicate & Inferred-Field Indicators */}
                  {(selectedCandidate.warnings.length > 0 ||
                    selectedCandidate.inferredFields.length > 0 ||
                    selectedCandidate.missingFields.length > 0) && (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Verification Alerts, Inferred Fields &amp; Missing Info
                      </div>
                      <div className="space-y-1.5 text-xs text-amber-900">
                        {selectedCandidate.warnings.map((w, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                                w.severity === 'high'
                                  ? 'bg-rose-200 text-rose-900'
                                  : w.severity === 'medium'
                                    ? 'bg-amber-200 text-amber-900'
                                    : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              {w.type.replace(/_/g, ' ')}
                            </span>
                            <span>{w.message}</span>
                          </div>
                        ))}
                        {selectedCandidate.inferredFields.map((inf, idx) => (
                          <div key={`inf-${idx}`} className="flex items-start gap-2">
                            <span className="mt-0.5 rounded bg-blue-200 px-1.5 py-0.2 text-[10px] font-bold uppercase text-blue-900">
                              Inferred {inf.field}
                            </span>
                            <span>
                              Method: <code className="font-mono">{inf.method}</code> from raw source value{' '}
                              <span className="font-semibold">&ldquo;{inf.rawValue || 'N/A'}&rdquo;</span>
                              {inf.beyondSixMonthsReview ? ' (Flagged: >6 months in future)' : ''}
                            </span>
                          </div>
                        ))}
                        {selectedCandidate.missingFields.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 rounded bg-rose-200 px-1.5 py-0.2 text-[10px] font-bold uppercase text-rose-900">
                              Missing Info
                            </span>
                            <span>{selectedCandidate.missingFields.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Enriched Structured Event Details & Descriptions */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Extracted Event Details &amp; Multi-Paragraph Description
                      </h3>
                      {selectedCandidate.mediaPriority && (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-indigo-800">
                          Media Priority: {selectedCandidate.mediaPriority.tier} ({selectedCandidate.mediaPriority.score})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      {(selectedCandidate.theme || selectedCandidate.eventDetails?.theme) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <span className="font-bold text-slate-500">Theme: </span>
                          <span className="font-semibold text-slate-900">
                            {formatCuratorDetail(selectedCandidate.theme || selectedCandidate.eventDetails?.theme)}
                          </span>
                        </div>
                      )}
                      {(selectedCandidate.atmosphere || selectedCandidate.eventDetails?.atmosphere) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <span className="font-bold text-slate-500">Atmosphere: </span>
                          <span className="font-semibold text-slate-900">
                            {formatCuratorDetail(selectedCandidate.atmosphere || selectedCandidate.eventDetails?.atmosphere)}
                          </span>
                        </div>
                      )}
                      {(selectedCandidate.dressCode || selectedCandidate.eventDetails?.dressCode) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <span className="font-bold text-slate-500">Dress Code: </span>
                          <span className="font-semibold text-slate-900">
                            {formatCuratorDetail(selectedCandidate.dressCode || selectedCandidate.eventDetails?.dressCode)}
                          </span>
                        </div>
                      )}
                      {(selectedCandidate.restrictions || selectedCandidate.eventDetails?.eligibility) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <span className="font-bold text-slate-500">Eligibility / Audience: </span>
                          <span className="font-semibold text-slate-900">
                            {formatCuratorDetail(selectedCandidate.restrictions || selectedCandidate.eventDetails?.eligibility)}
                          </span>
                        </div>
                      )}
                      {formatCuratorDetail(selectedCandidate.admission || selectedCandidate.eventDetails?.admission) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <span className="font-bold text-slate-500">Admission / Pricing: </span>
                          <span className="font-semibold text-slate-900">
                            {formatCuratorDetail(selectedCandidate.admission || selectedCandidate.eventDetails?.admission)}
                          </span>
                        </div>
                      )}
                      {(selectedCandidate.membershipRequirement ||
                        selectedCandidate.rsvpRequirement ||
                        selectedCandidate.ageRequirement) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <span className="font-bold text-slate-500">Requirements: </span>
                          <span className="font-semibold text-slate-900">
                            {[
                              selectedCandidate.ageRequirement,
                              selectedCandidate.membershipRequirement,
                              selectedCandidate.rsvpRequirement,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {(selectedCandidate.displayDescription || selectedCandidate.description) && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase text-slate-500">
                          <span>Clean SwingSphere Display Description</span>
                          {selectedCandidate.sourceDescription?.context && (
                            <span className="font-mono text-[10px] font-normal text-slate-400">
                              Provenance: {selectedCandidate.sourceDescription.context}
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-line text-xs leading-relaxed text-slate-800">
                          {selectedCandidate.displayDescription || selectedCandidate.description}
                        </div>
                      </div>
                    )}

                    {/* Discovered Official Event Images */}
                    {selectedCandidate.discoveredImages && selectedCandidate.discoveredImages.length > 0 && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase text-blue-900">
                          <span>
                            Discovered Official Event Images ({selectedCandidate.discoveredImages.length})
                          </span>
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] text-blue-800">
                            Visual Reference Only — Does Not Replace 1080×1350 + 1920×1080 Pair
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {selectedCandidate.discoveredImages.slice(0, 4).map((img, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2.5 rounded-lg border border-blue-100 bg-white p-2 text-xs"
                            >
                              <img
                                src={img.highResUrl || img.url}
                                alt={img.alt || selectedCandidate.title}
                                className="h-14 w-14 shrink-0 rounded border border-slate-200 bg-slate-900 object-contain"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-bold text-slate-800">
                                  {img.relevance.replace(/_/g, ' ')} ({img.sourceRole})
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {img.width && img.height ? `${img.width}×${img.height}` : 'Dimensions dynamic'} · Ratio:{' '}
                                  {img.aspectRatio || 'auto'}
                                </div>
                                <a
                                  href={img.highResUrl || img.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                                >
                                  Open Source Image <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Original vs. Proposed Values Table */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Original vs. Proposed Values &amp; Field Provenance
                      </h3>
                      {selectedCandidate.matchedExistingId && (
                        <span className="text-[11px] font-semibold text-blue-700">
                          Matched Catalog Listing: <code>{selectedCandidate.matchedExistingId}</code>
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Field</th>
                            <th className="px-3 py-2">Original Catalog Value</th>
                            <th className="px-3 py-2">Proposed Discovered Value</th>
                            <th className="px-3 py-2">Source Evidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {selectedCandidate.fieldDiffs.map((diff) => (
                            <tr key={diff.field} className={diff.changed ? 'bg-blue-50/30' : ''}>
                              <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  <span>{diff.label}</span>
                                  {diff.inferred && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                                      Inferred
                                    </span>
                                  )}
                                  {diff.changed && (
                                    <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-800">
                                      Changed
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-2 text-slate-500">
                                {diff.originalValue !== null && diff.originalValue !== undefined && diff.originalValue !== ''
                                  ? String(diff.originalValue)
                                  : '— (New)'}
                              </td>
                              <td className="max-w-[240px] break-words px-3 py-2 font-semibold text-slate-900">
                                {diff.proposedValue !== null && diff.proposedValue !== undefined && diff.proposedValue !== ''
                                  ? String(diff.proposedValue)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-[11px] text-slate-500">
                                {diff.evidence ? (
                                  <div>
                                    <div className="font-medium text-slate-700">
                                      Raw: &ldquo;{diff.evidence.rawValue || '—'}&rdquo;
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      Selector: {diff.evidence.context || 'page'} · Verified{' '}
                                      {formatDateTime(diff.evidence.verifiedAt)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Club profile default</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Captured Source Evidence Digest */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Captured Evidence Snapshots ({selectedCandidate.capturePages.length})
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs">
                      {selectedCandidate.capturePages.map((pg, idx) => (
                        <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                          <a
                            href={pg.url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate font-medium text-blue-600 hover:underline"
                          >
                            {pg.url}
                          </a>
                          <span className="font-mono text-[10px] text-slate-400">
                            SHA-256: {(pg.sha256 || '').slice(0, 16)}… · {formatDateTime(pg.capturedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Linked Staged Artwork Shortcut (if present) */}
                  {selectedCandidate.stagedMedia && (
                    <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 p-3">
                      <div className="text-xs">
                        <div className="font-bold text-purple-950">
                          Linked Artwork Studio Record ({selectedCandidate.stagedMedia.status.replace(/_/g, ' ')})
                        </div>
                        <div className="text-[11px] text-purple-800">
                          Style: {selectedCandidate.stagedMedia.styleFamily || 'Assigned'} · Version:{' '}
                          {selectedCandidate.stagedMedia.selectedVersionId} (Artwork approval is managed separately in Artwork Studio)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMediaId(selectedCandidate.stagedMedia!.id);
                          setActiveTab('artwork-studio');
                        }}
                        className="rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800"
                      >
                        Inspect in Artwork Studio
                      </button>
                    </div>
                  )}

                  {/* Review Decision & Publication History if already reviewed */}
                  {(selectedCandidate.reviewDecision || selectedCandidate.publicationRecord) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      {selectedCandidate.reviewDecision && (
                        <div className="font-bold text-slate-800">
                          Last Review Decision: {selectedCandidate.reviewDecision.status.toUpperCase()} by{' '}
                          {selectedCandidate.reviewDecision.reviewedBy} at{' '}
                          {formatDateTime(selectedCandidate.reviewDecision.reviewedAt)}
                        </div>
                      )}
                      {selectedCandidate.reviewDecision?.notes && (
                        <div className="mt-1 text-slate-600">Notes: {selectedCandidate.reviewDecision.notes}</div>
                      )}
                      {selectedCandidate.publicationRecord && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
                          <div className="font-bold text-slate-900">
                            Publication Status:{' '}
                            <span className="uppercase">{selectedCandidate.publicationRecord.status}</span>
                            {selectedCandidate.publicationRecord.publishedListingId
                              ? ` · Listing ID: ${selectedCandidate.publicationRecord.publishedListingId}`
                              : ''}
                          </div>
                          {selectedCandidate.publicationRecord.publishedAt && (
                            <div className="mt-0.5 text-slate-600">
                              Published At: {formatDateTime(selectedCandidate.publicationRecord.publishedAt)} · Hash:{' '}
                              <code className="font-mono text-[10px]">
                                {(selectedCandidate.publicationRecord.publishedContentHash || '').slice(0, 16)}
                              </code>
                            </div>
                          )}
                          {selectedCandidate.publicationRecord.lastError && (
                            <div className="mt-1 font-semibold text-rose-700">
                              Last Publish Error: {selectedCandidate.publicationRecord.lastError}
                            </div>
                          )}
                        </div>
                      )}
                      {Array.isArray(selectedCandidate.unreviewedSourceUpdates) &&
                        selectedCandidate.unreviewedSourceUpdates.length > 0 && (
                          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                            <strong>Protected Published Record:</strong> {selectedCandidate.unreviewedSourceUpdates.length}{' '}
                            subsequent source scan update(s) were recorded locally without overwriting the published event.
                            Review and explicitly approve changes in the editor to publish an update.
                          </div>
                        )}
                      {(selectedCandidate.publicationRecord?.publishedListingId ||
                        selectedCandidate.reviewDecision?.publishedListingId) &&
                        onOpenSubmissionInEditor && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenSubmissionInEditor(
                                selectedCandidate.publicationRecord?.publishedListingId ||
                                  selectedCandidate.reviewDecision!.publishedListingId!,
                              )
                            }
                            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                          >
                            Open Listing{' '}
                            {selectedCandidate.publicationRecord?.publishedListingId ||
                              selectedCandidate.reviewDecision?.publishedListingId}{' '}
                            in SwingSphere Editor →
                          </button>
                        )}
                    </div>
                  )}

                  {/* Local-First Editorial Review & Manual Publishing Controls */}
                  <div className="border-t border-slate-200 pt-4">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Administrator Review Notes / Change Request Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={candidateNotes}
                      onChange={(e) => setCandidateNotes(e.target.value)}
                      placeholder="Add verification notes, moderation rationale, or instructions for requested changes..."
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          selectedCandidate.isClosureNotice ||
                          !selectedCandidate.date ||
                          busyActionKey === `candidate_approve:${selectedCandidate.id}`
                        }
                        onClick={() =>
                          void handleRunCommand(
                            'candidate_approve',
                            selectedCandidate.id,
                            {
                              notes:
                                candidateNotes.trim() ||
                                'Approved locally in Content Curator Review Queue (awaiting manual publish).',
                            },
                            `Approved "${selectedCandidate.title}" locally. Use "Publish Approved Changes" to publish to production.`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve (Local)
                      </button>

                      <button
                        type="button"
                        disabled={
                          selectedCandidate.isClosureNotice ||
                          !selectedCandidate.date ||
                          busyActionKey === `candidate_mark_ready_to_publish:${selectedCandidate.id}`
                        }
                        onClick={() =>
                          void handleRunCommand(
                            'candidate_mark_ready_to_publish',
                            selectedCandidate.id,
                            {
                              notes:
                                candidateNotes.trim() ||
                                'Marked Ready to Publish locally by administrator.',
                            },
                            `Marked "${selectedCandidate.title}" as Ready to Publish.`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" />
                        Mark Ready to Publish
                      </button>

                      <button
                        type="button"
                        disabled={busyActionKey === `candidate_defer:${selectedCandidate.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'candidate_defer',
                            selectedCandidate.id,
                            {
                              notes: candidateNotes.trim() || 'Deferred for subsequent review cycle.',
                            },
                            `Deferred candidate "${selectedCandidate.title}".`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        Defer
                      </button>

                      <button
                        type="button"
                        disabled={busyActionKey === `candidate_request_changes:${selectedCandidate.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'candidate_request_changes',
                            selectedCandidate.id,
                            {
                              notes: candidateNotes.trim() || 'Additional source verification requested by administrator.',
                            },
                            `Requested changes on "${selectedCandidate.title}".`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Request Changes
                      </button>

                      <button
                        type="button"
                        disabled={busyActionKey === `candidate_reject:${selectedCandidate.id}`}
                        onClick={() =>
                          void handleRunCommand(
                            'candidate_reject',
                            selectedCandidate.id,
                            {
                              notes: candidateNotes.trim() || 'Rejected by administrator in Content Curator Review Queue.',
                            },
                            `Rejected candidate "${selectedCandidate.title}".`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Editorial decisions stay in local SQLite until you explicitly click{' '}
                      <strong>Publish Approved Changes</strong> in the header to validate, upload approved media, and publish
                      in bounded batches.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Autonomous Web Discovery: New Club, Host & Promoter Candidate Queue */}
          <div
            data-testid="curator-community-candidates-section"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-purple-800">
                    Autonomous Web Discovery Queue
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {snapshot.summary.communityCandidates?.pendingReview ?? 0} pending review ·{' '}
                    {snapshot.summary.communityCandidates?.total ?? 0} total discovered
                  </span>
                </div>
                <h2 className="mt-1 text-base font-black text-slate-900 sm:text-lg">
                  New Club, Promoter &amp; Community Candidates (Never Auto-Published)
                </h2>
                <p className="text-xs text-slate-500">
                  Discovered via multi-strategy web &amp; association discovery (event associations, regional directories,
                  organizer cross-links, underserved regions, and public calendars).
                </p>
              </div>
              <button
                type="button"
                disabled={busyActionKey === `agent_run_discovery:${snapshot.connection.agentId}`}
                onClick={() =>
                  void handleRunCommand(
                    'agent_run_discovery',
                    snapshot.connection.agentId,
                    { requestedFrom: 'review_queue' },
                    'Executed multi-strategy community & promoter discovery pass.',
                  )
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Run Web Discovery Pass
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(snapshot.communityCandidates || []).length === 0 ? (
                <div className="col-span-full rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  No community candidates staged yet. Click &ldquo;Run Web Discovery Pass&rdquo; to scan for new clubs and promoters.
                </div>
              ) : (
                (snapshot.communityCandidates || []).map((org) => (
                  <div
                    key={org.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs"
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

                      <div className="mt-2 text-sm font-black text-slate-900">{org.name}</div>
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
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
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

                      {org.possibleDatabaseMatches?.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-800">
                          <span className="font-bold">Possible Existing DB Matches: </span>
                          {org.possibleDatabaseMatches.map((m) => `${m.name} (${Math.round(m.similarity * 100)}%)`).join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
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
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
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
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Defer
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
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
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
    </div>
  );
};

export default AdminContentCurator;
