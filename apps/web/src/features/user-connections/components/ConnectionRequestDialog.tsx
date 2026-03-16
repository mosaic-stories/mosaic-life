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
import { useCreateConnectionRequest } from '../hooks/useUserConnections';

const RELATIONSHIP_TYPES = [
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'other', label: 'Other' },
];

interface ConnectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toUserId: string;
  toUserName: string;
}

export default function ConnectionRequestDialog({
  open,
  onOpenChange,
  toUserId,
  toUserName,
}: ConnectionRequestDialogProps) {
  const [relationshipType, setRelationshipType] = useState('');
  const [message, setMessage] = useState('');
  const createRequest = useCreateConnectionRequest();

  const handleSubmit = async () => {
    if (!relationshipType) return;
    try {
      await createRequest.mutateAsync({
        to_user_id: toUserId,
        relationship_type: relationshipType,
        message: message.trim() || null,
      });
      onOpenChange(false);
      setRelationshipType('');
      setMessage('');
    } catch {
      // Error is available via createRequest.error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with {toUserName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>How do you know them?</Label>
            <Select value={relationshipType} onValueChange={setRelationshipType}>
              <SelectTrigger>
                <SelectValue placeholder="Select relationship type" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
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
              placeholder="Add a personal note..."
              maxLength={500}
              rows={3}
            />
          </div>
          {createRequest.error && (
            <p className="text-sm text-destructive">
              {(createRequest.error as { data?: { detail?: string } })?.data
                ?.detail || 'Failed to send request'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!relationshipType || createRequest.isPending}
          >
            {createRequest.isPending && (
              <Loader2 className="size-4 animate-spin mr-2" />
            )}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
