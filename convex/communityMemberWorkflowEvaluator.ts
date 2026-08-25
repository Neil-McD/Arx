import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import {
  claimCommunityInferenceFundingSession,
  failCommunityInferenceFundingSession,
  markCommunityInferenceFundingSessionProviderStarted,
  providerFailureIsKnownPreSpend,
  resolveCommunityInferenceFundingForAction,
  settleCommunityInferenceFundingSession,
  type CommunityInferenceFundingSession,
} from "./founderInferenceRuntime";
import {
  buildCommunityMemberWorkflowEvaluatorMessages,
  parseCommunityMemberWorkflowModelAssessment,
  type CommunityMemberWorkflowEvaluationEvidence,
} from "../shared/communityMemberWorkflowEvaluator";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelFailureInput,
  type RuntimeKernelToolExecutionResult,
} from "../shared/runtimeKernelTypes";
import type { NativeToolAwareCompletionSuccess } from "../shared/nativeToolProtocol";

const EVALUATOR_MAX_OUTPUT_TOKENS = 2_400;

type EvaluationContext = {
  evaluation_id: string;
  community_id: string;
  sponsor_user_id: string;
  milestone_key: string;
  milestone_name: string;
  milestone_entered_at: string;
  evidence_through_at: string;
  checks_hash: string;
  judgment_checks: Array<{ key: string; criterion: string }>;
  evidence: CommunityMemberWorkflowEvaluationEvidence[];
};

type EvaluationActionResult = {
  status: string;
  pass_id?: string | null;
  workflow_completed?: boolean;
  replayed?: boolean;
};

function coerceToollessCompletion(
  completion: NativeToolAwareCompletionSuccess<string> | RuntimeKernelFailureInput,
): NativeToolAwareCompletionSuccess<string> | RuntimeKernelFailureInput {
  if (completion.ok === false || completion.type === "assistant") return completion;
  return {
    ok: false,
    status: 400,
    code: "community_member_workflow_evaluator_tool_call_forbidden",
    message: "The milestone evaluator attempted to call a tool.",
  };
}

function toolForbidden(): RuntimeKernelToolExecutionResult {
  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode: "community_member_workflow_evaluator_tool_call_forbidden",
    errorMessage: "The milestone evaluator has no tools.",
  };
}

