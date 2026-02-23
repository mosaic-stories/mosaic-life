import { Check, X, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LegacyLinkResponse } from '@/features/legacy-link/api/legacyLinks';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  active: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
  revoked: 'bg-neutral-100 text-neutral-600 border-neutral-300',
};

export interface LinkRequestCardProps {
  link: LegacyLinkResponse;
  currentLegacyId: string;
  onAccept?: (linkId: string) => void;
  onReject?: (linkId: string) => void;
  onRevoke?: (linkId: string) => void;
}

export default function LinkRequestCard({
  link,
  currentLegacyId,
  onAccept,
  onReject,
  onRevoke,
}: LinkRequestCardProps) {
  const isRequester = link.requester_legacy_id === currentLegacyId;
  const otherLegacyName = isRequester
    ? link.target_legacy_name
    : link.requester_legacy_name;
  const isPending = link.status === 'pending';
  const isActive = link.status === 'active';
  const canRespond = isPending && !isRequester;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-neutral-500" />
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {otherLegacyName || 'Unknown Legacy'}
            </p>
            {link.person_name && (
              <p className="text-xs text-neutral-500">
                Person: {link.person_name}
              </p>
            )}
          </div>
        </div>
        <Badge className={statusColors[link.status] || statusColors.revoked}>
          {link.status}
        </Badge>
      </div>

      <div className="text-xs text-neutral-500">
        {isRequester ? 'You requested this link' : 'They requested to link with you'}
        {' · '}
        {new Date(link.requested_at).toLocaleDateString()}
      </div>

      <div className="flex gap-2">
        {canRespond && (
          <>
            <Button
              size="sm"
              onClick={() => onAccept?.(link.id)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="size-3 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject?.(link.id)}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <X className="size-3 mr-1" />
              Reject
            </Button>
          </>
        )}
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRevoke?.(link.id)}
            className="text-neutral-600"
          >
            <Unlink className="size-3 mr-1" />
            Revoke Link
          </Button>
        )}
      </div>
    </Card>
  );
}
