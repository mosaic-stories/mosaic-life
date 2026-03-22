import { describe, expect, it } from 'vitest';
import { resolveNotificationLink } from './notificationRouting';

describe('resolveNotificationLink', () => {
  it('prefers the backend-provided link when present', () => {
    expect(
      resolveNotificationLink({
        type: 'connection_request_received',
        link: '/custom-path',
        resource_id: 'request-1',
      })
    ).toBe('/custom-path');
  });

  it('derives a requests deep link for incoming connection notifications', () => {
    expect(
      resolveNotificationLink({
        type: 'connection_request_received',
        link: null,
        resource_id: 'request-1',
      })
    ).toBe('/my/conversations?tab=requests&filter=all&focus=incoming&request=request-1');
  });

  it('derives a connection deep link for accepted connection notifications', () => {
    expect(
      resolveNotificationLink({
        type: 'connection_request_accepted',
        link: null,
        resource_id: 'connection-1',
      })
    ).toBe(
      '/my/conversations?tab=my-connections&filter=all&connection=connection-1'
    );
  });
});
