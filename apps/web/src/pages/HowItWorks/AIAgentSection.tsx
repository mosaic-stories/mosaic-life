import { Sparkles, MessageSquare, Bot } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { agentDetails } from './howItWorksData';
import { AgentDetailCard } from './AgentDetailCard';

export function AIAgentSection() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
            <Sparkles className="size-4 text-theme-primary" />
            <span className="text-sm text-theme-primary-dark">AI-Powered Assistance</span>
          </div>
          <h2 className="text-neutral-900">Meet Your AI Story Companions</h2>
          <p className="text-neutral-600 max-w-2xl mx-auto">
            Three specialized AI agents designed to help you capture, develop, and refine meaningful stories.
            Each one serves a different purpose in your storytelling journey.
          </p>
        </div>

        <div className="space-y-8">
          {agentDetails.map((agent) => (
            <AgentDetailCard key={agent.id} agent={agent} />
          ))}
        </div>

        {/* Comparison Summary */}
        <Card className="mt-8 p-8 bg-gradient-to-br from-neutral-50 to-neutral-100">
          <h3 className="text-neutral-900 mb-6 text-center">Which AI Agent Should You Use?</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="size-12 rounded-lg bg-blue-500 flex items-center justify-center">
                <Sparkles className="size-6 text-white" />
              </div>
              <h4 className="text-neutral-900">Inline Assistant</h4>
              <p className="text-sm text-neutral-600">
                Quick edits while writing. Great for immediate help with specific sentences.
              </p>
              <p className="text-xs text-neutral-500">&#9202;&#65039; Use when you need quick help</p>
            </div>
            <div className="space-y-3">
              <div className="size-12 rounded-lg bg-emerald-500 flex items-center justify-center">
                <MessageSquare className="size-6 text-white" />
              </div>
              <h4 className="text-neutral-900">Chat Mode</h4>
              <p className="text-sm text-neutral-600">
                Conversational exploration. Perfect for brainstorming and developing ideas.
              </p>
              <p className="text-xs text-neutral-500">&#128173; Use when starting from scratch</p>
            </div>
            <div className="space-y-3">
              <div className="size-12 rounded-lg bg-purple-500 flex items-center justify-center">
                <Bot className="size-6 text-white" />
              </div>
              <h4 className="text-neutral-900">Agent Panel</h4>
              <p className="text-sm text-neutral-600">
                Professional refinement. Best for polishing important, detailed stories.
              </p>
              <p className="text-xs text-neutral-500">&#10024; Use for high-quality results</p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
