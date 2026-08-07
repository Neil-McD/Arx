import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  consumeAuthResumeStateIfCurrent,
  readAuthResumeState,
  storeAuthResumeState,
} from "../shared/authResumeState";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth resume state consumption", () => {
  test("consumes the same intent only after its continuation succeeds", () => {
    storeAuthResumeState(
      { intent: { reason: "try_polynet_free", payload: {} } },
      1_000,
    );
    const pending = readAuthResumeState(1_001);
    expect(pending).not.toBeNull();
    expect(consumeAuthResumeStateIfCurrent(pending!, 1_002)).toBe(true);
    expect(readAuthResumeState(1_003)).toBeNull();
  });

  test("an older continuation cannot clear a newer intent", () => {
    storeAuthResumeState(
      { intent: { reason: "try_polynet_free", payload: {} } },
      2_000,
    );
    const older = readAuthResumeState(2_001);
    expect(older).not.toBeNull();

    storeAuthResumeState(
      {
        intent: {
          reason: "join_public_community",
          payload: { community_id: null, community_slug: "polynet" },
        },
      },
      2_002,
    );

    expect(consumeAuthResumeStateIfCurrent(older!, 2_003)).toBe(false);
    expect(readAuthResumeState(2_004)?.intent).toEqual({
      reason: "join_public_community",
      payload: { community_id: null, community_slug: "polynet" },
    });
  });
});
