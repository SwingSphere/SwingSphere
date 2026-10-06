import { supabase } from './supabase';
import { getAnonymousSessionId } from './analytics/outboundTracking';

export type IssueCategory = 'listing' | 'broken_link' | 'bug' | 'content_safety' | 'other';
export type IssueStatus = 'new' | 'in_review' | 'resolved' | 'dismissed';
export const issueCategories: Array<{ value: IssueCategory; label: string }> = [
  { value: 'listing', label: 'Incorrect or outdated listing information' },
  { value: 'broken_link', label: 'Broken link or missing image' },
  { value: 'bug', label: 'Something on the site is not working' },
  { value: 'content_safety', label: 'Content or safety concern' },
  { value: 'other', label: 'Something else' },
];
export const issueStatusLabels: Record<IssueStatus, string> = { new: 'New', in_review: 'In review', resolved: 'Resolved', dismissed: 'Dismissed' };
export type SiteIssue = {
  id: string; pagePath: string; pageTitle: string; category: IssueCategory; description: string; status: IssueStatus;
  createdAt: string; updatedAt: string; fromMember: boolean;
  actions: Array<{ previousStatus: IssueStatus; nextStatus: IssueStatus; note: string; createdAt: string }>;
};
const fail = (error: { code?: string; message?: string }): never => {
  if (error.code === 'P0001' || error.code === '22023' || error.code === '42501') throw new Error(error.message || 'Unable to submit this report.');
  throw new Error('Reporting is unavailable right now. Please try again later or use Contact.');
};
export const submitSiteIssue = async (input: { pagePath: string; pageTitle: string; category: IssueCategory; description: string; website: string }): Promise<string> => {
  const { data, error } = await supabase.rpc('submit_site_issue', {
    p_session_id: getAnonymousSessionId(), p_page_path: input.pagePath.split(/[?#]/)[0], p_page_title: input.pageTitle,
    p_category: input.category, p_description: input.description.trim(), p_website: input.website,
  });
  if (error) fail(error);
  if (typeof data !== 'string' || !data) throw new Error('The report could not be confirmed. Please try again.');
  return data;
};
export const getAdminSiteIssues = async (status = 'open', offset = 0, limit = 50): Promise<{ items: SiteIssue[]; total: number }> => {
  const { data, error } = await supabase.rpc('admin_list_site_issues', { p_status: status, p_offset: offset, p_limit: limit });
  if (error) throw new Error(error.message || 'Unable to load reports.');
  return data as { items: SiteIssue[]; total: number };
};
// Keep administration usable while the issue-inbox migration is pending, without
// presenting mock flags or an invented empty count.
export const getOpenSiteIssueCount = async (): Promise<number | null> => {
  const { data, error } = await supabase.rpc('admin_list_site_issues', { p_status: 'open', p_offset: 0, p_limit: 1 });
  if (error) return null;
  return Number((data as { total: number }).total);
};
export const updateAdminSiteIssue = async (id: string, status: IssueStatus, note: string): Promise<void> => {
  const { error } = await supabase.rpc('admin_update_site_issue', { p_id: id, p_status: status, p_note: note });
  if (error) throw new Error(error.message || 'Unable to update report.');
};
