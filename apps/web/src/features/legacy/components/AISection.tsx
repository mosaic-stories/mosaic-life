import { ArrowLeft, MessageSquare, Sparkles, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface AISectionProps {
  legacyName: string;
  onChatClick: () => void;
  onPanelClick: () => void;
}

function DemoBadge() {
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
      Demo
    </Badge>
  );
}

export default function AISection({ legacyName, onChatClick, onPanelClick }: AISectionProps) {
  return (
    <div className="max-w-3xl space-y-6">
      <Card className="p-8 space-y-4 bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to border-theme-accent">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-full bg-theme-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="size-6 text-white" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-neutral-900">AI-Powered Interactions</h3>
              <DemoBadge />
            </div>
            <p className="text-neutral-600">
              Explore different ways to interact with and preserve {legacyName}'s legacy through AI assistants
            </p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card
          className="p-6 space-y-4 cursor-pointer hover:shadow-lg transition-shadow group"
          onClick={onChatClick}
        >
          <div className="flex items-start justify-between">
            <div className="size-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <MessageSquare className="size-6 text-blue-600" />
            </div>
            <ArrowLeft className="size-4 text-neutral-400 group-hover:text-neutral-900 transition-colors rotate-180" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-neutral-900">Chat Interface</h3>
              <DemoBadge />
            </div>
            <p className="text-sm text-neutral-600">
              Conversational AI agents that help you explore stories, ask questions, and preserve memories
            </p>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Interactive
          </Badge>
        </Card>

        <Card
          className="p-6 space-y-4 cursor-pointer hover:shadow-lg transition-shadow group"
          onClick={onPanelClick}
        >
          <div className="flex items-start justify-between">
            <div className="size-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="size-6 text-purple-600" />
            </div>
            <ArrowLeft className="size-4 text-neutral-400 group-hover:text-neutral-900 transition-colors rotate-180" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-neutral-900">Agent Panel</h3>
              <DemoBadge />
            </div>
            <p className="text-sm text-neutral-600">
              Browse and select from specialized AI agents, each with unique perspectives and expertise
            </p>
          </div>
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            Curated
          </Badge>
        </Card>
      </div>
    </div>
  );
}
