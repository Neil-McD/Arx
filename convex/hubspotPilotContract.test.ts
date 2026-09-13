import { expect, test } from "vitest";
import { HUBSPOT_SCOPE_REQUEST, parseHubSpotContact, parseHubSpotConnectionMetadata } from "./hubspotPilotContract";

const contact = (patch: Record<string, unknown> = {}) => ({
  successful: true,
  data: { id: "123", archived: false, createdAt: "2026-09-11", updatedAt: "2026-09-11", properties: {}, ...patch },
});

test("scope request pins version and explicitly excludes token", () => {
  expect(HUBSPOT_SCOPE_REQUEST).toEqual({ tool: "HUBSPOT_LIST_GRANTED_SCOPES", version: "20260826_00", arguments: { include_token: false } });
  expect(Object.isFrozen(HUBSPOT_SCOPE_REQUEST.arguments)).toBe(true);
});
test("metadata parser projects portal and scopes, never secrets", () => {
  expect(parseHubSpotConnectionMetadata({ successful: true, data: {
    hub_id: 247370940,
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.read"],
    token: "SECRET", user: "PRIVATE", signed_access_token: { scopes: "encoded" },
  } })).toEqual({portalId: "247370940", scopes: ["crm.objects.contacts.read"]});
  expect(parseHubSpotConnectionMetadata({successful: true, data: {hub_id: "247370940", scopes: []}})).toEqual({portalId: "247370940", scopes: []});
});
test.each([undefined, null, "", "0", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, " 247370940", "0247370940", {}, "x".repeat(33)])("invalid portal fails closed %j", hub_id => {
  expect(parseHubSpotConnectionMetadata({successful: true, data: {hub_id, scopes: ["oauth"], signed_access_token: {hubId: "247370940"}}})).toBeNull();
});
test.each([
  undefined, null, [], {successful: false, data: {scopes: ["crm.objects.contacts.read"]}},
  {successful: true, data: {requested_scopes: ["crm.objects.contacts.read"]}},
  ...[null, "crm.objects.contacts.read", [null], [1], [""], [" scope "], ["x".repeat(257)], Array(257).fill("x")]
    .map(scopes => ({successful: true, data: {hub_id: "247370940", scopes}})),
  {successful: true, error: "SECRET", data: {scopes: []}},
  {successful: true, data: {scopes: [], token: "x".repeat(17000)}},
])("invalid scopes fail closed %#", raw => expect(parseHubSpotConnectionMetadata(raw)).toBeNull());

test.each([{}, {firstname: null}, {firstname: "", lastname: null}])("missing/null names are valid: %j", properties => {
  expect(parseHubSpotContact(contact({properties}), "123")).toEqual({id: "123", properties: typeof properties.firstname === "string" ? {firstname: ""} : {}, untrusted: true});
});
test("contact projection is bounded and excludes extra data", () => {
  expect(parseHubSpotContact(contact({properties: {firstname: "x".repeat(300), lastname: "Test", email: "PRIVATE"}, token: "SECRET"}), "123"))
    .toEqual({id: "123", properties: {firstname: "x".repeat(256), lastname: "Test"}, untrusted: true});
});
test.each([
  {id: 123}, {id: "wrong"}, {archived: true}, {archived: undefined},
  {createdAt: undefined}, {updatedAt: 2},
  ...[undefined, null, [], "bad", {firstname: 5}, {lastname: {}}, {extra: []}].map(properties => ({properties})),
])("invalid contact data fails closed %j", patch => expect(parseHubSpotContact(contact(patch), "123")).toBeNull());
test.each([null, [], {successful: "true"}, {successful: false}, {successful: true, data: []},
  {...contact(), error: "SECRET"}, contact({properties: {firstname: "x".repeat(17000)}})])
  ("invalid envelopes fail closed %#", raw => expect(parseHubSpotContact(raw, "123")).toBeNull());
test("unserializable inputs return no provider data", () => {
  const raw: Record<string, unknown> = {}; raw.self = raw;
  expect(parseHubSpotContact(raw, "123")).toBeNull();
  expect(parseHubSpotConnectionMetadata(raw)).toBeNull();
});
