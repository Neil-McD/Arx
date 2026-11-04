// A change to the community itself (or its tags) from a person's own AI (the MCP), applied
// with its receipt in one transaction: if either fails, neither happens, so a
// retry after a crash replays the answer instead of making the change again.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const refs = internal as any;

export const applyCommunityOperationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    operation: v.string(),
    input: v.any(),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    attemptToken: v.string(),
    // The answer without its result: { ok, operation, receipt }.
    answer: v.any(),
  },
  handler: async (ctx, args) => {
    const scope = { userId: args.userId, communityId: args.communityId };
    const input = args.input as Record<string, unknown>;
    const result = args.operation === "community.settings.update"
      ? await ctx.runMutation(refs.communityLifecycle.updateCommunityProfileForTrustedUserInternal, {
        ...scope, expectedSettingsRevision: input.expected_revision,
        ...("name" in input ? { name: input.name } : {}), ...("slug" in input ? { slug: input.slug } : {}),
        ...("one_liner" in input ? { oneLiner: input.one_liner } : {}), ...("about" in input ? { about: input.about } : {}),
        ...("visibility" in input ? { visibility: input.visibility } : {}) })
      : args.operation === "community.join_mode.set"
        ? await ctx.runMutation(refs.communityAdmin.setCommunityFreeAccessModeForTrustedUserInternal, { ...scope, mode: input.mode })
      : args.operation === "community.agent.instructions.set"
        ? await ctx.runMutation(refs.communityAgent.setCommunityAgentInstructionsForTrustedUserInternal, { ...scope, text: input.text })
      : args.operation === "community.handbook.save_draft"
        ? await ctx.runMutation(refs.communityHandbook.saveCommunityHandbookDraftForTrustedUserInternal, { ...scope, text: input.text })
      : args.operation === "community.handbook.approve"
        ? await ctx.runMutation(refs.communityHandbook.approveCommunityHandbookForTrustedUserInternal, { ...scope, text: input.text })
      : args.operation === "community.tags.create"
        ? await ctx.runMutation(refs.communityTags.createCommunityTagForTrustedUserInternal, { ...scope, name: input.name })
      : args.operation === "community.tags.rename"
        ? await ctx.runMutation(refs.communityTags.renameCommunityTagForTrustedUserInternal, { ...scope, tag: input.tag, name: input.name })
      : args.operation === "community.tags.delete"
        ? await ctx.runMutation(refs.communityTags.deleteCommunityTagForTrustedUserInternal, { ...scope, tag: input.tag })
      : (() => { throw new Error("operation_not_found"); })();
    const value = { ...args.answer, result };
    const completed = await ctx.runMutation(refs.polynetCanonicalReceipts.completeCanonicalOperationReceiptInternal, {
      ...scope, principalKind: "external_mcp", toolName: "polynet_call", idempotencyKey: args.idempotencyKey,
      requestFingerprint: args.requestFingerprint, attemptToken: args.attemptToken, result: value,
    });
    return completed.deduped === true ? { replayed: completed.result } : { value };
  },
});
