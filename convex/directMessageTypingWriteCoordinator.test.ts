import { expect, test } from "vitest";

import { createDirectMessageTypingWriteCoordinator } from "../shared/directMessageTypingWriteCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("a renewal keeps its captured conversation and cannot leak across a switch", async () => {
  const firstSession = deferred<string | null>();
  const writes: string[] = [];
  const coordinator = createDirectMessageTypingWriteCoordinator<string>({
    setTyping: async ({ conversationId }) => {
      writes.push(`set:${conversationId}`);
    },
    clearTyping: async ({ conversationId }) => {
      writes.push(`clear:${conversationId}`);
    },
  });

  coordinator.signalTyping(
    {
      conversationId: "conversation-a",
      session: "session-a",
      ensureSession: async () => await firstSession.promise,
    },
    2_000,
    10_000,
  );
  coordinator.clearTyping({
    conversationId: "conversation-a",
    session: "session-a",
  });
  coordinator.signalTyping(
    {
      conversationId: "conversation-b",
      session: "session-b",
    },
    2_000,
    10_100,
  );

  firstSession.resolve("refreshed-session-a");
  await coordinator.waitForIdle();

  expect(writes).toEqual([
    "clear:conversation-a",
    "set:conversation-b",
  ]);
});

test("a clear is ordered after an in-flight renewal and prevents resurrection", async () => {
  const sessionResolution = deferred<string | null>();
  const writes: string[] = [];
  const coordinator = createDirectMessageTypingWriteCoordinator<string>({
    setTyping: async ({ conversationId }) => {
      writes.push(`set:${conversationId}`);
    },
    clearTyping: async ({ conversationId }) => {
      writes.push(`clear:${conversationId}`);
    },
  });

  coordinator.signalTyping(
    {
      conversationId: "conversation-a",
      session: "session-a",
      ensureSession: async () => await sessionResolution.promise,
    },
    2_000,
    10_000,
  );
  coordinator.clearTyping({
    conversationId: "conversation-a",
    session: "session-a",
  });

  sessionResolution.resolve("refreshed-session-a");
  await coordinator.waitForIdle();

  expect(writes).toEqual(["clear:conversation-a"]);
});

test("repeated heartbeats are throttled per conversation", async () => {
  const writes: string[] = [];
  const coordinator = createDirectMessageTypingWriteCoordinator<string>({
    setTyping: async ({ conversationId }) => {
      writes.push(`set:${conversationId}`);
    },
    clearTyping: async ({ conversationId }) => {
      writes.push(`clear:${conversationId}`);
    },
  });
  const scope = {
    conversationId: "conversation-a",
    session: "session-a",
  };

  coordinator.signalTyping(scope, 2_000, 10_000);
  coordinator.signalTyping(scope, 2_000, 11_999);
  coordinator.signalTyping(scope, 2_000, 12_000);
  await coordinator.waitForIdle();

  expect(writes).toEqual(["set:conversation-a", "set:conversation-a"]);
});
