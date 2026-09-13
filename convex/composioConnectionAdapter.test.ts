import { test, expect, vi } from "vitest";
import { createComposioConnectionAdapter } from "./composioConnectionAdapter";
import type { AdmitConnectionMetadata } from "./composioConnectionAdapter";
const admit: AdmitConnectionMetadata = execute => execute();
const config = {
  apiKey: "secret",
  authConfigId: "config",
  returnUrl: "https://polynet.example/integrations/callback",
  expectedPortalId: "247370940",
  verifyMetadata: async () => ({portalId: "247370940", scopes: ["crm.objects.contacts.read"]}),
};
const attemptAlias = `pn_${"a".repeat(64)}`;
test.each(["valid", "missing-portal", "wrong-portal", "extra-scope", "provider-error", "denied"])(
  "pinned metadata transport is receipt-gated and fail closed: %s", async mode => {
    const responses = [
      {connected_account_id: "account", toolkit_slug: "hubspot"},
      {id: "account", user_id: "opaque", status: "ACTIVE", auth_config: {id: "config"}, toolkit: {slug: "hubspot"}},
      {successful: mode !== "provider-error", data: {
        hub_id: mode === "missing-portal" ? undefined : mode === "wrong-portal" ? "247370900" : 247370940,
        scopes: ["oauth", "crm.objects.contacts.read", ...(mode === "extra-scope" ? ["crm.objects.contacts.write"] : [])],
        token: "must-not-escape",
      }},
    ];
    const transport = vi.fn(async () => new Response(JSON.stringify(responses.shift())));
    const adapter = createComposioConnectionAdapter({...config, verifyMetadata: undefined}, transport as typeof fetch);
    const gate: AdmitConnectionMetadata = async execute => {
      expect(transport).toHaveBeenCalledTimes(2);
      if (mode === "denied") throw new Error("denied");
      return execute();
    };
    const result = adapter.verify("account", "opaque", "session", gate);
    if (mode === "valid") {
      expect(await result).toMatchObject({active: true, scopes: ["oauth", "crm.objects.contacts.read"]});
    } else await expect(result).rejects.toThrow("integration_metadata_unverified");
    expect(transport).toHaveBeenCalledTimes(mode === "denied" ? 2 : 3);
    if (mode !== "denied") {
      const [url, init] = (transport.mock.calls as unknown as [string, RequestInit][])[2];
      expect(url).toBe("https://backend.composio.dev/api/v3.1/tools/execute/HUBSPOT_LIST_GRANTED_SCOPES");
      expect(init.method).toBe("POST");
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init.body as string)).toEqual({connected_account_id: "account", version: "20260826_00", arguments: {include_token: false}});
    }
  });
