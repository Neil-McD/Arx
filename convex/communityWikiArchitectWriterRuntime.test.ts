import { beforeEach, expect, test, vi } from "vitest";
import { draftCommunityResourceContentFromSources } from "./communityWikiArchitect";
import { startFundedInferenceRun } from "./fundedInferenceGateway";

vi.mock("./fundedInferenceGateway", () => ({ startFundedInferenceRun: vi.fn() }));
vi.mock("./founderInferenceRuntime", () => ({
  resolveCommunityInferenceFundingForAction: vi.fn().mockResolvedValue({ ok: true, mode: "platform_subscription" }),
}));

const candidates = ["first", "second", "third"].map((name, index) => ({
  page_id: `page-${name}`,
  page_title: `Page ${name}`,
  page_module: "Guide",
  source_resource_id: "source-1",
  source_title: "Founder source",
  source_body_md: "Founder's source material with concrete setup steps.",
  source_url: null,
  expected_updated_at: 100 + index,
  expected_source_revision_hash: "source-revision",
}));
const args = { userId: "owner", communityId: "community", requestId: "writer-batch-test" };

function context(rows = candidates) {
  return { user_id: "owner", community: { id: "community", name: "Test" }, candidates: rows };
}

function providerText(body: string) {
  return {
    ok: true as const,
    type: "assistant" as const,
    assistantText: JSON.stringify({ body_md: body }),
    promptTokens: 100,
    completionTokens: 50,
  };
}

beforeEach(() => vi.clearAllMocks());

test("writer settles complete usage before applying drafts and preserves a partial page failure", async () => {
  const order: string[] = [];
  let calls = 0;
  const fundedRun = {
    request: vi.fn(async () => {
      order.push("provider");
      calls += 1;
      return calls === 1
        ? providerText("The founder verifies the goal, records the next action, and checks completion with a human reviewer.")
        : providerText("too short");
    }),
    usage: () => ({ promptTokens: 200, completionTokens: 100, complete: true }),
    settle: vi.fn(async () => { order.push("settle"); return true; }),
    fail: vi.fn(),
  };
  vi.mocked(startFundedInferenceRun).mockResolvedValue(fundedRun as any);
  const ctx = {
    runQuery: vi.fn().mockResolvedValue(context(candidates.slice(0, 2))),
    runMutation: vi.fn(async (_ref: unknown, input: { pageId: string }) => {
      order.push("patch");
      return { id: input.pageId, title: "Page first", status: "review", source_resource_id: "source-1" };
    }),
  };

  const result = await (draftCommunityResourceContentFromSources as any)._handler(ctx, args);
  expect(result).toMatchObject({ ok: false, candidates: 2, drafted: 1, failed: 1,
    usage: { prompt_tokens: 200, completion_tokens: 100 } });
  expect(order).toEqual(["provider", "provider", "settle", "patch"]);
  expect(fundedRun.settle).toHaveBeenCalledWith("resource_content_writer_partial_failure");
  expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  expect(fundedRun.fail).not.toHaveBeenCalled();
});

test("unknown usage stops the batch and prevents every draft write", async () => {
  let calls = 0;
  let complete = true;
  const fundedRun = {
    request: vi.fn(async () => {
      calls += 1;
      if (calls === 2) complete = false;
      return providerText("The founder verifies the goal, records the next action, and checks completion with a human reviewer.");
    }),
    usage: () => ({ promptTokens: 200, completionTokens: 100, complete }),
    settle: vi.fn().mockResolvedValue(false),
    fail: vi.fn(),
  };
  vi.mocked(startFundedInferenceRun).mockResolvedValue(fundedRun as any);
  const ctx = { runQuery: vi.fn().mockResolvedValue(context()), runMutation: vi.fn() };

  const result = await (draftCommunityResourceContentFromSources as any)._handler(ctx, args);
  expect(result).toMatchObject({ ok: false, drafted: 0, code: "provider_token_usage_missing" });
  expect(fundedRun.request).toHaveBeenCalledTimes(2);
  expect(fundedRun.settle).toHaveBeenCalledTimes(1);
  expect(ctx.runMutation).not.toHaveBeenCalled();
});

test("budget exhaustion stops further calls but settles and applies prior complete work", async () => {
  const order: string[] = [];
  let calls = 0;
  const fundedRun = {
    request: vi.fn(async () => {
      calls += 1;
      order.push("provider-attempt");
      if (calls === 2) throw new Error("founder_inference_run_budget_exhausted");
      return providerText("The founder verifies the goal, records the next action, and checks completion with a human reviewer.");
    }),
    usage: () => ({ promptTokens: 100, completionTokens: 50, complete: true }),
    settle: vi.fn(async () => { order.push("settle"); return true; }),
    fail: vi.fn(),
  };
  vi.mocked(startFundedInferenceRun).mockResolvedValue(fundedRun as any);
  const ctx = {
    runQuery: vi.fn().mockResolvedValue(context()),
    runMutation: vi.fn(async (_ref: unknown, input: { pageId: string }) => {
      order.push("patch");
      return { id: input.pageId, title: "Page first", status: "review", source_resource_id: "source-1" };
    }),
  };
  const result = await (draftCommunityResourceContentFromSources as any)._handler(ctx, args);
  expect(result).toMatchObject({ ok: false, drafted: 1, failed: 1 });
  expect(fundedRun.request).toHaveBeenCalledTimes(2);
  expect(order).toEqual(["provider-attempt", "provider-attempt", "settle", "patch"]);
});

test("stale source after settlement fails the page without changing provider accounting", async () => {
  const order: string[] = [];
  const fundedRun = {
    request: vi.fn().mockResolvedValue(providerText(
      "The founder verifies the goal, records the next action, and checks completion with a human reviewer.",
    )),
    usage: () => ({ promptTokens: 100, completionTokens: 50, complete: true }),
    settle: vi.fn(async () => { order.push("settle"); return true; }),
    fail: vi.fn(),
  };
  vi.mocked(startFundedInferenceRun).mockResolvedValue(fundedRun as any);
  const ctx = {
    runQuery: vi.fn().mockResolvedValue(context(candidates.slice(0, 1))),
    runMutation: vi.fn(async () => {
      order.push("patch");
      throw new Error("community_resource_content_writer_source_changed");
    }),
  };
  const result = await (draftCommunityResourceContentFromSources as any)._handler(ctx, args);
  expect(result).toMatchObject({ ok: false, drafted: 0, failed: 1,
    failures: [{ message: "community_resource_content_writer_source_changed" }] });
  expect(order).toEqual(["settle", "patch"]);
  expect(fundedRun.fail).not.toHaveBeenCalled();
});

test("zero candidates never claim funding", async () => {
  const ctx = { runQuery: vi.fn().mockResolvedValue(context([])), runMutation: vi.fn() };
  const result = await (draftCommunityResourceContentFromSources as any)._handler(ctx, args);
  expect(result).toMatchObject({ ok: true, candidates: 0, drafted: 0 });
  expect(startFundedInferenceRun).not.toHaveBeenCalled();
});
