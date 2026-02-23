import { Card } from '@/components/ui/card';
import { steps } from './howItWorksData';

export function GettingStartedSteps() {
  return (
    <section className="bg-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-neutral-900 mb-3">Get Started in 4 Simple Steps</h2>
          <p className="text-neutral-600">Creating a Legacy takes just minutes to start</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <Card key={step.number} className="p-6 space-y-4 relative">
              <div className="size-12 rounded-full bg-theme-accent-light flex items-center justify-center">
                <step.icon className="size-6 text-theme-primary" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl text-theme-primary">{step.number}</span>
                  <h3 className="text-neutral-900">{step.title}</h3>
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed">{step.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
