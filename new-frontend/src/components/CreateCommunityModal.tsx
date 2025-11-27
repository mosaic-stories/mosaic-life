import { useState } from 'react';
import { X, Globe, Lock, Users, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Card } from './ui/card';

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export default function CreateCommunityModal({ isOpen, onClose, onNavigate }: CreateCommunityModalProps) {
  const [communityName, setCommunityName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [privacyType, setPrivacyType] = useState<'public' | 'private'>('public');

  const categories = [
    'Memorial',
    'Tribute',
    'Support',
    'Celebration',
    'Learning',
    'General Discussion'
  ];

  const handleCreate = () => {
    // In a real app, this would create the community
    console.log('Creating community:', { communityName, description, category, privacyType });
    onClose();
    // Show success message or navigate to new community
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a New Community</DialogTitle>
          <DialogDescription>
            Build a space where people can connect, share stories, and support each other.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Community Name */}
          <div className="space-y-2">
            <Label htmlFor="community-name">Community Name *</Label>
            <Input
              id="community-name"
              placeholder="e.g., Remembering Our Veterans"
              value={communityName}
              onChange={(e) => setCommunityName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe what this community is about and who it's for..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-neutral-500">
              Be clear and welcoming. This helps people understand if the community is right for them.
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))]"
            >
              <option value="">Select a category...</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Privacy Type */}
          <div className="space-y-3">
            <Label>Privacy Type *</Label>
            <div className="grid gap-3">
              <Card
                className={`p-4 cursor-pointer transition-all ${
                  privacyType === 'public'
                    ? 'border-2 border-[rgb(var(--theme-primary))] bg-[rgb(var(--theme-accent-light))]'
                    : 'border hover:border-neutral-400'
                }`}
                onClick={() => setPrivacyType('public')}
              >
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Globe className="size-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-neutral-900">Public Community</h4>
                      {privacyType === 'public' && (
                        <div className="size-5 rounded-full bg-[rgb(var(--theme-primary))] flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600">
                      Anyone can discover, view, and request to join this community. Best for open support groups 
                      and general topics.
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                className={`p-4 cursor-pointer transition-all ${
                  privacyType === 'private'
                    ? 'border-2 border-[rgb(var(--theme-primary))] bg-[rgb(var(--theme-accent-light))]'
                    : 'border hover:border-neutral-400'
                }`}
                onClick={() => setPrivacyType('private')}
              >
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Lock className="size-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-neutral-900">Private Community</h4>
                      {privacyType === 'private' && (
                        <div className="size-5 rounded-full bg-[rgb(var(--theme-primary))] flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600">
                      Only visible to invited members. Perfect for intimate support groups, family circles, or 
                      sensitive topics.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Info Box */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="text-sm text-blue-900">Community Guidelines Apply</h4>
                <p className="text-xs text-blue-700 leading-relaxed">
                  All communities must follow Mosaic Life's community guidelines: respect, understanding, kindness, 
                  and appropriate language. As the creator, you'll be responsible for moderating discussions and 
                  ensuring a safe, supportive environment.
                </p>
              </div>
            </div>
          </Card>

          {/* Moderator Responsibilities */}
          <Card className="p-4 bg-neutral-50 border-neutral-200">
            <div className="flex items-start gap-3">
              <Users className="size-5 text-neutral-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="text-sm text-neutral-900">As a Community Creator, You Can:</h4>
                <ul className="text-xs text-neutral-600 space-y-1 list-disc list-inside">
                  <li>Review and approve join requests (for private communities)</li>
                  <li>Pin important announcements and discussions</li>
                  <li>Remove posts or members that violate guidelines</li>
                  <li>Invite additional moderators to help manage the community</li>
                  <li>Edit community details and settings</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!communityName || !description || !category}
            className="gap-2 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
          >
            Create Community
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
