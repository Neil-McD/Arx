/// <reference types="vite/client" />

import { afterEach, expect, test, vi } from "vitest";

import {
  RuntimeRunCancelledError,
  RuntimeRunInactiveError,
  runAbortableWithRuntimeCancellation,
} from "./runtimeCancellation";

afterEach(() => {
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("a long active operation receives periodic heartbeats", async () => {
  vi.useFakeTimers();
  const operationResult = deferred<string>();
  const operationStarted = deferred<void>();
  let heartbeatCount = 0;
  const ctx = {
    runQuery: vi.fn(async () => ({ status: "running" })),
  };

  const result = runAbortableWithRuntimeCancellation({
    ctx,
    ownerId: "owner-1",
    runId: "run-1",
    pollIntervalMs: 100,
    heartbeatIntervalMs: 250,
    touchHeartbeat: async () => {
      heartbeatCount += 1;
    },
    operation: async () => {
      operationStarted.resolve();
      return await operationResult.promise;
    },
  });

  await operationStarted.promise;
  expect(heartbeatCount).toBe(1);
  await vi.advanceTimersByTimeAsync(350);
  expect(heartbeatCount).toBe(2);
  operationResult.resolve("ok");
  await expect(result).resolves.toBe("ok");
});

test("a terminalized run aborts an in-flight operation", async () => {
  vi.useFakeTimers();
  const operationStarted = deferred<void>();
  let status = "running";
  const ctx = {
    runQuery: vi.fn(async () => ({ status })),
  };

  const result = runAbortableWithRuntimeCancellation({
    ctx,
    ownerId: "owner-2",
    runId: "run-2",
    pollIntervalMs: 100,
    operation: async (signal) => {
      operationStarted.resolve();
      return await new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  });

  await operationStarted.promise;
  const rejected = expect(result).rejects.toBeInstanceOf(
    RuntimeRunInactiveError,
  );
  status = "error";
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
});

test("a terminal run never starts provider or tool work", async () => {
  const operation = vi.fn(async () => "unexpected");
  const ctx = {
    runQuery: vi.fn(async () => ({ status: "ok" })),
  };

  await expect(
    runAbortableWithRuntimeCancellation({
      ctx,
      ownerId: "owner-3",
      runId: "run-3",
      operation,
    }),
  ).rejects.toBeInstanceOf(RuntimeRunInactiveError);
  expect(operation).not.toHaveBeenCalled();
});

test("explicit cancellation keeps its user-cancelled error semantics", async () => {
  const operation = vi.fn(async () => "unexpected");
  const ctx = {
    runQuery: vi.fn(async () => ({ status: "cancelled" })),
  };

  await expect(
    runAbortableWithRuntimeCancellation({
      ctx,
      ownerId: "owner-4",
      runId: "run-4",
      operation,
    }),
  ).rejects.toBeInstanceOf(RuntimeRunCancelledError);
  expect(operation).not.toHaveBeenCalled();
});
