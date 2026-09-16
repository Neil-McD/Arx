import { describe, expect, test, vi } from "vitest";
import {
  canActivateIntegrationBinding,
  executeCommunityIntegrationRead,
  type IntegrationBinding,
  type IntegrationReadSnapshot,
  type IntegrationReadIntent,
} from "./communityIntegrationReadCore";

const request = {
  communityId: "c1",
  userId: "u1",
  runId: "r1",
  toolCallId: "call1",
  contactId: "123",
};
const binding: IntegrationBinding = {
  _id: "binding" as IntegrationBinding["_id"],
  communityId: "c1",
  ownerUserId: "u1",
  provider: "composio",
  toolkit: "hubspot",
  providerUserId: "opaque",
  authConfigId: "config",
  connectedAccountId: "account",
  generation: 1,
  status: "active",
  scopes: ["crm.objects.contacts.read"],
};
test.each([
  ["crm.objects.contacts.read", "oauth"],
  ["crm.objects.contacts.read"],
])("activation accepts only the pilot scope ceiling %j", (...scopes) => {
  const pending = { ...binding, status: "pending" as const, expiresAt: 2000 };
  expect(canActivateIntegrationBinding(pending, { ...binding, toolkit: "hubspot", active: true, scopes }, 1000)).toBe(true);
});
test.each(["crm.objects.contacts.write", "crm.objects.deals.read", "unknown", " oauth"])("extra scope blocks activation and read: %s", async extra => {
  const scopes = ["crm.objects.contacts.read", extra];
  const pending = { ...binding, status: "pending" as const, expiresAt: 2000 };
  expect(canActivateIntegrationBinding(pending, { ...binding, toolkit: "hubspot", active: true, scopes }, 1000)).toBe(false);
  const { deps } = fixture({ binding: { ...binding, scopes } });
  expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(false);
  expect(deps.claim).not.toHaveBeenCalled();
  expect(deps.execute).not.toHaveBeenCalled();
});
function fixture(patch: Partial<IntegrationReadSnapshot> = {}) {
  const snapshot: IntegrationReadSnapshot = {
    enabled: true,
    memberAuthorized: true,
    binding: { ...binding },
    approvedContactId: "123",
    ...patch,
  };
  const deps = {
    load: vi.fn(async () => snapshot),
    claim: vi.fn(async (_intent: IntegrationReadIntent): Promise<{receiptKey:string;claimToken:string} | null> => ({receiptKey:"receipt",claimToken:"claim"})),
    start: vi.fn(async () => true),
    execute: vi.fn(
      async (): Promise<unknown> => ({
        successful: true,
        data: {
          id: "123",
          archived: false,
          createdAt: "2026-09-11T00:00:00Z",
          updatedAt: "2026-09-11T00:00:00Z",
          properties: { firstname: "Test", email: "must-not-leak" },
        },
      }),
    ),
    finalize: vi.fn(async () => {}),
  };
  return { snapshot, deps };
}
test("read pins account/version and projects only bounded fields and attributed receipt", async () => {
  const { deps } = fixture();
  const result = await executeCommunityIntegrationRead(request, deps);
  expect(result).toEqual({
    ok: true,
    value: { id: "123", properties: { firstname: "Test" }, untrusted: true },
  });
  expect(deps.execute).toHaveBeenCalledWith({
    tool: "HUBSPOT_READ_CONTACT",
    version: "20260826_00",
    userId: "opaque",
    connectedAccountId: "account",
    arguments: {
      contactId: "123",
      properties: ["firstname", "lastname"],
      archived: false,
    },
  });
  expect(deps.finalize).toHaveBeenCalledWith(
    {receiptKey:"receipt",claimToken:"claim"},
    expect.objectContaining({
      costEvidence: "unknown",
      outcome: "ok",
      phase: "provider_started",
    }),
  );
});
describe("denials never execute", () => {
  test.each([
    { enabled: false },
    { memberAuthorized: false },
    { binding: null },
    { approvedContactId: "456" },
    ...[
      { ownerUserId: "other" },
      { communityId: "other" },
      { status: "disconnected" },
      { status: "pending" },
      { scopes: [] },
      { connectedAccountId: "" },
      { providerUserId: "" },
      { authConfigId: "" },
    ].map((p) => ({ binding: { ...binding, ...p } as IntegrationBinding })),
  ])("%j", async (patch) => {
    const { deps } = fixture(patch);
    expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(
      false,
    );
    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.claim).not.toHaveBeenCalled();
  });
  test("budget exhausted or unavailable", async () => {
    const { deps } = fixture();
    deps.claim.mockResolvedValue(null);
    expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(
      false,
    );
    deps.claim.mockRejectedValue(new Error("budget unavailable"));
    expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(
      false,
    );
    expect(deps.execute).not.toHaveBeenCalled();
  });
  test("disconnect while reserving", async () => {
    const { deps, snapshot } = fixture();
    deps.claim.mockImplementation(async () => {
      snapshot.binding = { ...binding, status: "disconnected", generation: 2 };
      return {receiptKey:"receipt",claimToken:"claim"};
    });
    expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(
      false,
    );
    expect(deps.execute).not.toHaveBeenCalled();
  });
});
test("late disconnect suppresses result; no automatic retry", async () => {
  const { deps, snapshot } = fixture();
  deps.execute.mockImplementation(async () => {
    snapshot.binding = { ...binding, status: "disconnected", generation: 2 };
    return { successful: true, data: { id: "123", archived: false, createdAt: "now", updatedAt: "now", properties: {} } };
  });
  expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(false);
  expect(deps.execute).toHaveBeenCalledTimes(1);
  expect(deps.finalize).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({outcome: "integration_connection_changed"}));
});
test.each([
  undefined,
  { successful: false },
  { successful: true, data: { id: "wrong" } },
  { data: "x".repeat(17000) },
])("invalid/large result fails safely", async (raw) => {
  const { deps } = fixture();
  deps.execute.mockResolvedValue(raw);
  expect((await executeCommunityIntegrationRead(request, deps)).ok).toBe(false);
});
test("provider exception and receipt failure never disclose payload", async () => {
  const { deps } = fixture();
  deps.execute.mockRejectedValue(new Error("SECRET vendor credential"));
  expect(
    JSON.stringify(await executeCommunityIntegrationRead(request, deps)),
  ).not.toContain("SECRET");
  expect(deps.execute).toHaveBeenCalledTimes(1);
  deps.finalize.mockRejectedValue(new Error("receipt"));
  expect(await executeCommunityIntegrationRead(request, deps)).toMatchObject({
    ok: false,
    code: "integration_receipt_failed",
  });
});
test.each([
  {id: 123}, {properties: null}, {properties: {firstname: 7}}, {archived: true},
])("read core rejects schema drift and finalizes safely: %j", async (patch) => {
  const {deps} = fixture();
  deps.execute.mockResolvedValue({successful: true, data: {
    id: "123", archived: false, createdAt: "2026-09-11", updatedAt: "2026-09-11", properties: {}, ...patch,
  }});
  expect(await executeCommunityIntegrationRead(request, deps)).toMatchObject({ok: false, code: "integration_invalid_result"});
  expect(deps.execute).toHaveBeenCalledTimes(1);
  expect(deps.finalize).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({outcome: "integration_invalid_result", costEvidence: "unknown"}));
});
test("missing trusted call identity fails before admission",async()=>{
  const {deps}=fixture();
  expect((await executeCommunityIntegrationRead({...request,toolCallId:""},deps)).ok).toBe(false);
  expect(deps.claim).not.toHaveBeenCalled();
});
test("claim carries exact intent; start precedes execution and finalize uses same claim",async()=>{
  const {deps}=fixture();const order:string[]=[];
  deps.start.mockImplementation(async()=>{order.push("start");return true;});
  deps.execute.mockImplementation(async()=>{order.push("execute");return {successful:true,data:{id:"123"}};});
  deps.finalize.mockImplementation(async()=>{order.push("finalize");});
  await executeCommunityIntegrationRead(request,deps);
  expect(deps.claim).toHaveBeenCalledWith({...request,bindingId:"binding",connectedAccountId:"account",providerUserId:"opaque",authConfigId:"config",generation:1,tool:"HUBSPOT_READ_CONTACT",version:"20260826_00"});
  expect(deps.start).toHaveBeenCalledWith({receiptKey:"receipt",claimToken:"claim"});
  expect(order).toEqual(["start","execute","finalize"]);
});
test("duplicate call is denied by atomic mock claim; a distinct call can run",async()=>{
  const {deps}=fixture();const claims=new Set<string>();
  deps.claim.mockImplementation(async intent=>{
    const key=intent.runId+":"+intent.toolCallId;
    if(claims.has(key))return null;
    claims.add(key);return {receiptKey:key,claimToken:"claim"};
  });
  const results=await Promise.all([executeCommunityIntegrationRead(request,deps),executeCommunityIntegrationRead(request,deps)]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);expect(deps.execute).toHaveBeenCalledTimes(1);
  await executeCommunityIntegrationRead({...request,toolCallId:"call2"},deps);
  expect(deps.execute).toHaveBeenCalledTimes(2);
});
test("disconnect after claim finalizes without provider start",async()=>{
  const {deps,snapshot}=fixture();
  deps.claim.mockImplementation(async()=>{snapshot.binding=null;return {receiptKey:"receipt",claimToken:"claim"};});
  await executeCommunityIntegrationRead(request,deps);
  expect(deps.start).not.toHaveBeenCalled();expect(deps.execute).not.toHaveBeenCalled();
  expect(deps.finalize).toHaveBeenCalledWith({receiptKey:"receipt",claimToken:"claim"},{phase:"not_started",outcome:"integration_connection_changed",costEvidence:"unknown"});
});
test.each(["deny","throw"])("start %s never executes and cannot claim zero spend",async(mode)=>{
  const {deps}=fixture();
  deps.start.mockImplementation(async()=>{if(mode==="throw")throw Error("private");return false;});
  await executeCommunityIntegrationRead(request,deps);
  expect(deps.execute).not.toHaveBeenCalled();
  expect(deps.finalize).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({phase:"start_uncertain",costEvidence:"unknown"}));
});
test("disconnect during start prevents dispatch and preserves conservative receipt state",async()=>{
  const {deps,snapshot}=fixture();
  deps.start.mockImplementation(async()=>{snapshot.binding=null;return true;});
  await executeCommunityIntegrationRead(request,deps);
  expect(deps.execute).not.toHaveBeenCalled();
  expect(deps.finalize).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({phase:"provider_started",outcome:"integration_connection_changed"}));
});
test("provider timeout finalizes as post-start uncertainty without retry",async()=>{
  const {deps}=fixture();deps.execute.mockRejectedValue(Error("timeout"));
  await executeCommunityIntegrationRead(request,deps);
  expect(deps.execute).toHaveBeenCalledTimes(1);
  expect(deps.finalize).toHaveBeenCalledWith(expect.anything(),{phase:"provider_started",outcome:"integration_provider_failed",costEvidence:"unknown"});
});
test("activation requires unexpired pending generation and exact provider identity", () => {
  const pending = { ...binding, status: "pending" as const, expiresAt: 100 };
  const verified = { ...binding, active: true };
  expect(canActivateIntegrationBinding(pending, verified, 99)).toBe(true);
  for (const p of [
    { status: "disconnected" },
    { generation: 2 },
    { expiresAt: 99 },
    { authConfigId: "wrong" },
    { connectedAccountId: "wrong" },
    { providerUserId: "wrong" },
  ]) {
    expect(
      canActivateIntegrationBinding(
        { ...pending, ...p } as IntegrationBinding,
        verified,
        99,
      ),
    ).toBe(false);
  }
  expect(
    canActivateIntegrationBinding(pending, { ...verified, scopes: [] }, 99),
  ).toBe(false);
});
