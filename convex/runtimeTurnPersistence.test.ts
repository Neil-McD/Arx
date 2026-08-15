/// <reference types="vite/client" />

import { expect, test, vi } from "vitest";

import {
  ensureRuntimeRunStarted,
  resolveRuntimeRunContinuation,
} from "./runtimeTurnPersistence";

test.each(["running", "ok", "error", "cancelled"] as const)(
  "run start preserves the canonical %s status",
  async (status) => {
    const ctx = {
      runMutation: vi.fn(async () => ({ status })),
    };
    const result = await ensureRuntimeRunStarted({
      ctx,
      ownerId: "owner-1",
      threadId: "thread-1",
      runStartArgs: { runId: "run-1" },
      fail: vi.fn(),
    });
    expect(result).toEqual({ ok: true, runStatus: status });
  },
);

test("invalid persisted run status fails closed", async () => {
  const ctx = {
    runMutation: vi.fn(async () => ({ status: "unexpected" })),
  };
  await expect(
    ensureRuntimeRunStarted({
      ctx,
      ownerId: "owner-1",
      threadId: "thread-1",
      runStartArgs: { runId: "run-1" },
      fail: vi.fn(),
    }),
  ).rejects.toThrow("runtime_run_status_invalid");
});

test("a completed terminal run replays its persisted assistant response", async () => {
  const ctx = {
    runQuery: vi
      .fn()
      .mockResolvedValueOnce({
        _id: "assistant-1",
        messageKey: "assistant-key",
        seq: 2,
        contentJson: {
          text: "Persisted answer",
          meta: { inference_source: "platform" },
        },
      })
      .mockResolvedValueOnce({
        _id: "user-1",
        messageKey: "user-key",
        seq: 1,
      }),
  };
  const result = await resolveRuntimeRunContinuation({
    runStatus: "ok",
    ctx,
    ownerId: "owner-1",
    threadId: "thread-1",
    assistantMessageKeyForRun: "assistant-key",
    userMessageKeyForRun: "user-key",
    inferenceSource: "free",
    replayVisibleMessages: true,
  });
  expect(result).toMatchObject({
    kind: "replay",
    replay: {
      content: "Persisted answer",
      resolvedInferenceSource: "platform",
      assistantMessageId: "assistant-1",
      userMessageId: "user-1",
    },
  });
});

test("an incomplete terminal run is deterministically not resumable", async () => {
  const ctx = {
    runQuery: vi.fn(async () => ({
      contentJson: {
        text: "Partial",
        meta: { partial_run: { incomplete: true } },
      },
    })),
  };
  const result = await resolveRuntimeRunContinuation({
    runStatus: "error",
    ctx,
    ownerId: "owner-1",
    threadId: "thread-1",
    assistantMessageKeyForRun: "assistant-key",
    userMessageKeyForRun: "user-key",
    inferenceSource: "platform",
    replayVisibleMessages: true,
  });
  expect(result).toEqual({ kind: "not_resumable", runStatus: "error" });
  expect(ctx.runQuery).toHaveBeenCalledTimes(1);
});
