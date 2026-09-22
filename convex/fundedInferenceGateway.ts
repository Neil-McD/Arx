import { assertPaidLuna6ProviderHeadroom } from "./founderInferenceBudget";
import {
  createFounderInferenceUsageTotals,
  founderProviderRequests,
  observeFounderProviderResult,
} from "./founderInferenceUsage";
import {
  claimCommunityInferenceFundingSession,
  failCommunityInferenceFundingSession,
  markCommunityInferenceFundingSessionProviderStarted,
  providerFailureIsKnownPreSpend,
  settleCommunityInferenceFundingSession,
} from "./founderInferenceRuntime";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";

type Claim = Parameters<typeof claimCommunityInferenceFundingSession>[0];
type ResponseRequest = Parameters<typeof runOpenAiNativeToolCompletion>[0];

// Product flows own prompts and tools. This handle owns the funded provider
// steps and their request-level accounting, including a multi-step tool loop.
export async function startFundedInferenceRun(args: Claim) {
  const session = await claimCommunityInferenceFundingSession(args);
  const usage = createFounderInferenceUsageTotals(session.modelId);
  let providerStarted = false;
  let finalized = false;

  return {
    modelId: session.modelId,
    usage() {
      return {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        providerRequestCount: usage.providerRequests.length,
        complete: usage.complete,
      };
    },
    async request(input: Omit<ResponseRequest, "modelId">) {
      if (finalized) throw new Error("founder_inference_run_finalized");
      assertPaidLuna6ProviderHeadroom({
        session,
        usage,
        maxOutputTokens: input.maxTokens,
      });
      if (!providerStarted) {
        await markCommunityInferenceFundingSessionProviderStarted({ ctx: args.ctx, session });
        providerStarted = true;
      }
      try {
        const result = await runOpenAiNativeToolCompletion({ ...input, modelId: session.modelId });
        observeFounderProviderResult(usage, result,
          !result.ok && providerFailureIsKnownPreSpend(result.code));
        return result;
      } catch (error) {
        usage.complete = false;
        throw error;
      }
    },
    async settle(outcomeCode: string): Promise<boolean> {
      if (finalized) throw new Error("founder_inference_run_finalized");
      if (!usage.complete) {
        await failCommunityInferenceFundingSession({
          ctx: args.ctx, session,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          providerRequests: founderProviderRequests(usage),
          usageComplete: false,
          failureCode: "provider_token_usage_missing",
          disposition: "indeterminate",
        });
        finalized = true;
        return false;
      }
      await settleCommunityInferenceFundingSession({
        ctx: args.ctx, session,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        providerRequests: founderProviderRequests(usage),
        usageComplete: true,
        outcomeCode,
      });
      finalized = true;
      return true;
    },
    async fail(failureCode: string): Promise<void> {
      if (finalized) throw new Error("founder_inference_run_finalized");
      await failCommunityInferenceFundingSession({
        ctx: args.ctx, session,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        providerRequests: founderProviderRequests(usage),
        usageComplete: usage.complete,
        failureCode,
        disposition: !providerStarted || providerFailureIsKnownPreSpend(failureCode)
          ? "failed" : "indeterminate",
      });
      finalized = true;
    },
  };
}
