export type FeedbackRepositoryErrorCode =
  | 'not_authenticated'
  | 'target_not_registered'
  | 'submission_not_found'
  | 'duplicate_submission'
  | 'withdrawn_terminal'
  | 'invalid_signal'
  | 'unsupported_registry_version'
  | 'permission_denied'
  | 'network_error'
  | 'server_error';

const SAFE_MESSAGES: Record<FeedbackRepositoryErrorCode, string> = {
  not_authenticated: 'Sign in to continue with feedback.',
  target_not_registered: 'Feedback is not available for this event yet.',
  submission_not_found: 'Your feedback submission could not be found.',
  duplicate_submission: 'You already have feedback for this experience.',
  withdrawn_terminal: 'Withdrawn feedback cannot be changed or submitted again.',
  invalid_signal: 'One or more feedback selections are no longer available. Refresh and try again.',
  unsupported_registry_version: 'The feedback prompts have changed. Refresh and try again.',
  permission_denied: 'You do not have permission to perform this feedback action.',
  network_error: 'Feedback is temporarily unavailable. Check your connection and try again.',
  server_error: 'Feedback is temporarily unavailable. Please try again later.',
};

export class FeedbackRepositoryError extends Error {
  constructor(public readonly code: FeedbackRepositoryErrorCode, message = SAFE_MESSAGES[code]) {
    super(message);
    this.name = 'FeedbackRepositoryError';
  }
}

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
};

export const mapFeedbackRepositoryErrorCode = (error: unknown): FeedbackRepositoryErrorCode => {
  const candidate = (error ?? {}) as SupabaseErrorLike;
  const code = candidate.code?.toUpperCase() ?? '';
  const message = `${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase();
  if (code === '28000' || code === 'PGRST301' || message.includes('authentication required') || message.includes('not authenticated')) return 'not_authenticated';
  if (code === '42501' || candidate.status === 401 || candidate.status === 403) return 'permission_denied';
  if (code === '23505' || message.includes('duplicate') || message.includes('already exists')) return 'duplicate_submission';
  if (message.includes('withdrawn feedback is terminal') || message.includes('active submission not found')) return 'withdrawn_terminal';
  if (message.includes('unsupported registry version')) return 'unsupported_registry_version';
  if (message.includes('invalid signal') || message.includes('unknown signal') || message.includes('signal cannot use both polarities') || message.includes('not applicable')) return 'invalid_signal';
  if (message.includes('unknown active event') || message.includes('unknown event') || message.includes('unknown active club') || message.includes('unknown organization')) return 'target_not_registered';
  if (message.includes('submission not found') || code === 'PGRST116') return 'submission_not_found';
  if (!code && (error instanceof TypeError || message.includes('fetch') || message.includes('network'))) return 'network_error';
  return 'server_error';
};

export const toFeedbackRepositoryError = (error: unknown): FeedbackRepositoryError => (
  error instanceof FeedbackRepositoryError
    ? error
    : new FeedbackRepositoryError(mapFeedbackRepositoryErrorCode(error))
);
