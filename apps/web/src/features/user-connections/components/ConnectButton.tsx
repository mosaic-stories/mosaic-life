import { useState, useMemo } from 'react';
import { UserPlus, UserCheck, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMyConnections,
  useIncomingRequests,
  useOutgoingRequests,
  useAcceptRequest,
  useDeclineRequest,
  useRemoveConnection,
} from '../hooks/useUserConnections';
import ConnectionRequestDialog from './ConnectionRequestDialog';

interface ConnectButtonProps {
  targetUserId: string;
  targetUserName: string;
}

type ConnectionState =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'connected'
  | 'loading';

export default function ConnectButton({
  targetUserId,
  targetUserName,
}: ConnectButtonProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: connections } = useMyConnections();
  const { data: outgoing } = useOutgoingRequests();
  const { data: incoming } = useIncomingRequests();
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();
  const removeConnection = useRemoveConnection();

  // Don't show button for own profile or when not authenticated
  if (!user || user.id === targetUserId) return null;

  const state: ConnectionState = useMemo(() => {
    if (!connections || !outgoing || !incoming) return 'loading';

    const existingConnection = connections.find(
      (c) => c.user_id === targetUserId
    );
    if (existingConnection) return 'connected';

    const outgoingRequest = outgoing.find(
      (r) => r.to_user_id === targetUserId
    );
    if (outgoingRequest) return 'pending_sent';

    const incomingRequest = incoming.find(
      (r) => r.from_user_id === targetUserId
    );
    if (incomingRequest) return 'pending_received';

    return 'none';
  }, [connections, outgoing, incoming, targetUserId]);

  const connectionId = connections?.find(
    (c) => c.user_id === targetUserId
  )?.id;
  const incomingRequestId = incoming?.find(
    (r) => r.from_user_id === targetUserId
  )?.id;

  if (state === 'loading') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  if (state === 'connected' && connectionId) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <UserCheck className="size-4 mr-2" />
            Connected
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => removeConnection.mutate(connectionId)}
          >
            Remove Connection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (state === 'pending_sent') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Clock className="size-4 mr-2" />
        Request Pending
      </Button>
    );
  }

  if (state === 'pending_received' && incomingRequestId) {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => acceptRequest.mutate(incomingRequestId)}
          disabled={acceptRequest.isPending}
        >
          Accept
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => declineRequest.mutate(incomingRequestId)}
          disabled={declineRequest.isPending}
        >
          Decline
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setDialogOpen(true)}>
        <UserPlus className="size-4 mr-2" />
        Connect
      </Button>
      <ConnectionRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        toUserId={targetUserId}
        toUserName={targetUserName}
      />
    </>
  );
}
