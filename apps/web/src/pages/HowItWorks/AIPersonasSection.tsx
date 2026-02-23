import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { personaDetails } from './howItWorksData';
import { PersonaDetailCard } from './PersonaDetailCard';

export function AIPersonasSection() {
  return (
    <section className="bg-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-accent-light border border-theme-accent">
            <Users className="size-4 text-theme-primary" />
            <span className="text-sm text-theme-primary-dark">AI Personalities</span>
          </div>
          <h2 className="text-neutral-900">Four Unique Conversation Styles</h2>
          <p className="text-neutral-600 max-w-2xl mx-auto">
            Each AI agent can adopt different personas to match your storytelling needs. Choose the personality
            that best fits the type of story you're creating and how you want to explore it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {personaDetails.map((persona) => (
            <PersonaDetailCard key={persona.id} persona={persona} />
          ))}
        </div>

        {/* Persona Selection Guide */}
        <Card className="mt-8 p-8 bg-gradient-to-br from-neutral-50 to-neutral-100">
          <h3 className="text-neutral-900 mb-6 text-center">Choosing the Right Persona for Your Story</h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-neutral-900">For Factual Documentation</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\u{1F4F0}'}</span>
                  <div>
                    <p className="text-sm text-neutral-900">Use The Reporter</p>
                    <p className="text-xs text-neutral-600">Career history, achievements, timelines</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\u{1F4D6}'}</span>
                  <div>
                    <p className="text-sm text-neutral-900">Use The Biographer</p>
                    <p className="text-xs text-neutral-600">Life story, legacy projects, comprehensive tributes</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-neutral-900">For Emotional Connection</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\u{1F4AC}'}</span>
                  <div>
                    <p className="text-sm text-neutral-900">Use The Friend</p>
                    <p className="text-xs text-neutral-600">Grief processing, personal memories, emotional stories</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{'\u{1F916}'}</span>
                  <div>
                    <p className="text-sm text-neutral-900">Use The Digital Twin</p>
                    <p className="text-xs text-neutral-600">Voice preservation, interactive legacy, ongoing connection</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
            <p className="text-sm text-neutral-600">
              {'\u{1F4A1}'} <strong>Pro Tip:</strong> You can switch between personas at any time during your conversation.
              Start with The Reporter to gather facts, then switch to The Friend to explore feelings, or try
              The Digital Twin to imagine how they would tell their own story.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}
