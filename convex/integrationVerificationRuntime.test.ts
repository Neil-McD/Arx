import {expect, test, vi} from "vitest";
import {admittedConnectionMetadata} from "./communityIntegrationActions";
import type {IntegrationReceiptIntent} from "./communityIntegrationReceiptIntent";

const intent = {bindingId: "binding", generation: 1, connectedAccountId: "account",
  providerUserId: "opaque", authConfigId: "config", version: "20260826_00",
  tool: "HUBSPOT_LIST_GRANTED_SCOPES"} as IntegrationReceiptIntent;
const who = {communityId: "community", userId: "member"};
const metadata = {portalId: "247370940", scopes: ["crm.objects.contacts.read"]};
test("receipt admission and fresh dispatch precede metadata; finalization precedes return", async () => {
  const events: string[] = [];
  const calls: any[] = [];
  const ctx = {runMutation: vi.fn(async (_ref, args) => {
    calls.push(args);
    events.push(args.sourceRunId ? "claim" : args.outcome ? "finalize" : "start");
    return args.outcome ? {ok: true, status: "settled"} : {ok: true, dispatchAuthorized: true};
  })};
  const execute = vi.fn(async () => {events.push("provider"); return metadata;});
  expect(await admittedConnectionMetadata(ctx, who, intent)(execute)).toEqual(metadata);
  expect(events).toEqual(["claim", "start", "provider", "finalize"]);
  expect(calls[0]).toMatchObject({actorUserId: "member", communityId: "community",
    sourceRunId: "integration_connection:binding:1", toolCallId: "verify_scopes", integrationIntent: intent});
  expect(calls[2].rawVendorCostUsd).toBeUndefined();
});
test("denied admission never executes or finalizes provider work", async () => {
  const ctx = {runMutation: vi.fn(async () => ({ok: false}))};
  const execute = vi.fn();
  await expect(admittedConnectionMetadata(ctx, who, intent)(execute)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  expect(ctx.runMutation).toHaveBeenCalledTimes(1);
});
test.each(["replayed", "expired", "provider", "finalize"])("fails closed on %s without retry", async failure => {
  let n = 0;
  const ctx = {runMutation: vi.fn(async (_ref: unknown, _args: Record<string, unknown>) => {
    n++;
    if (n === 1) return {ok: true};
    if (n === 2) return {ok: failure !== "expired", dispatchAuthorized: true, replayed: failure === "replayed"};
    if (n === 3 && failure === "finalize") return {ok: true, status: "indeterminate"};
    return {ok: true};
  })};
  const execute = vi.fn(async () => {
    if (failure === "provider") throw new Error("secret upstream error");
    return metadata;
  });
  await expect(admittedConnectionMetadata(ctx, who, intent)(execute)).rejects.toThrow("integration_metadata_unverified");
  expect(execute).toHaveBeenCalledTimes(["provider", "finalize"].includes(failure) ? 1 : 0);
  expect(ctx.runMutation.mock.calls[ctx.runMutation.mock.calls.length - 1][1]).toMatchObject({failureCode: "integration_verification_incomplete"});
});
