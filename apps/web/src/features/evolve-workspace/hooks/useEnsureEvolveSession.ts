import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getActiveEvolution,
  startEvolution,
  type EnsureSessionTrigger,
  type EvolutionSession,
} from '@/lib/api/evolution';
import { createNewConversation } from '@/features/ai-chat/api/ai';
import { evolutionKeys } from '@/lib/hooks/useEvolution';
import { ApiError } from '@/lib/api/client';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

export type { EnsureSessionTrigger };

export interface EnsuredSession {
  session: EvolutionSession;
  conversationId: string;
}

/**
 * Lazily creates (or reuses) the evolution session and the conversation for
 * the active persona. Opening Evolve never calls this — it's called only
 * from the first AI action (chat send, context extraction, rewrite, or
 * manual draft save). Concurrent callers share one in-flight promise so a
 * burst of actions never creates more than one session/conversation.
 */
export function useEnsureEvolveSession(storyId: string, legacyId: string) {
  const queryClient = useQueryClient();
  const inFlightRef = useRef<Promise<EnsuredSession> | null>(null);

  return useCallback(
    (trigger: EnsureSessionTrigger): Promise<EnsuredSession> => {
      if (inFlightRef.current) return inFlightRef.current;

      const promise = (async (): Promise<EnsuredSession> => {
        const personaId = useEvolveWorkspaceStore.getState().activePersonaId;

        let session =
          queryClient.getQueryData<EvolutionSession>(evolutionKeys.active(storyId)) ?? null;

        if (!session) {
          try {
            session = await getActiveEvolution(storyId);
          } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 404) throw err;
          }
        }

        if (!session) {
          session = await startEvolution(storyId, personaId, trigger);
          queryClient.setQueryData(evolutionKeys.active(storyId), session);
          useEvolveWorkspaceStore.getState().setConversationForPersona(personaId, session.conversation_id);
          return { session, conversationId: session.conversation_id };
        }

        queryClient.setQueryData(evolutionKeys.active(storyId), session);

        let conversationId = useEvolveWorkspaceStore.getState().conversationIds[personaId];
        if (!conversationId) {
          // The store's persona->conversation map is in-memory only (reset
          // on unmount/refresh). Before creating a new conversation, check
          // whether the session's own canonical conversation already
          // belongs to this persona — reuse it instead of orphaning it.
          if (session.persona_id === personaId) {
            conversationId = session.conversation_id;
          } else {
            const conversation = await createNewConversation({
              persona_id: personaId,
              legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
            });
            conversationId = conversation.id;
          }
          useEvolveWorkspaceStore.getState().setConversationForPersona(personaId, conversationId);
        }

        return { session, conversationId };
      })();

      inFlightRef.current = promise;
      promise.finally(() => {
        inFlightRef.current = null;
      });

      return promise;
    },
    [storyId, legacyId, queryClient],
  );
}
