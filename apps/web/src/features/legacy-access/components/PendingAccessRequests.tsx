import { useState } from 'react';
import { Loader2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  usePendingAccessRequests,
  useApproveAccessRequest,
  useDeclineAccessRequest,
} from '../hooks/useLegacyAccess';
import type { LegacyAccessRequestResponse } from '../api/legacyAccess';

function AccessRequestCard({
  request,
  legacyId,
}: {
  request: LegacyAccessRequestResponse;
  legacyId: string;
}) {
  const [assignedRole, setAssignedRole] = useState(request.requested_role);
  const approveRequest = useApproveAccessRequest();
  const declineRequest = useDeclineAccessRequest();

  const initials = request.user_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="p-3 rounded-lg border border-dashed space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={request.user_avatar_url || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{request.user_name}</p>
          <p className="text-xs text-muted-foreground">
            Requested as{' '}
            <Badge variant="outline" className="text-xs">
              {request.requested_role}
            </Badge>
          </p>
        </div>
      </div>

      {request.message && (
        <p className="text-sm text-neutral-600 italic">
          &ldquo;{request.message}&rdquo;
        </p>
      )}

      {request.connected_members && request.connected_members.length > 0 && (
        <div className="text-xs text-neutral-500">
          <span className="font-medium">Known by: </span>
          {request.connected_members
            .map((m) => m.display_name)
            .join(', ')}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={assignedRole} onValueChange={setAssignedRole}>
          <SelectTrigger className="w-28 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admirer">Admirer</SelectItem>
            <SelectItem value="advocate">Advocate</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() =>
            approveRequest.mutate({
              legacyId,
              requestId: request.id,
              data: {
                assigned_role: assignedRole as
                  | 'admirer'
                  | 'advocate'
                  | 'admin',
              },
            })
          }
          disabled={approveRequest.isPending}
        >
          {approveRequest.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            'Approve'
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            declineRequest.mutate({ legacyId, requestId: request.id })
          }
          disabled={declineRequest.isPending}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

interface PendingAccessRequestsProps {
  legacyId: string;
  canManage: boolean;
}

export default function PendingAccessRequests({
  legacyId,
  canManage,
}: PendingAccessRequestsProps) {
  const { data: requests, isLoading } = usePendingAccessRequests(legacyId, {
    enabled: canManage,
  });

  if (!canManage || isLoading || !requests || requests.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div>
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <KeyRound className="size-4" />
          Pending Access Requests ({requests.length})
        </h3>
        <div className="space-y-3">
          {requests.map((request) => (
            <AccessRequestCard
              key={request.id}
              request={request}
              legacyId={legacyId}
            />
          ))}
        </div>
      </div>
    </>
  );
}
