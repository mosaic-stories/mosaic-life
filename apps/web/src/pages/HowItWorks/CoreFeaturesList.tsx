import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { features } from './howItWorksData';

export function CoreFeaturesList() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-neutral-900 mb-3">Powerful Tools for Storytelling</h2>
          <p className="text-neutral-600">Everything you need to create rich, meaningful tributes</p>
        </div>

        <div className="space-y-8">
          {features.map((feature, index) => (
            <Card key={feature.title} className="p-8 hover:shadow-lg transition-shadow">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-shrink-0">
                  <div className="size-16 rounded-xl bg-theme-accent-light flex items-center justify-center">
                    <feature.icon className={`size-8 ${feature.color}`} />
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-neutral-900">{feature.title}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {index === 0 ? 'Core' : index < 3 ? 'Essential' : 'Advanced'}
                      </Badge>
                    </div>
                    <p className="text-neutral-600">{feature.description}</p>
                  </div>
                  <ul className="space-y-2">
                    {feature.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-3 text-sm text-neutral-700">
                        <CheckCircle2 className="size-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
