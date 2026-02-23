import { useState } from 'react';
import { Loader2, Link2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  useLegacyLinks,
  useRespondToLink,
  useRevokeLink,
} from '@/features/legacy-link/hooks/useLegacyLinks';
import LinkRequestCard from './LinkRequestCard';
import LinkRequestDialog from './LinkRequestDialog';

export interface LegacyLinkPanelProps {
  legacyId: string;
  personId?: string | null;
  legacyName?: string;
}

export default function LegacyLinkPanel({ legacyId, personId, legacyName }: LegacyLinkPanelProps) {
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const { data: links, isLoading, error } = useLegacyLinks();
  const respondMutation = useRespondToLink();
  const revokeMutation = useRevokeLink();

  // Filter links relevant to this legacy
  const relevantLinks = links?.filter(
    (link) =>
      link.requester_legacy_id === legacyId ||
      link.target_legacy_id === legacyId
  ) ?? [];

  const pendingLinks = relevantLinks.filter((l) => l.status === 'pending');
  const activeLinks = relevantLinks.filter((l) => l.status === 'active');
  const pastLinks = relevantLinks.filter(
    (l) => l.status === 'rejected' || l.status === 'revoked'
  );

  const handleAccept = (linkId: string) => {
    respondMutation.mutate({ linkId, action: 'accept' });
  };

  const handleReject = (linkId: string) => {
    respondMutation.mutate({ linkId, action: 'reject' });
  };

  const handleRevoke = (linkId: string) => {
    revokeMutation.mutate(linkId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <p className="text-red-800">Failed to load legacy links</p>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {personId && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-600">
            Link this legacy to others about the same person to share stories and memories.
          </p>
          <Button
            size="sm"
            onClick={() => setShowRequestDialog(true)}
            className="bg-theme-primary hover:bg-theme-primary-dark shrink-0"
          >
            <Plus className="size-4 mr-1" />
            Request Link
          </Button>
        </div>
      )}

      {relevantLinks.length === 0 && (
        <Card className="p-8 text-center text-neutral-500">
          <Link2 className="size-12 mx-auto text-neutral-300 mb-4" />
          <p>No legacy links yet.</p>
          <p className="text-sm mt-1">
            {personId
              ? 'Use the "Request Link" button to connect with another legacy about the same person.'
              : 'When another legacy about the same person requests to link, it will appear here.'}
          </p>
        </Card>
      )}

      {pendingLinks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700">
            Pending Requests ({pendingLinks.length})
          </h3>
          {pendingLinks.map((link) => (
            <LinkRequestCard
              key={link.id}
              link={link}
              currentLegacyId={legacyId}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {activeLinks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700">
            Active Links ({activeLinks.length})
          </h3>
          {activeLinks.map((link) => (
            <LinkRequestCard
              key={link.id}
              link={link}
              currentLegacyId={legacyId}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}

      {pastLinks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700">
            Past Links ({pastLinks.length})
          </h3>
          {pastLinks.map((link) => (
            <LinkRequestCard
              key={link.id}
              link={link}
              currentLegacyId={legacyId}
            />
          ))}
        </div>
      )}

      {personId && (
        <LinkRequestDialog
          open={showRequestDialog}
          onOpenChange={setShowRequestDialog}
          legacyId={legacyId}
          personId={personId}
          legacyName={legacyName ?? ''}
        />
      )}
    </div>
  );
}