export const runMilestoneEvaluationInternal = internalAction({
  args: {
    evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations"),
  },
  handler: async (ctx, args): Promise<EvaluationActionResult> => {
    const claim = await ctx.runMutation(
      internal.communityMemberWorkflows.claimMilestoneEvaluationInternal,
      { evaluationId: args.evaluationId },
    );
    if (!claim?.ok || !claim.claim_token) {
      return { status: claim?.code ?? "not_claimed" };
    }
    const claimToken = String(claim.claim_token);
    const sourceRunId = `workflow-milestone-evaluation:${String(args.evaluationId)}:${claimToken}`;
    let fundingSession: CommunityInferenceFundingSession | null = null;
    let providerStarted = false;
    let promptTokens = 0;
    let completionTokens = 0;
    let usageComplete = true;
    try {
      const context = await ctx.runQuery(
        internal.communityMemberWorkflows.buildMilestoneEvaluationContextInternal,
        {
          evaluationId: args.evaluationId,
          claimToken,
        },
      );

      if (context.evidence.length === 0) {
        return await ctx.runMutation(
          internal.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
          {
            evaluationId: args.evaluationId,
            claimToken,
            evaluatorKind: "deterministic",
            checkResults: context.judgment_checks.map((check) => ({
              checkKey: check.key,
              decision: "uncertain" as const,
              evidenceRefs: [],
              explanation: "No eligible member evidence was available in this milestone window.",
              missingEvidence: ["Evidence that directly establishes this check."],
            })),
            nowMs: Date.now(),
          },
        );
      }

      const funding = await resolveCommunityInferenceFundingForAction(
        ctx,
        context.community_id,
      );
      fundingSession = await claimCommunityInferenceFundingSession({
        ctx,
        communityId: context.community_id,
        actorUserId: context.sponsor_user_id,
        surface: "community_workflow_milestone_evaluation",
        receiptKey: `community_workflow_milestone_evaluation:${String(args.evaluationId)}:${claimToken}`,
        sourceRunId,
        admission: funding,
      });
      const messages = buildCommunityMemberWorkflowEvaluatorMessages({
        milestoneName: context.milestone_name,
        milestoneEnteredAt: context.milestone_entered_at,
        evidenceThroughAt: context.evidence_through_at,
        judgmentChecks: context.judgment_checks,
        evidence: context.evidence,
      });
      const result = await runNativeRuntimeKernel<string>({
        messages,
        budget: {
          ...DEFAULT_RUNTIME_KERNEL_BUDGET,
          maxToolSteps: 0,
          maxConsecutiveFailures: 1,
          maxNoProgressSteps: 1,
        },
        inputBudget: {
          transport: "openai_responses",
          modelRef: `openai/${fundingSession.modelId}`,
          reservedOutputTokens: EVALUATOR_MAX_OUTPUT_TOKENS,
          toolSchemas: [],
          recordPlan: () => undefined,
          recordProjection: () => undefined,
        },
        runCompletion: async (kernelMessages) => {
          if (!providerStarted) {
            await markCommunityInferenceFundingSessionProviderStarted({
              ctx,
              session: fundingSession!,
            });
            providerStarted = true;
          }
          const completion = await runOpenAiNativeToolCompletion({
            modelId: fundingSession!.modelId,
            messages: kernelMessages,
            maxTokens: EVALUATOR_MAX_OUTPUT_TOKENS,
            tools: [],
            parallelToolCalls: false,
          });
          if (completion.ok !== false) {
            if (
              completion.promptTokens === null ||
              completion.completionTokens === null
            ) {
              usageComplete = false;
            } else {
              promptTokens += Math.max(0, Math.floor(completion.promptTokens));
              completionTokens += Math.max(
                0,
                Math.floor(completion.completionTokens),
              );
            }
          }
          return coerceToollessCompletion(completion);
        },
        normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
        executeTool: async () => toolForbidden(),
      });

      if (!result.ok) {
        throw Object.assign(new Error(result.message), {
          code: result.code,
          retryable: result.stopReason === "model_error",
        });
      }
      if (!usageComplete) {
        throw Object.assign(new Error("provider_token_usage_missing"), {
          code: "provider_token_usage_missing",
          retryable: false,
        });
      }
      await settleCommunityInferenceFundingSession({
        ctx,
        session: fundingSession,
        promptTokens,
        completionTokens,
        usageComplete: true,
        outcomeCode: "milestone_evaluation_completed",
      });
      fundingSession = null;

      const assessment = parseCommunityMemberWorkflowModelAssessment({
        outputText: result.assistantText,
        allowedEvidenceRefs: context.evidence.map((item) => item.ref),
        expectedCheckKeys: context.judgment_checks.map((check) => check.key),
      });
      return await ctx.runMutation(
        internal.communityMemberWorkflows.finalizeMilestoneEvaluationInternal,
        {
          evaluationId: args.evaluationId,
          claimToken,
          evaluatorKind: "model",
          checkResults: assessment.results.map((result) => ({
            checkKey: result.check_key,
            decision: result.decision,
            evidenceRefs: result.evidence_refs,
            explanation: result.explanation,
            missingEvidence: result.missing_evidence,
          })),
          nowMs: Date.now(),
        },
      );
    } catch (error) {
      const failure =
        error && typeof error === "object"
          ? (error as { code?: unknown; message?: unknown; retryable?: unknown })
          : null;
      const errorCode = String(
        failure?.code ?? failure?.message ?? "evaluation_failed",
      )
        .trim()
        .slice(0, 120);
      if (fundingSession) {
        try {
          await failCommunityInferenceFundingSession({
            ctx,
            session: fundingSession,
            promptTokens,
            completionTokens,
            usageComplete,
            failureCode: errorCode,
            disposition:
              !providerStarted || providerFailureIsKnownPreSpend(errorCode)
                ? "failed"
                : "indeterminate",
          });
        } catch {
          // The durable evaluation failure below remains the operational receipt.
        }
      }
      return await ctx.runMutation(
        internal.communityMemberWorkflows.failMilestoneEvaluationInternal,
        {
          evaluationId: args.evaluationId,
          claimToken,
          errorCode,
          retryable: failure?.retryable === true,
          nowMs: Date.now(),
        },
      );
    }
  },
});
