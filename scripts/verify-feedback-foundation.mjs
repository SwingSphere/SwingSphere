import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', logLevel: 'error', server: { middlewareMode: true } });

try {
  const { aggregateFeedback, getPublicFeedbackThreshold } = await server.ssrLoadModule('/lib/feedback/aggregation.ts');
  const { canSubmitEventFeedback } = await server.ssrLoadModule('/lib/feedback/eligibility.ts');
  const { MockFeedbackRepository, FeedbackRepositoryError, migrateFeedbackStorageV1, isFeedbackStorageEnvelope } = await server.ssrLoadModule('/lib/feedback/mockFeedbackRepository.ts');
  const { mapFeedbackRepositoryErrorCode } = await server.ssrLoadModule('/lib/feedback/errors.ts');
  const { createMockEventFeedbackTarget, resolveEventFeedbackTarget, WINTER_MASQUERADE_SOURCE_EVENT_ID } = await server.ssrLoadModule('/lib/feedback/feedbackTargetResolver.ts');
  const { FEEDBACK_SIGNAL_REGISTRY_VERSION } = await server.ssrLoadModule('/lib/feedback/promptRegistry.ts');
  const { selectFeedbackRepositoryMode } = await server.ssrLoadModule('/lib/feedback/repositoryFactory.ts');
  const { MOCK_FEEDBACK_SEED, MOCK_SAFETY_REPORT_SEED, FEEDBACK_DEMO_EVENT_ID } = await server.ssrLoadModule('/lib/feedback/seedData.ts');
  const { FeedbackService } = await server.ssrLoadModule('/lib/feedback/service.ts');
  const { validateFeedbackSubmission, validateSafetyReport } = await server.ssrLoadModule('/lib/feedback/validation.ts');
  const { getPublicWrittenText, hasPendingWrittenRevision } = await server.ssrLoadModule('/lib/feedback/writtenExperience.ts');
  const { mapApprovedWrittenExperience, mapFeedbackAggregate, mapFeedbackSubmission, mapSafetyReportReceipt } = await server.ssrLoadModule('/lib/feedback/supabaseFeedbackMappers.ts');
  const { SupabaseFeedbackRepository } = await server.ssrLoadModule('/lib/feedback/supabaseFeedbackRepository.ts');

  const eligible = MOCK_FEEDBACK_SEED.filter((submission) => submission.structuredStatus === 'eligible');
  assert.equal(getPublicFeedbackThreshold('event'), 1, 'events publish from the first eligible response');
  assert.equal(getPublicFeedbackThreshold('club'), 10, 'clubs retain the ten-response threshold');
  assert.equal(aggregateFeedback(eligible.slice(0, 1)).status, 'public_ready', 'one eligible event response is publicly visible');
  assert.equal(aggregateFeedback(eligible.slice(0, 9), 10).status, 'insufficient_data', '9 eligible club responses stay below threshold');
  assert.equal(aggregateFeedback(eligible.slice(0, 10), 10).status, 'public_ready', '10 eligible club responses meet threshold');

  const aggregate = aggregateFeedback(MOCK_FEEDBACK_SEED, 1);
  assert.deepEqual(aggregate.sentimentCounts, { positive: 8, mixed: 3, negative: 1 }, 'sentiments aggregate correctly');
  assert.equal(aggregate.eligibleResponseCount, 12, 'withdrawn and excluded records do not aggregate');
  assert.equal(MOCK_SAFETY_REPORT_SEED.length, 1, 'private safety concerns live in a distinct collection');
  assert.ok(eligible.every((submission) => submission.signalRegistryVersion === FEEDBACK_SIGNAL_REGISTRY_VERSION), 'every seeded submission preserves the registry version');
  assert.equal(aggregateFeedback([MOCK_FEEDBACK_SEED.find((submission) => submission.structuredStatus === 'excluded')], 1).eligibleResponseCount, 0, 'structured-excluded feedback does not aggregate');

  const pendingRevision = MOCK_FEEDBACK_SEED.find((submission) => submission.id === 'feedback-demo-eligible-2');
  assert.match(getPublicWrittenText(pendingRevision), /communicated clearly/, 'pending revision preserves previously approved text');
  assert.equal(hasPendingWrittenRevision(pendingRevision), true, 'pending replacement is represented as an unpublished revision');

  const pendingFirstText = MOCK_FEEDBACK_SEED.find((submission) => submission.id === 'feedback-demo-eligible-3');
  assert.equal(pendingFirstText.writtenExperience.moderationStatus, 'pending');
  assert.equal(aggregateFeedback([pendingFirstText], 1).eligibleResponseCount, 1, 'pending first text does not block structured aggregation');
  assert.equal(getPublicWrittenText(pendingFirstText), undefined, 'pending first text is not public');

  const rejectedRevision = MOCK_FEEDBACK_SEED.find((submission) => submission.id === 'feedback-demo-eligible-4');
  assert.match(getPublicWrittenText(rejectedRevision), /Check-in was smooth/, 'rejected revision preserves previously approved text');
  assert.equal(hasPendingWrittenRevision(rejectedRevision), false, 'rejected replacement is not mislabeled as pending');

  const withdrawn = MOCK_FEEDBACK_SEED.find((submission) => submission.id === 'feedback-demo-withdrawn-1');
  assert.equal(aggregateFeedback([withdrawn], 1).eligibleResponseCount, 0, 'withdrawal removes structured contribution');
  assert.equal(getPublicWrittenText(withdrawn), undefined, 'withdrawal hides approved written text');

  const baseInput = {
    authorUserId: 'user-test', targetType: 'event', targetId: 'event-test', relatedEventId: 'event-test', overallSentiment: 'positive',
    positiveSignalIds: ['great_music'], improvementSignalIds: [], signalRegistryVersion: FEEDBACK_SIGNAL_REGISTRY_VERSION,
    experienceScope: 'single_event', attendanceVerification: 'self_reported',
  };
  const validationContext = { eventEndAt: '2026-01-01T00:00:00.000Z', now: '2026-02-01T00:00:00.000Z' };
  assert.equal(validateFeedbackSubmission(baseInput, validationContext).valid, true, 'valid event feedback passes');
  assert.ok(validateFeedbackSubmission({ ...baseInput, positiveSignalIds: ['not_a_real_signal'] }, validationContext).errors.some((error) => error.code === 'invalid_signal'), 'invalid signal IDs are rejected');
  assert.ok(validateFeedbackSubmission({ ...baseInput, improvementSignalIds: ['great_music'] }, validationContext).errors.some((error) => error.code === 'signal_in_both_polarities'), 'cross-polarity duplicates are rejected');
  assert.ok(validateFeedbackSubmission({ ...baseInput, signalRegistryVersion: 999 }, validationContext).errors.some((error) => error.code === 'unsupported_registry_version'), 'unsupported registry versions are rejected');
  assert.ok(validateFeedbackSubmission({ ...baseInput, attendanceVerification: 'platform_confirmed' }, validationContext).errors.some((error) => error.code === 'server_controlled'), 'clients cannot claim platform-confirmed attendance');
  assert.ok(validateFeedbackSubmission({ ...baseInput, relatedVenueId: 'venue-test' }, validationContext).errors.some((error) => error.field === 'relatedVenueId'), 'event feedback cannot retarget through a venue');
  assert.equal(validateFeedbackSubmission({ ...baseInput, targetType: 'club', targetId: 'club-test', relatedEventId: undefined, relatedVenueId: 'venue-context', visitDate: '2026-01-10', experienceScope: 'single_visit', positiveSignalIds: ['helpful_staff'] }, validationContext).valid, true, 'club target remains the listing while venue is optional context');

  assert.equal(canSubmitEventFeedback({ userId: 'user-test', eventEndAt: '2026-03-01T00:00:00.000Z', now: '2026-02-01T00:00:00.000Z' }).allowed, false, 'event feedback stays closed before event end');
  assert.equal(canSubmitEventFeedback({ userId: 'user-test', eventEndAt: '2026-01-01T00:00:00.000Z', now: '2026-02-01T00:00:00.000Z' }).allowed, true, 'event feedback opens after event end');

  const repository = new MockFeedbackRepository([], []);
  const organizationInput = {
    authorUserId: 'user-test', targetType: 'organization', targetId: 'org-test', overallSentiment: 'positive', positiveSignalIds: ['clear_communication'], improvementSignalIds: [],
    signalRegistryVersion: FEEDBACK_SIGNAL_REGISTRY_VERSION, experienceScope: 'communication_only', attendanceVerification: 'self_reported',
  };
  await repository.createSubmission(organizationInput);
  await assert.rejects(repository.createSubmission(organizationInput), (error) => error instanceof FeedbackRepositoryError && error.code === 'duplicate_submission', 'repository enforces one active organization submission per user');

  const organizationRepository = new MockFeedbackRepository([], []);
  const organizationService = new FeedbackService(organizationRepository);
  const organizationDraft = { targetType: 'organization', targetId: 'org-service', overallSentiment: 'positive', positiveSignalIds: ['clear_communication'], improvementSignalIds: [], experienceScope: 'communication_only', attendanceVerification: 'self_reported' };
  await organizationService.submitFeedback(organizationDraft, { authorUserId: 'org-user' });
  await organizationService.submitFeedback({ ...organizationDraft, overallSentiment: 'mixed' }, { authorUserId: 'org-user' });
  assert.equal((await organizationRepository.listForTarget('organization', 'org-service')).length, 1, 'organization edits update the existing submission instead of creating duplicates');

  const clubRepository = new MockFeedbackRepository([], []);
  const clubService = new FeedbackService(clubRepository);
  const clubDraft = { targetType: 'club', targetId: 'club-service', overallSentiment: 'positive', positiveSignalIds: ['helpful_staff'], improvementSignalIds: [], visitDate: '2026-01-10', attendanceVerification: 'self_reported' };
  await clubService.submitFeedback(clubDraft, { authorUserId: 'club-user', now: '2026-02-01T00:00:00.000Z' });
  await clubService.submitFeedback({ ...clubDraft, overallSentiment: 'mixed' }, { authorUserId: 'club-user', now: '2026-02-01T00:00:00.000Z' });
  assert.equal((await clubRepository.listForTarget('club', 'club-service')).length, 1, 'club edits preserve target, user, and visit-date deduplication');

  const revisionRepository = new MockFeedbackRepository([MOCK_FEEDBACK_SEED[1]], []);
  const revisionService = new FeedbackService(revisionRepository);
  const before = await revisionService.getAggregate('event', FEEDBACK_DEMO_EVENT_ID);
  await revisionService.updateFeedback(MOCK_FEEDBACK_SEED[1].id, {
    targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, overallSentiment: 'mixed', positiveSignalIds: ['clear_communication'], improvementSignalIds: [], reviewText: 'A newly revised account awaiting review.', attendanceVerification: 'self_reported',
  }, { authorUserId: MOCK_FEEDBACK_SEED[1].authorUserId, eventEndAt: '2026-01-01T00:00:00.000Z', now: '2026-02-01T00:00:00.000Z' });
  const after = await revisionService.getAggregate('event', FEEDBACK_DEMO_EVENT_ID);
  assert.equal(before.eligibleResponseCount, after.eligibleResponseCount, 'structured updates remain aggregate eligible while written revision is pending');

  const withdrawRepository = new MockFeedbackRepository([MOCK_FEEDBACK_SEED[0]], []);
  const withdrawService = new FeedbackService(withdrawRepository);
  const withdrawnResult = await withdrawService.withdrawFeedback(MOCK_FEEDBACK_SEED[0].id, MOCK_FEEDBACK_SEED[0].authorUserId);
  assert.equal(withdrawnResult.structuredStatus, 'withdrawn', 'withdrawal is a lifecycle transition, not deletion');
  assert.equal((await withdrawService.getAggregate('event', FEEDBACK_DEMO_EVENT_ID)).eligibleResponseCount, 0, 'withdraw service removes aggregate contribution');

  const migrated = migrateFeedbackStorageV1([{
    id: 'legacy-1', authorUserId: 'legacy-user', targetType: 'event', targetId: 'legacy-event', relatedEventId: 'legacy-event', overallSentiment: 'positive', positiveSignalIds: ['great_music'], improvementSignalIds: [],
    reviewText: 'Legacy approved text', moderationStatus: 'approved', visibilityStatus: 'public', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  }]);
  assert.equal(migrated?.schemaVersion, 2, 'v1 arrays migrate into a v2 envelope');
  assert.equal(migrated?.submissions[0].writtenExperience.approvedText, 'Legacy approved text', 'migration preserves approved public text');
  assert.equal(isFeedbackStorageEnvelope({ schemaVersion: 99, submissions: [], safetyReports: [] }), false, 'incompatible envelopes are rejected explicitly');

  const mappedSubmission = mapFeedbackSubmission({
    id: '11111111-1111-4111-8111-111111111111',
    author_user_id: '22222222-2222-4222-8222-222222222222',
    target_type: 'event', target_id: FEEDBACK_DEMO_EVENT_ID, related_event_id: FEEDBACK_DEMO_EVENT_ID,
    overall_sentiment: 'positive', experience_scope: 'single_event', attendance_verification: 'platform_confirmed',
    structured_status: 'eligible', signal_registry_version: 1,
    signals: [{ signal_id: 'great_music', polarity: 'positive' }, { signal_id: 'smooth_check_in', polarity: 'improvement' }],
    written_experience: { current_draft_text: 'A revised draft', approved_text: 'The published version', moderation_status: 'pending', submitted_at: '2026-07-01T00:00:00Z', approved_at: '2026-06-01T00:00:00Z' },
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  });
  assert.equal(mappedSubmission.authorUserId, '22222222-2222-4222-8222-222222222222', 'snake_case submission identity maps to camelCase');
  assert.deepEqual(mappedSubmission.positiveSignalIds, ['great_music'], 'signal JSON maps to positive IDs');
  assert.equal(mappedSubmission.writtenExperience.approvedText, 'The published version', 'approved text remains separate from a pending draft');
  assert.equal(mappedSubmission.writtenExperience.moderationStatus, 'pending', 'pending revision status maps');
  assert.equal(mappedSubmission.attendanceVerification, 'platform_confirmed', 'server attendance verification maps');
  assert.equal(mappedSubmission.signalRegistryVersion, 1, 'registry version maps');

  const mappedWithdrawn = mapFeedbackSubmission({ ...mappedSubmission, authorUserId: mappedSubmission.authorUserId, signals: [], writtenExperience: mappedSubmission.writtenExperience, structuredStatus: 'withdrawn', withdrawnAt: '2026-07-02T00:00:00Z' });
  assert.equal(mappedWithdrawn.structuredStatus, 'withdrawn', 'terminal withdrawal state maps');
  assert.ok(mappedWithdrawn.withdrawnAt, 'withdrawal timestamp maps');

  const belowThreshold = mapFeedbackAggregate({ targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, threshold: 10, meetsThreshold: false });
  assert.equal(belowThreshold.status, 'insufficient_data', 'remote below-threshold aggregate maps');
  assert.equal(belowThreshold.eligibleResponseCount, null, 'hidden below-threshold count stays unknown');
  assert.equal(belowThreshold.sentimentPercentages, null, 'hidden below-threshold percentages stay absent');

  const publicAggregate = mapFeedbackAggregate({
    targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, threshold: 10, meetsThreshold: true, submissionCount: 10,
    sentimentPercentages: { positive: 70, mixed: 20, negative: 10 },
    signals: [{ signalId: 'great_music', polarity: 'positive', count: 7 }, { signalId: 'smooth_check_in', polarity: 'improvement', count: 3 }],
  });
  assert.equal(publicAggregate.status, 'public_ready', 'remote public aggregate maps');
  assert.equal(publicAggregate.mostPraisedSignals[0].percentage, 70, 'remote signal counts map to exact cohort percentages');

  const approvedWritten = mapApprovedWrittenExperience({ feedback_submission_id: '33333333-3333-4333-8333-333333333333', approved_text: 'Approved public experience', approved_at: '2026-07-03T00:00:00Z', overall_sentiment: 'mixed', experience_scope: 'single_event', author_display_name: 'Community Reviewer', author_handle: 'community-reviewer', author_user_id: 'must-not-leak' });
  assert.equal(approvedWritten.approvedText, 'Approved public experience', 'approved-written RPC row maps');
  assert.equal(approvedWritten.authorDisplayName, 'Community Reviewer', 'approved-written mapping includes the public author screen name');
  assert.equal(approvedWritten.authorHandle, 'community-reviewer', 'approved-written mapping includes the clickable public handle');
  assert.equal('authorUserId' in approvedWritten, false, 'approved-written mapping still drops the raw author UUID');

  const safetyReceipt = mapSafetyReportReceipt('44444444-4444-4444-8444-444444444444', { targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, categoryId: 'privacy_violation' });
  assert.equal(safetyReceipt.id, '44444444-4444-4444-8444-444444444444', 'UUID-only safety response maps to a safe receipt');
  assert.equal(validateSafetyReport({ authorUserId: 'user-test', targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, categoryId: 'privacy_violation', narrative: 'Private context for review.' }).valid, true, 'safety narrative validates separately from normal feedback');

  assert.equal(mapFeedbackRepositoryErrorCode({ code: '42501' }), 'permission_denied', 'permission errors map by stable Postgres code');
  assert.equal(mapFeedbackRepositoryErrorCode({ code: '23505' }), 'duplicate_submission', 'unique violations map to duplicate lifecycle errors');
  assert.equal(mapFeedbackRepositoryErrorCode({ message: 'Withdrawn feedback is terminal' }), 'withdrawn_terminal', 'terminal lifecycle errors map safely');
  assert.equal(mapFeedbackRepositoryErrorCode(new TypeError('Failed to fetch')), 'network_error', 'network failures map safely');

  const mockTarget = createMockEventFeedbackTarget(WINTER_MASQUERADE_SOURCE_EVENT_ID);
  assert.equal(mockTarget.sourceEventId, WINTER_MASQUERADE_SOURCE_EVENT_ID, 'source event identity is retained explicitly');
  assert.equal(mockTarget.feedbackTargetId, FEEDBACK_DEMO_EVENT_ID, 'mock feedback target identity remains deterministic');
  const resolved = await resolveEventFeedbackTarget(WINTER_MASQUERADE_SOURCE_EVENT_ID, 'supabase', async (sourceRef) => ({ id: 'backend-target-uuid', source_ref: sourceRef, status: 'active' }));
  assert.equal(resolved.feedbackTargetId, 'backend-target-uuid', 'generic resolver maps a source listing ID to the registered backend target');
  await assert.rejects(() => resolveEventFeedbackTarget('unregistered-event', 'supabase', async () => null), /not registered|available/i, 'resolver rejects listings without an active bridge record');

  assert.equal(selectFeedbackRepositoryMode({ VITE_FEEDBACK_REPOSITORY: 'mock', PROD: false }), 'mock', 'mock repository requires an explicit development setting');
  assert.equal(selectFeedbackRepositoryMode({ VITE_FEEDBACK_REPOSITORY: 'supabase', PROD: true }), 'supabase', 'production selects Supabase explicitly');
  assert.equal(selectFeedbackRepositoryMode({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable' }), 'supabase', 'configured Supabase credentials default to Supabase');
  assert.throws(() => selectFeedbackRepositoryMode({ PROD: true }), /Configure VITE_FEEDBACK_REPOSITORY/, 'missing production configuration never falls back to mock');
  assert.throws(() => selectFeedbackRepositoryMode({ VITE_FEEDBACK_REPOSITORY: 'mock', PROD: true }), /disabled in production/, 'production rejects localStorage mock mode');

  const rpcCalls = [];
  const rpcSubmissionFixture = {
    id: '55555555-5555-4555-8555-555555555555', authorUserId: 'auth-user', targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID,
    relatedEventId: FEEDBACK_DEMO_EVENT_ID, overallSentiment: 'positive', experienceScope: 'single_event', attendanceVerification: 'self_reported',
    structuredStatus: 'eligible', signalRegistryVersion: 1, signals: [{ signalId: 'great_music', polarity: 'positive' }], writtenExperience: null,
    createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
  };
  const fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user' } }, error: null }) },
    rpc: async (name, parameters) => {
      rpcCalls.push({ name, parameters });
      if (name === 'feedback_create_safety_report') return { data: '66666666-6666-4666-8666-666666666666', error: null };
      return { data: rpcSubmissionFixture, error: null };
    },
  };
  const supabaseRepository = new SupabaseFeedbackRepository(fakeSupabase);
  await supabaseRepository.createSubmission({ ...baseInput, targetId: FEEDBACK_DEMO_EVENT_ID, relatedEventId: FEEDBACK_DEMO_EVENT_ID, authorUserId: 'auth-user' });
  assert.equal(rpcCalls[0].name, 'feedback_create_submission', 'adapter calls the installed create RPC');
  assert.equal(rpcCalls[0].parameters.p_signal_registry_version, 1, 'adapter sends the exact registry parameter');
  assert.deepEqual(rpcCalls[0].parameters.p_signals, [{ signalId: 'great_music', polarity: 'positive' }], 'adapter maps canonical signal IDs to the RPC JSON payload');
  assert.equal('p_author_user_id' in rpcCalls[0].parameters, false, 'adapter never sends client authorship to create RPC');
  await supabaseRepository.createSafetyReport({ authorUserId: 'auth-user', targetType: 'event', targetId: FEEDBACK_DEMO_EVENT_ID, categoryId: 'privacy_violation', narrative: 'Private test context.', relatedEventId: FEEDBACK_DEMO_EVENT_ID });
  assert.equal(rpcCalls[1].parameters.p_narrative, 'Private test context.', 'adapter sends the required private narrative only to the safety RPC');
  assert.deepEqual(rpcCalls[1].parameters.p_evidence, [], 'adapter uses the installed evidence JSON parameter without fabricating evidence');

  console.log('Feedback foundation and Supabase adapter verification passed (62 checks).');
} finally {
  await server.close();
}
