import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FeedbackRepositoryError,
  feedbackRepositoryMode,
  feedbackService,
  resolveClubFeedbackTarget,
  toFeedbackRepositoryError,
  type ClubFeedbackTarget,
  type FeedbackAggregate,
  type FeedbackApprovedWrittenExperience,
  type FeedbackDraft,
  type FeedbackSafetyReportReceipt,
  type FeedbackSubmission,
  type SubmitSafetyConcernInput,
} from '../lib/feedback';
import type { FeedbackLoadState, FeedbackMutationState, FeedbackTargetState } from './useEventFeedback';

type UseClubFeedbackInput = {
  sourceClubId: string;
  currentUserId?: string | null;
  isAuthLoading: boolean;
};

export const useClubFeedback = ({ sourceClubId, currentUserId, isAuthLoading }: UseClubFeedbackInput) => {
  const [target, setTarget] = useState<ClubFeedbackTarget | null>(null);
  const [targetState, setTargetState] = useState<FeedbackTargetState>('resolving');
  const [aggregate, setAggregate] = useState<FeedbackAggregate | null>(null);
  const [approvedWritten, setApprovedWritten] = useState<FeedbackApprovedWrittenExperience[]>([]);
  const [aggregateState, setAggregateState] = useState<FeedbackLoadState>('idle');
  const [existingSubmission, setExistingSubmission] = useState<FeedbackSubmission | null>(null);
  const [privateState, setPrivateState] = useState<FeedbackLoadState>('idle');
  const [mutationState, setMutationState] = useState<FeedbackMutationState>('idle');
  const [error, setError] = useState<FeedbackRepositoryError | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const generationRef = useRef(0);
  const mutationRef = useRef<FeedbackMutationState>('idle');

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    const generation = ++generationRef.current;
    setTarget(null);
    setTargetState('resolving');
    setAggregate(null);
    setApprovedWritten([]);
    setAggregateState('idle');
    setExistingSubmission(null);
    setPrivateState(isAuthLoading ? 'loading' : 'idle');
    setError(null);

    const load = async () => {
      let resolved: ClubFeedbackTarget;
      try {
        resolved = await resolveClubFeedbackTarget(sourceClubId, feedbackRepositoryMode);
      } catch (cause) {
        if (generation !== generationRef.current) return;
        const mapped = toFeedbackRepositoryError(cause);
        setError(mapped);
        setTargetState(mapped.code === 'target_not_registered' ? 'unavailable' : 'error');
        setPrivateState('idle');
        return;
      }
      if (generation !== generationRef.current) return;
      setTarget(resolved);
      setTargetState('ready');
      setAggregateState('loading');
      if (!isAuthLoading) setPrivateState(currentUserId ? 'loading' : 'ready');

      const aggregatePromise = feedbackService.getAggregate('club', resolved.feedbackTargetId);
      const approvedWrittenPromise = feedbackService.listApprovedWritten('club', resolved.feedbackTargetId, 2, 0);
      const privatePromise = !isAuthLoading && currentUserId
        ? feedbackService.getUserSubmission('club', resolved.feedbackTargetId, currentUserId)
        : Promise.resolve(null);
      const [aggregateResult, approvedWrittenResult, privateResult] = await Promise.allSettled([
        aggregatePromise,
        approvedWrittenPromise,
        privatePromise,
      ]);
      if (generation !== generationRef.current) return;
      if (aggregateResult.status === 'fulfilled') {
        setAggregate(aggregateResult.value);
        setAggregateState('ready');
      } else {
        setAggregateState('error');
        setError(toFeedbackRepositoryError(aggregateResult.reason));
      }
      setApprovedWritten(approvedWrittenResult.status === 'fulfilled' ? approvedWrittenResult.value : []);
      if (!isAuthLoading) {
        if (privateResult.status === 'fulfilled') {
          setExistingSubmission(currentUserId ? privateResult.value : null);
          setPrivateState('ready');
        } else {
          setExistingSubmission(null);
          setPrivateState('error');
          setError(toFeedbackRepositoryError(privateResult.reason));
        }
      }
    };

    void load();
    return () => { generationRef.current += 1; };
  }, [currentUserId, isAuthLoading, refreshVersion, sourceClubId]);

  const runMutation = useCallback(async <T,>(state: FeedbackMutationState, operation: () => Promise<T>): Promise<T> => {
    if (mutationRef.current !== 'idle') throw new FeedbackRepositoryError('server_error', 'A feedback update is already in progress.');
    mutationRef.current = state;
    setMutationState(state);
    setError(null);
    try {
      const result = await operation();
      refresh();
      return result;
    } catch (cause) {
      const mapped = toFeedbackRepositoryError(cause);
      setError(mapped);
      throw mapped;
    } finally {
      mutationRef.current = 'idle';
      setMutationState('idle');
    }
  }, [refresh]);

  const submitFeedback = useCallback((draft: FeedbackDraft): Promise<FeedbackSubmission> => {
    if (!target || !currentUserId) return Promise.reject(new FeedbackRepositoryError(currentUserId ? 'target_not_registered' : 'not_authenticated'));
    const mode = existingSubmission ? 'updating' : 'creating';
    return runMutation(mode, () => feedbackService.submitFeedback({ ...draft, targetType: 'club', targetId: target.feedbackTargetId }, { authorUserId: currentUserId }));
  }, [currentUserId, existingSubmission, runMutation, target]);

  const withdrawFeedback = useCallback((): Promise<FeedbackSubmission> => {
    if (!existingSubmission || !currentUserId) return Promise.reject(new FeedbackRepositoryError(existingSubmission ? 'not_authenticated' : 'submission_not_found'));
    return runMutation('withdrawing', () => feedbackService.withdrawFeedback(existingSubmission.id, currentUserId));
  }, [currentUserId, existingSubmission, runMutation]);

  const submitSafetyConcern = useCallback((input: Omit<SubmitSafetyConcernInput, 'authorUserId' | 'targetType' | 'targetId'>): Promise<FeedbackSafetyReportReceipt> => {
    if (!target || !currentUserId) return Promise.reject(new FeedbackRepositoryError(currentUserId ? 'target_not_registered' : 'not_authenticated'));
    return runMutation('creating_safety_report', () => feedbackService.submitSafetyConcern({
      ...input,
      authorUserId: currentUserId,
      targetType: 'club',
      targetId: target.feedbackTargetId,
    }));
  }, [currentUserId, runMutation, target]);

  return {
    repositoryMode: feedbackRepositoryMode,
    target,
    targetState,
    aggregate,
    approvedWritten,
    aggregateState,
    existingSubmission,
    privateState,
    mutationState,
    error,
    refresh,
    submitFeedback,
    withdrawFeedback,
    submitSafetyConcern,
  };
};
