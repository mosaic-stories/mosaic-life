import { MessageCircle, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface TrendingTopic {
  emoji: string;
  title: string;
  description: string;
  replyCount: number;
}

const trendingTopics: TrendingTopic[] = [
  {
    emoji: '💭',
    title: 'How to start a difficult conversation',
    description: 'Tips for talking about end-of-life planning with loved ones.',
    replyCount: 143,
  },
  {
    emoji: '📸',
    title: 'Best practices for digitizing old photos',
    description: 'Community members share their favorite tools and techniques.',
    replyCount: 89,
  },
  {
    emoji: '✍️',
    title: 'Writing through grief',
    description: 'How storytelling helps in the healing process.',
    replyCount: 201,
  },
];

export default function TrendingTopicsSection() {
  return (
    <section className="bg-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-2 mb-8">
          <TrendingUp className="size-5 text-[rgb(var(--theme-primary))]" />
          <h2 className="text-neutral-900">Trending Topics</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {trendingTopics.map((topic) => (
            <Card key={topic.title} className="p-6 space-y-3">
              <div className="text-3xl">{topic.emoji}</div>
              <h3 className="text-neutral-900">{topic.title}</h3>
              <p className="text-sm text-neutral-600">{topic.description}</p>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <MessageCircle className="size-3" />
                <span>{topic.replyCount} replies</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
