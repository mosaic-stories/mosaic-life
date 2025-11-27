import { ArrowLeft, BookHeart, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import ThemeSelector from './ThemeSelector';

interface MyLegaciesProps {
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export default function MyLegacies({ onNavigate, currentTheme, onThemeChange }: MyLegaciesProps) {
  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to home</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button size="sm" onClick={() => onNavigate('story')}>
                <Plus className="size-4 mr-2" />
                Create Legacy
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-neutral-900">My Legacies</h1>
            <p className="text-neutral-600 mt-2">
              Legacies you've created and curated
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="p-8 border-dashed hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors cursor-pointer">
              <div className="text-center space-y-3">
                <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center mx-auto">
                  <Plus className="size-6 text-[rgb(var(--theme-primary))]" />
                </div>
                <div>
                  <p className="text-neutral-900">Create a new legacy</p>
                  <p className="text-sm text-neutral-500">Start preserving memories</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
