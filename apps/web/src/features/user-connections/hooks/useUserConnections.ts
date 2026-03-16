import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createConnectionRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptRequest,
  declineRequest,
  cancelRequest,
  listConnections,
  removeConnection,
  getConnectionRelationship,
  updateConnectionRelationship,
  type ConnectionRequestCreate,
  type RelationshipUpdate,
} from '../api/userConnections';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes — connections change more often

export const userConnectionKeys = {
  all: ['user-connections'] as const,
  connections: () => [...userConnectionKeys.all, 'list'] as const,
  incomingRequests: () => [...userConnectionKeys.all, 'incoming'] as const,
  outgoingRequests: () => [...userConnectionKeys.all, 'outgoing'] as const,
  relationship: (id: string) =>
    [...userConnectionKeys.all, 'relationship', id] as const,
};

// --- Connection Queries ---

export function useMyConnections() {
  return useQuery({
    queryKey: userConnectionKeys.connections(),
    queryFn: listConnections,
    staleTime: STALE_TIME,
  });
}

export function useIncomingRequests() {
  return useQuery({
    queryKey: userConnectionKeys.incomingRequests(),
    queryFn: getIncomingRequests,
    staleTime: STALE_TIME,
  });
}

export function useOutgoingRequests() {
  return useQuery({
    queryKey: userConnectionKeys.outgoingRequests(),
    queryFn: getOutgoingRequests,
    staleTime: STALE_TIME,
  });
}

export function useConnectionRelationship(connectionId: string) {
  return useQuery({
    queryKey: userConnectionKeys.relationship(connectionId),
    queryFn: () => getConnectionRelationship(connectionId),
    staleTime: STALE_TIME,
    enabled: !!connectionId,
  });
}

// --- Connection Mutations ---

export function useCreateConnectionRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConnectionRequestCreate) =>
      createConnectionRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.outgoingRequests(),
      });
    },
  });
}

export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => acceptRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.all,
      });
    },
  });
}

export function useDeclineRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => declineRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.incomingRequests(),
      });
    },
  });
}

export function useCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.outgoingRequests(),
      });
    },
  });
}

export function useRemoveConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => removeConnection(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.connections(),
      });
    },
  });
}

export function useUpdateRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      data,
    }: {
      connectionId: string;
      data: RelationshipUpdate;
    }) => updateConnectionRelationship(connectionId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.relationship(variables.connectionId),
      });
    },
  });
}
