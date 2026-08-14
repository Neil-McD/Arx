import { afterEach, describe, expect, it, vi } from "vitest";

import { buildBuilderKnowledgeResourcesCore } from "./communityBuilderKnowledgeSetup";

describe("builder knowledge build failure boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the safe architect category, releases the lease, and performs no apply write", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mutationArgs: Array<Record<string, unknown>> = [];
    const actionArgs: Array<Record<string, unknown>> = [];
    const ctx = {
      runMutation: async (_reference: unknown, args: Record<string, unknown>) => {
        mutationArgs.push(args);
        if (mutationArgs.length === 1) {
          return {
            ok: true,
            complete: false,
            user_id: "user_owner",
            stage: "architecture",
          };
        }
        return { ok: true, changed: true };
      },
      runAction: async (_reference: unknown, args: Record<string, unknown>) => {
        actionArgs.push(args);
        return {
          ok: false,
          code: "invalid_architect_output",
          failure_reason: "proposal_validation_failed",
          output_preview: "private source content must not cross this boundary",
        };
      },
      runQuery: async () => {
        throw new Error("content query must not run after architect failure");
      },
    };

    const result = await buildBuilderKnowledgeResourcesCore(ctx, {
      authSubject: "auth_owner",
      communityId: "community_1",
    });

    expect(result).toEqual({
      ok: false,
      kind: "builder_knowledge_build",
      code: "invalid_architect_output",
      failure_stage: "architecture_proposal",
      failure_reason: "proposal_validation_failed",
      message: "Polynet could not finish building your resources. Try again.",
    });
    expect(JSON.stringify(result)).not.toContain("private source content");
    expect(actionArgs).toHaveLength(1);
    expect(mutationArgs).toHaveLength(2);
    expect(mutationArgs.some((args) => "proposal" in args)).toBe(false);
    expect(mutationArgs[1]?.communityId).toBe("community_1");
    expect(mutationArgs[1]?.leaseToken).toBe(mutationArgs[0]?.leaseToken);
    expect(warning).toHaveBeenCalledWith("builder_knowledge_build_failed", {
      code: "invalid_architect_output",
      failure_stage: "architecture_proposal",
      failure_reason: "proposal_validation_failed",
    });
  });

  it("fails closed instead of exposing unknown provider errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let mutationCount = 0;
    const ctx = {
      runMutation: async () => {
        mutationCount += 1;
        return mutationCount === 1
          ? {
              ok: true,
              complete: false,
              user_id: "user_owner",
              stage: "architecture",
            }
          : { ok: true, changed: true };
      },
      runAction: async () => ({
        ok: false,
        code: "secret_provider_error_detail",
        failure_reason: "secret_reason",
      }),
      runQuery: async () => ({ candidates: [] }),
    };

    const result = await buildBuilderKnowledgeResourcesCore(ctx, {
      communityId: "community_1",
    });

    expect(result.code).toBe("builder_knowledge_build_failed");
    expect(result).not.toHaveProperty("failure_reason");
  });
});
