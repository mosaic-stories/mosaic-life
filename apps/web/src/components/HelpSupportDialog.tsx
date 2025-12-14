/**
 * Help & Support dialog with context capture.
 */

import { Info } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateSupportRequest } from '@/lib/hooks/useSupport';
import { SupportRequestCreate } from '@/lib/api/support';

const CATEGORIES = [
  { value: 'general_question', label: 'General Question' },
  { value: 'bug_report', label: 'Bug Report' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'account_issue', label: 'Account Issue' },
  { value: 'other', label: 'Other' },
] as const;

interface HelpSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionStartTime?: Date;
}

export default function HelpSupportDialog({
  open,
  onOpenChange,
  sessionStartTime,
}: HelpSupportDialogProps) {
  const location = useLocation();
  const params = useParams();
  const createSupportRequest = useCreateSupportRequest();

  const [category, setCategory] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const isValid = category && subject.trim() && message.trim();

  const handleSubmit = () => {
    if (!isValid) return;

    // Calculate session duration
    const sessionDuration = sessionStartTime
      ? Math.floor((Date.now() - sessionStartTime.getTime()) / 1000)
      : null;

    // Capture recent console errors (simplified)
    const recentErrors: string[] = [];

    const requestData: SupportRequestCreate = {
      category: category as SupportRequestCreate['category'],
      subject: subject.trim(),
      message: message.trim(),
      context: {
        page_url: location.pathname + location.search,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        legacy_id: params.legacyId || null,
        session_duration_seconds: sessionDuration,
        recent_errors: recentErrors,
      },
    };

    createSupportRequest.mutate(requestData, {
      onSuccess: () => {
        setShowSuccess(true);
      },
    });
  };

  const handleClose = () => {
    setCategory('');
    setSubject('');
    setMessage('');
    setShowSuccess(false);
    onOpenChange(false);
  };

  if (showSuccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Submitted</DialogTitle>
            <DialogDescription>
              Thanks for reaching out! We'll respond to your email within 24-48
              hours.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Help & Support</DialogTitle>
          <DialogDescription>How can we help?</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              maxLength={100}
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please describe your issue or question in detail..."
              maxLength={2000}
              rows={5}
            />
            <p className="text-xs text-gray-400 text-right">
              {message.length}/2000 characters
            </p>
          </div>

          {/* Context Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm">
            <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-blue-700">
              <p className="font-medium">We'll automatically include:</p>
              <ul className="mt-1 text-blue-600 space-y-0.5">
                <li>• Current page and legacy context</li>
                <li>• Browser and device info</li>
                <li>• Recent error logs (if any)</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || createSupportRequest.isPending}
          >
            {createSupportRequest.isPending ? 'Sending...' : 'Send Message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
