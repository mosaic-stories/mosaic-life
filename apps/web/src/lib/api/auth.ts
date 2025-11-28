// Auth API functions
import { apiGet, apiPost } from './client';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export async function getMe(): Promise<User> {
  return apiGet<User>('/api/me');
}

export async function logout(): Promise<void> {
  return apiPost<void>('/api/auth/logout');
}
