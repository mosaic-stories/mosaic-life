import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSubmitAccessRequest } from '../hooks/useLegacyAccess';

interface LegacyAccessRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  legacyName: string;
}

export default function LegacyAccessRequestDialog({
  open,
  onOpenChange,
  legacyId,
  legacyName,
}: LegacyAccessRequestDialogProps) {
  const [requestedRole, setRequestedRole] = useState<'admirer' | 'advocate'>(
    'admirer'
  );
  const [message, setMessage] = useState('');
  const submitRequest = useSubmitAccessRequest();

  const handleSubmit = async () => {
    try {
      await submitRequest.mutateAsync({
        legacyId,
        data: {
          requested_role: requestedRole,
          message: message.trim() || null,
        },
      });
      onOpenChange(false);
      setMessage('');
      setRequestedRole('admirer');
    } catch {
      // Error available via submitRequest.error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Access to {legacyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Requested Role</Label>
            <Select
              value={requestedRole}
              onValueChange={(v) =>
                setRequestedRole(v as 'admirer' | 'advocate')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admirer">
                  Admirer — View and appreciate
                </SelectItem>
                <SelectItem value="advocate">
                  Advocate — Contribute stories
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Message <span className="text-neutral-400">(optional)</span>
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell them how you knew the subject..."
              maxLength={500}
              rows={3}
            />
          </div>
          {submitRequest.error && (
            <p className="text-sm text-destructive">
              {(submitRequest.error as { data?: { detail?: string } })?.data
                ?.detail || 'Failed to submit request'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitRequest.isPending}>
            {submitRequest.isPending && (
              <Loader2 className="size-4 animate-spin mr-2" />
            )}
            Request Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
