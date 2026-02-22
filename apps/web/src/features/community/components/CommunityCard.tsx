import { Users, Lock, Globe, MessageCircle, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CommunityItem } from './communities';

interface CommunityCardProps {
  community: CommunityItem;
}

export default function CommunityCard({ community }: CommunityCardProps) {
  return (
    <Card className="p-6 space-y-4 hover:shadow-lg transition-all cursor-pointer group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-lg bg-theme-accent-light flex items-center justify-center text-2xl">
            {community.image}
          </div>
          <div>
            <h3 className="text-neutral-900 group-hover:text-theme-primary transition-colors">
              {community.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {community.category}
              </Badge>
              {community.type === 'private' ? (
                <Lock className="size-3 text-neutral-400" />
              ) : (
                <Globe className="size-3 text-neutral-400" />
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2">
        {community.description}
      </p>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-1">
            <Users className="size-3" />
            <span>{community.memberCount} members</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{community.recentActivity}</span>
          </div>
        </div>
      </div>

      {community.isJoined ? (
        <Button variant="outline" size="sm" className="w-full gap-2">
          <MessageCircle className="size-4" />
          View Discussions
        </Button>
      ) : (
        <Button
          size="sm"
          className="w-full gap-2 bg-theme-primary hover:bg-theme-primary-dark"
        >
          {community.type === 'private' ? 'Request to Join' : 'Join Community'}
          <ArrowRight className="size-4" />
        </Button>
      )}
    </Card>
  );
}
