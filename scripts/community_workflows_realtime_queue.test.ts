import { expect, test } from "vitest";

import { createWorkflowBoardReconciliationQueue } from "../apps/web/src/controllers/useWebCommunityWorkflowsController";

test("workflow board invalidations coalesce into one active refresh and one follow-up", async () => {
  let releaseFirstRefresh: (() => void) | null = null;
  let refreshCount = 0;
  const firstRefreshGate = new Promise<void>((resolve) => {
    releaseFirstRefresh = resolve;
  });
  const queue = createWorkflowBoardReconciliationQueue({
    isActive: () => true,
    reconcile: async () => {
      refreshCount += 1;
      if (refreshCount === 1) await firstRefreshGate;
    },
  });

  const first = queue.request();
  const second = queue.request();
  const third = queue.request();
  expect(first).toBe(second);
  expect(second).toBe(third);
  expect(refreshCount).toBe(1);

  releaseFirstRefresh?.();
  await first;
  expect(refreshCount).toBe(2);
});

test("a cancelled workflow board queue discards later invalidations", async () => {
  let refreshCount = 0;
  const queue = createWorkflowBoardReconciliationQueue({
    isActive: () => true,
    reconcile: async () => {
      refreshCount += 1;
    },
  });

  queue.cancel();
  await queue.request();
  expect(refreshCount).toBe(0);
});
