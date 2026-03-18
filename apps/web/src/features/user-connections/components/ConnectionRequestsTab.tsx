import { Loader2, Inbox, Send } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import UserLink from '@/components/UserLink';
import {
  useIncomingRequests,
  useOutgoingRequests,
  useAcceptRequest,
  useDeclineRequest,
  useCancelRequest,
} from '../hooks/useUserConnections';
import { formatDistanceToNow } from 'date-fns';
import type { ConnectionRequestResponse } from '../api/userConnections';

function IncomingRequestCard({
  request,
}: {
  request: ConnectionRequestResponse;
}) {
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <UserLink
          username={request.from_user_username}
          displayName={request.from_user_name}
          avatarUrl={request.from_user_avatar_url}
          showAvatar
          avatarClassName="size-11"
          className="font-medium text-neutral-900"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <Badge variant="outline" className="text-xs mt-1">
              {request.relationship_type}
            </Badge>
          </div>
          {request.message && (
            <p className="text-sm text-neutral-600">{request.message}</p>
          )}
          <p className="text-xs text-neutral-400">
            {formatDistanceToNow(new Date(request.created_at), {
              addSuffix: true,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => acceptRequest.mutate(request.id)}
              disabled={acceptRequest.isPending}
            >
              {acceptRequest.isPending && (
                <Loader2 className="size-3 animate-spin mr-1" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => declineRequest.mutate(request.id)}
              disabled={declineRequest.isPending}
            >
              Decline
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function OutgoingRequestCard({
  request,
}: {
  request: ConnectionRequestResponse;
}) {
  const cancelRequest = useCancelRequest();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <UserLink
          username={request.to_user_username}
          displayName={request.to_user_name}
          avatarUrl={request.to_user_avatar_url}
          showAvatar
          avatarClassName="size-11"
          className="font-medium text-neutral-900"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <Badge variant="outline" className="text-xs mt-1">
              {request.relationship_type}
            </Badge>
          </div>
          {request.message && (
            <p className="text-sm text-neutral-600">{request.message}</p>
          )}
          <p className="text-xs text-neutral-400">
            Sent{' '}
            {formatDistanceToNow(new Date(request.created_at), {
              addSuffix: true,
            })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => cancelRequest.mutate(request.id)}
            disabled={cancelRequest.isPending}
          >
            Cancel Request
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function ConnectionRequestsTab() {
  const [searchParams] = useSearchParams();
  const { data: incoming, isLoading: incomingLoading } = useIncomingRequests();
  const { data: outgoing, isLoading: outgoingLoading } = useOutgoingRequests();
  const highlightedRequestId = searchParams.get('request');
  const focus = searchParams.get('focus');

  const isLoading = incomingLoading || outgoingLoading;

  useEffect(() => {
    if (!highlightedRequestId) {
      return;
    }

    const sectionPrefix =
      focus === 'outgoing' ? 'connection-outgoing' : 'connection-incoming';
    const target = document.getElementById(
      `${sectionPrefix}-${highlightedRequestId}`
    );
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedRequestId, focus, incoming, outgoing]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  const hasIncoming = incoming && incoming.length > 0;
  const hasOutgoing = outgoing && outgoing.length > 0;

  if (!hasIncoming && !hasOutgoing) {
    return (
      <div className="text-center py-12 space-y-3">
        <Inbox className="size-12 text-neutral-300 mx-auto" />
        <p className="text-neutral-500">No pending requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {hasIncoming && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700 flex items-center gap-2">
            <Inbox className="size-4" />
            Incoming Requests ({incoming.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {incoming.map((req) => (
              <div
                key={req.id}
                id={`connection-incoming-${req.id}`}
                className={
                  req.id === highlightedRequestId
                    ? 'rounded-lg ring-2 ring-theme-primary ring-offset-2'
                    : undefined
                }
              >
                <IncomingRequestCard request={req} />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOutgoing && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700 flex items-center gap-2">
            <Send className="size-4" />
            Outgoing Requests ({outgoing.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {outgoing.map((req) => (
              <div
                key={req.id}
                id={`connection-outgoing-${req.id}`}
                className={
                  req.id === highlightedRequestId
                    ? 'rounded-lg ring-2 ring-theme-primary ring-offset-2'
                    : undefined
                }
              >
                <OutgoingRequestCard request={req} />
              </div>
            ))}
          </div>
        </div>
      )}

      {highlightedRequestId &&
        ((focus === 'incoming' && !incoming?.some((req) => req.id === highlightedRequestId)) ||
          (focus === 'outgoing' && !outgoing?.some((req) => req.id === highlightedRequestId))) && (
          <p className="text-sm text-neutral-500">
            This request is no longer pending. Recent updates are still available in
            your notification history.
          </p>
        )}
    </div>
  );
}
