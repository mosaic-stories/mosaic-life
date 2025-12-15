/**
 * Support API client for help requests.
 */

import { apiPost } from './client';

// Types
export interface SupportContext {
  page_url: string;
  timestamp: string;
  user_agent: string;
  legacy_id: string | null;
  session_duration_seconds: number | null;
  recent_errors: string[];
}

export interface SupportRequestCreate {
  category:
    | 'general_question'
    | 'bug_report'
    | 'feature_request'
    | 'account_issue'
    | 'other';
  subject: string;
  message: string;
  context: SupportContext;
}

export interface SupportRequestResponse {
  id: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
}

// API Functions
export async function createSupportRequest(
  data: SupportRequestCreate
): Promise<SupportRequestResponse> {
  return apiPost<SupportRequestResponse>('/api/support/request', data);
}
