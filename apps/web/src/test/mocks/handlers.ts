import { http, HttpResponse } from 'msw';

// Default mock data
const defaultUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
};

export const handlers = [
  // Auth
  http.get('/api/me', () => {
    return HttpResponse.json(defaultUser);
  }),

  http.post('/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Legacies
  http.get('/api/legacies/', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/legacies/:id', () => {
    return HttpResponse.json({
      id: 'legacy-1',
      name: 'Test Legacy',
    });
  }),

  // Stories
  http.get('/api/stories/:id', () => {
    return HttpResponse.json({
      id: 'story-1',
      title: 'Test Story',
      content: 'Test content',
      visibility: 'private',
      legacies: [],
      version_count: 1,
    });
  }),

  // Versions
  http.get('/api/stories/:storyId/versions', () => {
    return HttpResponse.json({
      versions: [],
      total: 0,
      page: 1,
      page_size: 20,
      warning: null,
    });
  }),

  http.get('/api/stories/:storyId/versions/:versionNumber', () => {
    return HttpResponse.json({
      version_number: 1,
      title: 'Test Story',
      content: 'Test content',
      status: 'active',
      source: 'creation',
      source_version: null,
      change_summary: null,
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-15T10:00:00Z',
    });
  }),

  // Media
  http.get('/api/media/', () => {
    return HttpResponse.json([]);
  }),
];
