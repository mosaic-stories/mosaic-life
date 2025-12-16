import { useState } from 'react';
import { ArrowLeft, Calendar, Download, Grid3x3, Heart, List, Plus, Share2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent } from './ui/dialog';
import { legacies, mediaItems } from '../lib/mockData';
import ThemeSelector from './ThemeSelector';
import { SEOHead } from '@/components/seo';

interface MediaGalleryProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export default function MediaGallery({ onNavigate, legacyId, currentTheme, onThemeChange }: MediaGalleryProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMedia, setSelectedMedia] = useState<typeof mediaItems[0] | null>(null);
  
  const legacy = legacies.find(l => l.id === legacyId) || legacies[0];

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      <SEOHead
        title="Media Gallery"
        description="View and manage media for this legacy"
        noIndex={true}
      />
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to {legacy.name}</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-white text-neutral-900 shadow-sm' 
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Grid3x3 className="size-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-white text-neutral-900 shadow-sm' 
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <List className="size-4" />
                </button>
              </div>
              <Button size="sm" className="gap-2">
                <Plus className="size-4" />
                Upload
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-neutral-900">Media Gallery</h1>
            <p className="text-neutral-600">
              {mediaItems.length} photos and videos capturing moments from {legacy.name}'s life
            </p>
          </div>

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  className="aspect-square rounded-lg overflow-hidden bg-neutral-100 group cursor-pointer relative"
                  onClick={() => setSelectedMedia(item)}
                >
                  <img 
                    src={item.url}
                    alt={item.caption}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-white text-sm">{item.caption}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              <button className="aspect-square rounded-lg border-2 border-dashed border-neutral-300 hover:border-amber-300 hover:bg-amber-50/30 transition-colors flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
                    <Plus className="size-6 text-neutral-600" />
                  </div>
                  <p className="text-sm text-neutral-600">Add media</p>
                </div>
              </button>
            </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <div className="space-y-3">
              {mediaItems.map((item) => (
                <Card 
                  key={item.id}
                  className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedMedia(item)}
                >
                  <div className="flex items-center gap-4">
                    <div className="size-24 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0">
                      <img 
                        src={item.url}
                        alt={item.caption}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-neutral-900">{item.caption}</p>
                      {item.date && (
                        <div className="flex items-center gap-2 text-sm text-neutral-500">
                          <Calendar className="size-4" />
                          <span>{item.date}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{item.type}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Heart className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Share2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Media Detail Dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-4xl p-0">
          {selectedMedia && (
            <div className="flex flex-col h-[80vh]">
              {/* Image */}
              <div className="flex-1 bg-neutral-900 flex items-center justify-center overflow-hidden">
                <img 
                  src={selectedMedia.url}
                  alt={selectedMedia.caption}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* Details */}
              <div className="bg-white p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <h3 className="text-neutral-900">{selectedMedia.caption}</h3>
                    {selectedMedia.date && (
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        <Calendar className="size-4" />
                        <span>{selectedMedia.date}</span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setSelectedMedia(null)}
                    className="text-neutral-400 hover:text-neutral-900 transition-colors"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Heart className="size-4" />
                    Like
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Share2 className="size-4" />
                    Share
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="size-4" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}