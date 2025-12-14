/**
 * TanStack Query hooks for support requests.
 */

import { useMutation } from '@tanstack/react-query';

import {
  createSupportRequest,
  SupportRequestCreate,
} from '../api/support';

export function useCreateSupportRequest() {
  return useMutation({
    mutationFn: (data: SupportRequestCreate) => createSupportRequest(data),
  });
}