test("missing receipt admission fails before any provider HTTP", async () => {
  const transport = vi.fn();
  const adapter = createComposioConnectionAdapter(config, transport);
  await expect(adapter.verify("account", "opaque", "session", undefined as any))
    .rejects.toThrow("integration_receipt_required");
  expect(transport).not.toHaveBeenCalled();
});
test.each([
  {portalId: "other", scopes: ["crm.objects.contacts.read"]},
  {portalId: "", scopes: ["crm.objects.contacts.read"]},
  {portalId: "247370940", scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"]},
  {portalId: "247370940", scopes: []},
])("rejects wrong portal or scopes before activation %j", async metadata => {
  let n = 0;
  const transport = vi.fn(async () => new Response(JSON.stringify(n++ === 0
    ? {connected_account_id: "account", toolkit_slug: "hubspot"}
    : {id: "account", user_id: "opaque", status: "ACTIVE", auth_config: {id: "config"}, toolkit: {slug: "hubspot"}})));
  const verifyMetadata = vi.fn(async () => metadata);
  await expect(createComposioConnectionAdapter({...config, verifyMetadata}, transport as typeof fetch)
    .verify("account", "opaque", "session", admit)).rejects.toThrow("integration_metadata_unverified");
  expect(verifyMetadata).toHaveBeenCalledExactlyOnceWith("account");
  expect(transport).toHaveBeenCalledTimes(2);
});
test.each(["", "member@example.com", "pn_short"])("rejects invalid attempt alias %j before provider work",async(alias)=>{
  const transport=vi.fn();
  await expect(createComposioConnectionAdapter(config,transport as typeof fetch).initiate("opaque",alias)).rejects.toThrow("integration_invalid_attempt");
  expect(transport).not.toHaveBeenCalled();
});

const linkJson = JSON.stringify({connected_account_id:"account",redirect_url:"https://connect.composio.dev/link"});
function streamed(chunks: Uint8Array[], init?: ResponseInit) {
  let index=0;
  const cancel=vi.fn();
  const pull=vi.fn((controller:ReadableStreamDefaultController<Uint8Array>)=>{
    if(index < chunks.length) controller.enqueue(chunks[index++]);
    else controller.close();
  });
  const body=new ReadableStream<Uint8Array>({pull,cancel},{highWaterMark:0});
  const response=new Response(body,init);
  const transport=vi.fn(async()=>response);
  return {body,cancel,pull,transport,adapter:createComposioConnectionAdapter(config,transport as typeof fetch)};
}
test("accepts exactly 64 KiB without using full-body convenience readers",async()=>{
  const bytes=new TextEncoder().encode(linkJson.padEnd(65_536));
  const f=streamed([bytes.subarray(0,123),bytes.subarray(123)]);
  expect(await f.adapter.initiate("opaque", attemptAlias)).toMatchObject({connectedAccountId:"account"});
  expect(f.body.locked).toBe(false);expect(f.cancel).not.toHaveBeenCalled();
});
test.each(["chunked","huge","false-header","unicode"])("cancels oversized %s bodies without another pull or retry",async(kind)=>{
  const encoder=new TextEncoder();
  const chunks=kind === "chunked" ? [encoder.encode(linkJson.padEnd(65_536)),encoder.encode(" "),encoder.encode("unread")]
    : [encoder.encode(kind === "unicode" ? JSON.stringify({padding:"é".repeat(33_000)}) : linkJson.padEnd(65_537)),encoder.encode("unread")];
  const f=streamed(chunks,kind === "false-header" ? {headers:{"content-length":"1"}} : undefined);
  await expect(f.adapter.initiate("opaque", attemptAlias)).rejects.toThrow("integration_provider_unavailable");
  expect(f.pull).toHaveBeenCalledTimes(kind === "chunked" ? 2 : 1);
  expect(f.cancel).toHaveBeenCalledTimes(1);expect(f.body.locked).toBe(false);
  expect(f.transport).toHaveBeenCalledTimes(1);
});
test("decodes multibyte characters split across chunks",async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({connected_account_id:"account",redirect_url:"https://connect.composio.dev/link",label:"é😀"}));
  const f=streamed(Array.from(bytes,b=>new Uint8Array([b])));
  expect(await f.adapter.initiate("opaque", attemptAlias)).toMatchObject({connectedAccountId:"account"});
  expect(f.body.locked).toBe(false);
});
test.each(["", "{", "not json"])("rejects malformed or empty body %j",async(text)=>{
  const f=streamed([new TextEncoder().encode(text)]);
  await expect(f.adapter.initiate("opaque", attemptAlias)).rejects.toThrow("integration_provider_unavailable");
  expect(f.body.locked).toBe(false);expect(f.transport).toHaveBeenCalledTimes(1);
});
test("rejects missing bodies and invalid UTF-8",async()=>{
  const transport=vi.fn(async()=>new Response(null));
  await expect(createComposioConnectionAdapter(config,transport as typeof fetch).initiate("opaque", attemptAlias)).rejects.toThrow("integration_provider_unavailable");
  const f=streamed([new Uint8Array([0xff])]);
  await expect(f.adapter.initiate("opaque", attemptAlias)).rejects.toThrow("integration_provider_unavailable");
  expect(f.body.locked).toBe(false);
});
test("cancels HTTP error bodies without reading them",async()=>{
  const f=streamed([new TextEncoder().encode("secret")],{status:500});
  await expect(f.adapter.initiate("opaque", attemptAlias)).rejects.toThrow("integration_provider_unavailable");
  expect(f.pull).not.toHaveBeenCalled();expect(f.cancel).toHaveBeenCalledTimes(1);
  expect(f.body.locked).toBe(false);expect(f.transport).toHaveBeenCalledTimes(1);
});
test("sanitizes stream errors and releases the reader",async()=>{
  const body=new ReadableStream({pull(c){c.error(new Error("secret vendor error"));}});
  const transport=vi.fn(async()=>new Response(body));
  await expect(createComposioConnectionAdapter(config,transport as typeof fetch).initiate("opaque", attemptAlias)).rejects.toThrow("integration_provider_unavailable");
  expect(body.locked).toBe(false);expect(transport).toHaveBeenCalledTimes(1);
});
test("timeout covers stalled body consumption after headers",async()=>{
  const controller=new AbortController();
  const timeout=vi.spyOn(AbortSignal,"timeout").mockReturnValue(controller.signal);
  let pulled!:()=>void;
  const reading=new Promise<void>(resolve=>{pulled=resolve;});
  const cancel=vi.fn();
  const body=new ReadableStream<Uint8Array>({pull(){pulled();},cancel},{highWaterMark:0});
  const transport=vi.fn(async()=>new Response(body));
  try {
    const result=createComposioConnectionAdapter(config,transport as typeof fetch).initiate("opaque", attemptAlias);
    const rejection=expect(result).rejects.toThrow("integration_provider_unavailable");
    await reading;
    controller.abort(new DOMException("timeout","TimeoutError"));
    await rejection;
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(cancel).toHaveBeenCalled();expect(body.locked).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {timeout.mockRestore();}
});
test("Composio transport binds link, callback identity, account and confirmed revocation", async () => {
  const responses = [
    {
      connected_account_id: "account",
      redirect_url: "https://connect.composio.dev/link",
    },
    { connected_account_id: "account", toolkit_slug: "hubspot" },
    {
      id: "account",
      user_id: "opaque",
      status: "ACTIVE",
      auth_config: { id: "config" },
      toolkit: { slug: "hubspot" },
    },
    { connected_account: { id: "account", status: "REVOKED" } },
  ];
  const transport = vi.fn(
    async () => new Response(JSON.stringify(responses.shift())),
  );
  const adapter = createComposioConnectionAdapter(
    config,
    transport as typeof fetch,
  );
  expect((await adapter.initiate("opaque", attemptAlias)).connectedAccountId).toBe("account");
  expect(await adapter.verify("account", "opaque", "single-use", admit)).toMatchObject(
    {
      active: true,
      providerUserId: "opaque",
      scopes: ["crm.objects.contacts.read"],
    },
  );
  await adapter.revoke("account");
  expect(transport).toHaveBeenCalledTimes(4);
  expect(transport).toHaveBeenNthCalledWith(
    1,
    "https://backend.composio.dev/api/v3/connected_accounts/link",
    expect.objectContaining({
      redirect: "error",
      body: JSON.stringify({
        user_id: "opaque",
        auth_config_id: "config",
        callback_url: config.returnUrl,
        alias: attemptAlias,
      }),
    }),
  );
});
test("redirect and provider failures fail closed without retry or raw exceptions", async () => {
  const transport = vi.fn(async () => {
    throw new Error("secret vendor response");
  });
  await expect(
    createComposioConnectionAdapter(config, transport as typeof fetch).initiate(
      "opaque", attemptAlias,
    ),
  ).rejects.toThrow("integration_provider_unavailable");
  expect(transport).toHaveBeenCalledTimes(1);
  const hostile = async () =>
    new Response(
      JSON.stringify({
        connected_account_id: "account",
        redirect_url: "https://evil.example/",
      }),
    );
  await expect(
    createComposioConnectionAdapter(config, hostile as typeof fetch).initiate(
      "opaque", attemptAlias,
    ),
  ).rejects.toThrow("integration_invalid_link");
});
test.each([
  "wrong-account",
  "wrong-user",
  "wrong-config",
  "wrong-toolkit",
  "shared",
  "disabled",
])("rejects %s verification", async (variant) => {
  let n = 0;
  const response: any = {
    id: "account",
    user_id: "opaque",
    status: "ACTIVE",
    auth_config: { id: "config" },
    toolkit: { slug: "hubspot" },
  };
  if (variant === "wrong-account") response.id = "wrong";
  if (variant === "wrong-user") response.user_id = "wrong";
  if (variant === "wrong-config") response.auth_config.id = "wrong";
  if (variant === "wrong-toolkit") response.toolkit.slug = "wrong";
  if (variant === "shared") response.experimental = { account_type: "SHARED" };
  if (variant === "disabled") response.is_disabled = true;
  const transport = async () =>
    new Response(
      JSON.stringify(
        n++ === 0
          ? { connected_account_id: "account", toolkit_slug: "hubspot" }
          : response,
      ),
    );
  await expect(
    createComposioConnectionAdapter(config, transport as typeof fetch).verify(
      "account",
      "opaque",
      "session",
      admit,
    ),
  ).rejects.toThrow();
});
test("requested scopes are not accepted as granted scopes and revocation needs confirmation", async () => {
  const adapter = createComposioConnectionAdapter(
    config,
    (async () =>
      new Response(JSON.stringify({ success: true }))) as typeof fetch,
  );
  await expect(adapter.revoke("account")).rejects.toThrow(
    "integration_revocation_unconfirmed",
  );
  const grantCheck = vi.fn(async () => {
    throw new Error("no verified grants");
  });
  let n = 0;
  const transport = async () =>
    new Response(
      JSON.stringify(
        n++ === 0
          ? { connected_account_id: "account", toolkit_slug: "hubspot" }
          : {
              id: "account",
              user_id: "opaque",
              status: "ACTIVE",
              auth_config: { id: "config" },
              toolkit: { slug: "hubspot" },
              requested_scopes: ["crm.objects.contacts.read"],
            },
      ),
    );
  await expect(
    createComposioConnectionAdapter(
      { ...config, verifyMetadata: grantCheck },
      transport as typeof fetch,
    ).verify("account", "opaque", "session", admit),
  ).rejects.toThrow();
});
