import { useState } from 'react';
import { AlertCircle, Mail, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { useSendInvitation } from '@/lib/hooks/useInvitations';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  legacyId: string;
  currentUserRole: string;
  onInviteSent: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator - Full control, can delete legacy',
  admin: 'Admin - Can manage members and content',
  advocate: 'Advocate - Can contribute stories and media',
  admirer: 'Admirer - Can view only',
};

const ROLE_LEVELS: Record<string, number> = {
  creator: 4,
  admin: 3,
  advocate: 2,
  admirer: 1,
};

export default function InviteMemberModal({
  isOpen,
  onClose,
  legacyId,
  currentUserRole,
  onInviteSent,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'creator' | 'admin' | 'advocate' | 'admirer'>('advocate');
  const [error, setError] = useState<string | null>(null);

  const sendInvitation = useSendInvitation();

  const currentUserLevel = ROLE_LEVELS[currentUserRole] || 0;

  const getInvitableRoles = () => {
    const allRoles: Array<'creator' | 'admin' | 'advocate' | 'admirer'> = [
      'admirer',
      'advocate',
      'admin',
      'creator',
    ];
    return allRoles.filter((r) => ROLE_LEVELS[r] <= currentUserLevel);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter an email address.');
      return;
    }

    try {
      await sendInvitation.mutateAsync({
        legacyId,
        data: { email: email.trim(), role },
      });
      setEmail('');
      setRole('advocate');
      onInviteSent();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send invitation. Please try again.');
      }
    }
  };

  const handleClose = () => {
    setEmail('');
    setRole('advocate');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Invite a Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation to join this legacy. They'll receive an email with a link to accept.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sendInvitation.isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
              disabled={sendInvitation.isPending}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getInvitableRoles().map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={sendInvitation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!email.trim() || sendInvitation.isPending}>
              {sendInvitation.isPending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
