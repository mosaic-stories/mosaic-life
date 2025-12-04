import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookHeart, Globe, Lock, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import ThemeSelector from './ThemeSelector';
import { useCreateLegacy } from '@/lib/hooks/useLegacies';
import type { LegacyVisibility } from '@/lib/api/legacies';

interface LegacyCreationProps {
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export default function LegacyCreation({ onNavigate: _onNavigate, currentTheme, onThemeChange }: LegacyCreationProps) {
  const navigate = useNavigate();
  const createLegacy = useCreateLegacy();

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [biography, setBiography] = useState('');
  const [visibility, setVisibility] = useState<LegacyVisibility>('private');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a name for the legacy');
      return;
    }

    try {
      const legacy = await createLegacy.mutateAsync({
        name: name.trim(),
        birth_date: birthDate || null,
        death_date: deathDate || null,
        biography: biography.trim() || null,
        visibility,
      });

      // Navigate to the newly created legacy
      navigate(`/legacy/${legacy.id}`);
    } catch (err) {
      setError('Failed to create legacy. Please try again.');
      console.error('Error creating legacy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back</span>
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <div className="size-16 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center mx-auto">
              <BookHeart className="size-8 text-[rgb(var(--theme-primary))]" />
            </div>
            <h1 className="text-neutral-900">Create a Legacy</h1>
            <p className="text-neutral-600">
              Honor someone special by creating a digital tribute to preserve their stories and memories.
            </p>
          </div>

          <Card className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter the person's name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <p className="text-xs text-neutral-500">
                  This is the name that will appear on the legacy page.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birthDate">Birth Date</Label>
                  <div className="relative">
                    <Input
                      id="birthDate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deathDate">Death Date (if applicable)</Label>
                  <Input
                    id="deathDate"
                    type="date"
                    value={deathDate}
                    onChange={(e) => setDeathDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="biography">Biography</Label>
                <Textarea
                  id="biography"
                  placeholder="Share a brief biography or description..."
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-neutral-500">
                  A short description that introduces this person to visitors.
                </p>
              </div>

              <div className="space-y-3">
                <Label>Visibility</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                      visibility === 'private'
                        ? 'border-[rgb(var(--theme-primary))] bg-[rgb(var(--theme-accent-light))]'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <Lock className={`size-5 ${visibility === 'private' ? 'text-[rgb(var(--theme-primary))]' : 'text-neutral-500'}`} />
                    <div className="text-left">
                      <div className={`font-medium ${visibility === 'private' ? 'text-[rgb(var(--theme-primary))]' : 'text-neutral-900'}`}>
                        Private
                      </div>
                      <div className="text-xs text-neutral-500">
                        Only invited members can view
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                      visibility === 'public'
                        ? 'border-[rgb(var(--theme-primary))] bg-[rgb(var(--theme-accent-light))]'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <Globe className={`size-5 ${visibility === 'public' ? 'text-[rgb(var(--theme-primary))]' : 'text-neutral-500'}`} />
                    <div className="text-left">
                      <div className={`font-medium ${visibility === 'public' ? 'text-[rgb(var(--theme-primary))]' : 'text-neutral-900'}`}>
                        Public
                      </div>
                      <div className="text-xs text-neutral-500">
                        Anyone can discover and view
                      </div>
                    </div>
                  </button>
                </div>
                <p className="text-xs text-neutral-500">
                  You can change this setting later.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createLegacy.isPending}
                  className="flex-1 bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]"
                >
                  {createLegacy.isPending ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Legacy'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}
