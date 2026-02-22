import { Card } from '@/components/ui/card';
import { useCases } from './howItWorksData';

export function UseCasesGrid() {
  return (
    <section className="bg-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-neutral-900 mb-3">Perfect For Any Occasion</h2>
          <p className="text-neutral-600">Mosaic Life adapts to honor people at different life moments</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase) => (
            <Card key={useCase.title} className="p-6 space-y-3 hover:shadow-md transition-shadow">
              <div className="text-4xl">{useCase.icon}</div>
              <h3 className="text-neutral-900">{useCase.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{useCase.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
