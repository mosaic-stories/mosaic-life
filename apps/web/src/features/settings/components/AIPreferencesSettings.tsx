/**
 * AI Preferences settings section.
 */

import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePreferences, useUpdatePreferences } from '@/features/settings/hooks/useSettings';

const AI_MODELS = [
  {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Most capable - Deep reasoning and nuance',
  },
  {
    id: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced - Great quality at faster speed',
  },
  {
    id: 'claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    description: 'Fast - Quick responses for simple tasks',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek-R1',
    description: 'Analytical - Strong reasoning and problem-solving',
  },
];

const AGENT_PERSONAS = [
  {
    id: 'biographer',
    name: 'Biographer',
    icon: '📖',
    description:
      'Helps document life events with historical context and narrative flow',
  },
  {
    id: 'friend',
    name: 'Friend',
    icon: '💬',
    description:
      'Warm, conversational companion for sharing memories and stories',
  },
];

export default function AIPreferencesSettings() {
  const { data: preferences, isLoading } = usePreferences();
  const updatePreferences = useUpdatePreferences();

  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4.5');
  const [hiddenPersonas, setHiddenPersonas] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize from preferences
  useEffect(() => {
    if (preferences) {
      setDefaultModel(preferences.default_model);
      setHiddenPersonas(preferences.hidden_personas);
    }
  }, [preferences]);

  const handleModelChange = (model: string) => {
    setDefaultModel(model);
    setHasChanges(
      model !== preferences?.default_model ||
        JSON.stringify(hiddenPersonas) !==
          JSON.stringify(preferences?.hidden_personas)
    );
  };

  const handlePersonaToggle = (personaId: string, enabled: boolean) => {
    const newHidden = enabled
      ? hiddenPersonas.filter((id) => id !== personaId)
      : [...hiddenPersonas, personaId];

    setHiddenPersonas(newHidden);
    setHasChanges(
      defaultModel !== preferences?.default_model ||
        JSON.stringify(newHidden) !==
          JSON.stringify(preferences?.hidden_personas)
    );
  };

  const handleSave = () => {
    updatePreferences.mutate(
      { default_model: defaultModel, hidden_personas: hiddenPersonas },
      {
        onSuccess: () => {
          setHasChanges(false);
        },
      }
    );
  };

  const handleCancel = () => {
    if (preferences) {
      setDefaultModel(preferences.default_model);
      setHiddenPersonas(preferences.hidden_personas);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">AI Preferences</h2>
        <p className="text-sm text-gray-500">Customize your AI experience</p>
      </div>

      {/* Default Model */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label className="text-sm font-medium text-gray-700">Default Model</Label>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Used when starting new chat sessions
        </p>

        <Select value={defaultModel} onValueChange={handleModelChange}>
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-gray-500">
                    {model.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agent Personas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Label className="text-sm font-medium text-gray-700">Agent Personas</Label>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Choose which personas appear in your chat interface
        </p>

        <div className="space-y-3">
          {AGENT_PERSONAS.map((persona) => {
            const isEnabled = !hiddenPersonas.includes(persona.id);

            return (
              <div
                key={persona.id}
                className="flex items-center justify-between p-4 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{persona.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{persona.name}</p>
                    <p className="text-sm text-gray-500">{persona.description}</p>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) =>
                    handlePersonaToggle(persona.id, checked)
                  }
                />
              </div>
            );
          })}
        </div>

        <p className="text-sm text-gray-500 mt-4">
          Hidden personas won't appear in the chat persona picker
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!hasChanges || updatePreferences.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updatePreferences.isPending}
        >
          {updatePreferences.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
