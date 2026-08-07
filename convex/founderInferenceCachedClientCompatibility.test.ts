/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./founderInference.ts",
  "./_generated/**/*.*s",
]);

test("cached founder inference status is inert and hides the retired BYOK lane", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.founderInference.getCurrentFounderInferenceStatus, {
    authSubject: "cached-client-subject",
  })).resolves.toEqual({
    eligible: false,
    cohort_key: null,
    status: null,
    key_connected: false,
    key_last_four: null,
    activated_at: null,
    suspended_at: null,
    communities: [],
  });
});

test("cached activation fails explicitly without creating authority", async () => {
  const t = convexTest(schema, modules);
  await expect(t.action(api.founderInference.activateFounderInference, {
    authSubject: "cached-client-subject",
    acceptedTerms: true,
    acceptedTermsVersion: "community_owner_inference_funding_v2",
  })).rejects.toThrow("founder_inference_byok_retired");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("userProviderConnections").collect()).toHaveLength(0);
    expect(await ctx.db.query("legalAcceptances").collect()).toHaveLength(0);
  });
});

test("cached suspension is an inert successful tombstone", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.founderInference.suspendFounderInference, {
    authSubject: "cached-client-subject",
  })).resolves.toEqual({
    ok: true,
    status: "retired",
    reason: "founder_inference_byok_retired",
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("userProviderConnections").collect()).toHaveLength(0);
  });
});
