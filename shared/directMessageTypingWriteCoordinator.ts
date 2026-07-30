type DirectMessageTypingEnsureSession<SessionT> = (
  session: SessionT,
  source?: string,
) => Promise<SessionT | null>;

export type DirectMessageTypingWriteScope<SessionT> = {
  conversationId: string;
  session: SessionT;
  ensureSession?: DirectMessageTypingEnsureSession<SessionT>;
};

type DirectMessageTypingWriteDependencies<SessionT> = {
  setTyping: (args: {
    session: SessionT;
    conversationId: string;
  }) => Promise<unknown>;
  clearTyping: (args: {
    session: SessionT;
    conversationId: string;
  }) => Promise<unknown>;
};

export type DirectMessageTypingWriteCoordinator<SessionT> = {
  signalTyping: (
    scope: DirectMessageTypingWriteScope<SessionT>,
    throttleMs: number,
    nowMs?: number,
  ) => void;
  clearTyping: (scope: DirectMessageTypingWriteScope<SessionT>) => void;
  waitForIdle: () => Promise<void>;
};

async function resolveTypingSession<SessionT>(
  scope: DirectMessageTypingWriteScope<SessionT>,
  source: string,
): Promise<SessionT | null> {
  if (!scope.ensureSession) return scope.session;
  return await scope.ensureSession(scope.session, source);
}

export function createDirectMessageTypingWriteCoordinator<SessionT>(
  dependencies: DirectMessageTypingWriteDependencies<SessionT>,
): DirectMessageTypingWriteCoordinator<SessionT> {
  let activeConversationId: string | null = null;
  let writeQueue: Promise<void> = Promise.resolve();
  const lastSentAtByConversation = new Map<string, number>();

  const enqueue = (operation: () => Promise<void>) => {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(operation)
      .catch(() => undefined);
  };

  return {
    signalTyping(scope, throttleMs, nowMs = Date.now()) {
      const conversationId = String(scope.conversationId ?? "").trim();
      if (!conversationId) return;
      const lastSentAt = lastSentAtByConversation.get(conversationId) ?? 0;
      if (
        activeConversationId === conversationId
        && nowMs - lastSentAt < Math.max(500, throttleMs)
      ) {
        return;
      }

      activeConversationId = conversationId;
      lastSentAtByConversation.set(conversationId, nowMs);
      enqueue(async () => {
        const usableSession = await resolveTypingSession(
          scope,
          "direct_messages_typing_write",
        );
        if (!usableSession || activeConversationId !== conversationId) return;
        await dependencies.setTyping({
          session: usableSession,
          conversationId,
        });
      });
    },

    clearTyping(scope) {
      const conversationId = String(scope.conversationId ?? "").trim();
      if (!conversationId) return;
      const wasActive = activeConversationId === conversationId;
      const hadHeartbeat = lastSentAtByConversation.has(conversationId);
      if (!wasActive && !hadHeartbeat) return;

      if (wasActive) activeConversationId = null;
      lastSentAtByConversation.delete(conversationId);
      enqueue(async () => {
        const usableSession = await resolveTypingSession(
          scope,
          "direct_messages_clear_typing",
        );
        if (!usableSession) return;
        await dependencies.clearTyping({
          session: usableSession,
          conversationId,
        });
      });
    },

    async waitForIdle() {
      await writeQueue;
    },
  };
}
