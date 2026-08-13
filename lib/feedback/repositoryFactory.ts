import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { FeedbackRepositoryError } from './errors';
import { MockFeedbackRepository } from './mockFeedbackRepository';
import { SupabaseFeedbackRepository } from './supabaseFeedbackRepository';
import type { FeedbackRepository } from './types';

export type FeedbackRepositoryMode = 'supabase' | 'mock';
type FeedbackEnvironment = {
  VITE_FEEDBACK_REPOSITORY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  PROD?: boolean;
};

export const selectFeedbackRepositoryMode = (environment: FeedbackEnvironment): FeedbackRepositoryMode => {
  const configured = environment.VITE_FEEDBACK_REPOSITORY?.trim().toLowerCase();
  if (configured && configured !== 'supabase' && configured !== 'mock') throw new FeedbackRepositoryError('server_error', 'VITE_FEEDBACK_REPOSITORY must be “supabase” or “mock”.');
  if (configured === 'mock') {
    if (environment.PROD) throw new FeedbackRepositoryError('server_error', 'Mock feedback storage is disabled in production.');
    return 'mock';
  }
  if (configured === 'supabase') return 'supabase';
  if (environment.VITE_SUPABASE_URL && environment.VITE_SUPABASE_PUBLISHABLE_KEY) return 'supabase';
  throw new FeedbackRepositoryError('server_error', 'Configure VITE_FEEDBACK_REPOSITORY explicitly.');
};

export const createFeedbackRepository = (
  mode: FeedbackRepositoryMode,
  client: SupabaseClient = supabase,
): FeedbackRepository => mode === 'mock' ? new MockFeedbackRepository() : new SupabaseFeedbackRepository(client);

export const feedbackRepositoryMode = selectFeedbackRepositoryMode(import.meta.env);
export const feedbackRepository = createFeedbackRepository(feedbackRepositoryMode);
