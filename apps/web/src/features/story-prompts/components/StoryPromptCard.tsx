import { useNavigate } from 'react-router-dom';
import { MessageSquare, PenLine, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCurrentPrompt, useShufflePrompt, useActOnPrompt } from '../hooks/useStoryPrompt';

export default function StoryPromptCard() {
  const navigate = useNavigate();
  const { data: prompt, isLoading } = useCurrentPrompt();
  const shuffle = useShufflePrompt();
  const act = useActOnPrompt();

  if (isLoading || !prompt) return null;

  const handleWriteStory = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'write_story',
    });
    if (result.story_id) {
      navigate(
        `/legacy/${result.legacy_id}/story/${result.story_id}/evolve?conversation_id=${result.conversation_id}`,
      );
    }
  };

  const handleDiscuss = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'discuss',
    });
    if (result.conversation_id) {
      navigate(
        `/legacy/${result.legacy_id}?tab=ai&conversation=${result.conversation_id}`,
      );
    }
  };

  const handleShuffle = () => {
    shuffle.mutate(prompt.id);
  };

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Story Prompt
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={handleShuffle}
                  disabled={shuffle.isPending}
                  title="Get a different prompt"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${shuffle.isPending ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                for {prompt.legacy_name}&apos;s legacy
              </p>
              <p className="text-base italic leading-relaxed">
                &ldquo;{prompt.prompt_text}&rdquo;
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleDiscuss} disabled={act.isPending}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Discuss
              </Button>
              <Button size="sm" onClick={handleWriteStory} disabled={act.isPending}>
                <PenLine className="h-4 w-4 mr-1.5" />
                Write a Story
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
