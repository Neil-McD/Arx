import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ASSESSMENT_SMOKE_CAMPAIGN, ASSESSMENT_SMOKE_FIXTURES, ASSESSMENT_SMOKE_INPUT_CEILING, ASSESSMENT_SMOKE_MAX_OUTPUT, buildAssessmentSmokeFixture, requireAssessmentSmokeStage } from "../shared/workflowAssessmentSmoke";
import { parseWorkflowGoalAssessment } from "../shared/communityWorkflowAssessment";
import { COMMUNITY_OWNER_FUNDED_MODEL_ID } from "../shared/founderInference";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "../shared/runtimeKernelTypes";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { calculateFounderInferenceCostMicros, requireFounderInferencePricingFromEnv } from "./founderPlanPricing";
import { claimCommunityInferenceFundingSession, failCommunityInferenceFundingSession, markCommunityInferenceFundingSessionProviderStarted, resolveCommunityInferenceFundingForAction, settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";

function stageOnly() { requireAssessmentSmokeStage(process.env.CONVEX_CLOUD_URL); }

// Deployment-credential-only entrypoints; never registered on the public gateway.
export const inspectInternal = internalQuery({ args: {}, handler: async (ctx) => {
  stageOnly();
  const community = await ctx.db.query("communities").withIndex("by_slug", q => q.eq("slug", "concierge-welcome-canary-2026-08-20-b")).unique();
  if (!community) throw new Error("smoke_community_missing");
  const roles = await ctx.db.query("operatorRoles").withIndex("by_user", q => q.eq("userId", community.ownerId)).collect();
  if (!roles.some(role => role.active && role.role === "owner")) throw new Error("smoke_operator_owner_required");
  return { communityId: community._id, actorUserId: community.ownerId };
} });

export const runInternal = internalAction({ args: {}, handler: async (ctx): Promise<any> => {
  stageOnly();
  const identity = await ctx.runQuery((internal as any).workflowAssessmentSmoke.inspectInternal, {});
  const admission = await resolveCommunityInferenceFundingForAction(ctx, identity.communityId);
  // Operator grant avoids touching a customer's paid usage cycle.
  if (!admission.ok || admission.mode !== "platform_operator_grant") throw new Error("smoke_operator_grant_required");
  const pricing = requireFounderInferencePricingFromEnv();
  const perCallCeiling = calculateFounderInferenceCostMicros({ pricing, promptTokens: ASSESSMENT_SMOKE_INPUT_CEILING, completionTokens: ASSESSMENT_SMOKE_MAX_OUTPUT });
  if (perCallCeiling * ASSESSMENT_SMOKE_FIXTURES.length > 1_000_000) throw new Error("smoke_budget_exceeded");
  const fixtures = ASSESSMENT_SMOKE_FIXTURES.map(fixture => ({ fixture, bundle: buildAssessmentSmokeFixture(fixture) }));
  const report: any = { campaign: ASSESSMENT_SMOKE_CAMPAIGN, synthetic: true, model: COMMUNITY_OWNER_FUNDED_MODEL_ID, pricing, maxCostMicros: perCallCeiling * fixtures.length, cases: [], passed: false };
  for (const { fixture, bundle } of fixtures) {
    const receiptKey = `${ASSESSMENT_SMOKE_CAMPAIGN}:${fixture.key}`;
    // A settled, failed, or provider-started receipt blocks all repeat calls.
    const session = await claimCommunityInferenceFundingSession({ ctx, ...identity, surface: "community_workflow_action", receiptKey, sourceRunId: receiptKey, admission });
    let called = false, settled = false, promptTokens = 0, completionTokens = 0, usageComplete = false;
    const inputBudgetEvents: unknown[] = [];
    try {
      const result = await runNativeRuntimeKernel({
        messages: bundle.messages, budget: { ...DEFAULT_RUNTIME_KERNEL_BUDGET, maxToolSteps: 0 },
        inputBudget: { transport: "openai_responses", modelRef: `openai/${COMMUNITY_OWNER_FUNDED_MODEL_ID}`, reservedOutputTokens: ASSESSMENT_SMOKE_MAX_OUTPUT, toolSchemas: [], recordPlan: event => { inputBudgetEvents.push(event); }, recordProjection: event => { inputBudgetEvents.push(event); } },
        runCompletion: async messages => {
          if (called) throw new Error("smoke_provider_retry_forbidden");
          if (new TextEncoder().encode(JSON.stringify(messages)).length > 16_000) throw new Error("smoke_input_too_large");
          called = true;
          stageOnly();
          await markCommunityInferenceFundingSessionProviderStarted({ ctx, session });
          const output = await runOpenAiNativeToolCompletion({ modelId: session.modelId, messages, maxTokens: ASSESSMENT_SMOKE_MAX_OUTPUT, tools: [], parallelToolCalls: false });
          if (output.ok) {
            usageComplete = output.promptTokens != null && output.completionTokens != null;
            promptTokens = output.promptTokens ?? 0; completionTokens = output.completionTokens ?? 0;
          }
          return output;
        },
        normalizeToolArguments: (_name, args) => args,
        executeTool: async () => { throw new Error("smoke_tools_forbidden"); },
      });
      await settleCommunityInferenceFundingSession({ ctx, session, promptTokens, completionTokens, usageComplete, outcomeCode: "synthetic_assessment_smoke" });
      settled = true;
      report.lastAttempt = { key: fixture.key, receiptKey, messages: bundle.messages, inputBudgetEvents, result, promptTokens, completionTokens };
      if (result.ok === false) throw new Error("smoke_model_failed");
      const assessment = parseWorkflowGoalAssessment(result.assistantText, bundle.refs, fixture.truncated);
      const costMicros = calculateFounderInferenceCostMicros({ pricing, promptTokens, completionTokens });
      report.cases.push({ key: fixture.key, expected: fixture.expected, assessment, receiptKey, messages: bundle.messages, promptBundle: bundle.systemPromptBundle, inputBudgetEvents, promptTokens, completionTokens, costMicros, passed: assessment.verdict === fixture.expected });
      if (promptTokens > ASSESSMENT_SMOKE_INPUT_CEILING || completionTokens > ASSESSMENT_SMOKE_MAX_OUTPUT) throw new Error("smoke_usage_bound_exceeded");
    } catch (error) {
      if (!settled) await failCommunityInferenceFundingSession({ ctx, session, promptTokens, completionTokens, usageComplete, failureCode: "synthetic_assessment_smoke_failed", disposition: called ? "indeterminate" : "failed" });
      report.error = error instanceof Error ? error.message : "smoke_failed";
      return report; // Never continue or retry an ambiguous attempt.
    }
  }
  report.passed = report.cases.length === 3 && report.cases.every((item: any) => item.passed);
  delete report.lastAttempt;
  return report;
} });
