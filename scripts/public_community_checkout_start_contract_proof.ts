import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const schema = read("convex/schema.ts");
const commerce = read("convex/communityCommerce.ts");
const core = read("convex/communityCheckoutStartCore.ts");
const gateway = read("shared/cloudPublicFunnelGateway.ts");
const checkoutHook = read("apps/web/src/controllers/useWebPublicCheckoutStart.ts");
const checkoutAction = read("apps/web/src/publicCommunityCheckoutStartAction.ts");
const funnelActions = read("apps/web/src/controllers/useWebPublicFunnelActions.ts");
const app = read("apps/web/src/App.tsx");

assert.match(schema, /checkoutAttemptId:\s*v\.optional\(v\.string\(\)\)/);
assert.match(schema, /checkoutAttemptExpiresAt:\s*v\.optional\(v\.number\(\)\)/);
assert.match(
  schema,
  /\.index\("by_owner_mode_checkoutAttemptId", \["ownerUserId", "mode", "checkoutAttemptId"\]\)/,
);

assert.match(commerce, /checkoutAttemptId:\s*v\.string\(\)/);
assert.match(commerce, /authSubject:\s*v\.string\(\)/);
assert.doesNotMatch(
  commerce.slice(
    commerce.indexOf("export const startPublicCommunityCheckout = action({"),
    commerce.indexOf("export const requirePublicCommunityCheckoutNotBlockedInternal"),
  ),
  /userId:\s*v\.optional/,
);
assert.match(commerce, /reservePublicCommunityCheckoutAttemptInternal/);
assert.match(commerce, /\.take\(2\)/);
assert.match(commerce, /requireUniquePublicCommunityCheckoutAttempt/);
assert.match(commerce, /checkoutAttemptExpiresAt:[\s\S]{0,120}PUBLIC_COMMUNITY_CHECKOUT_ATTEMPT_TTL_MS/);
assert.match(commerce, /successUrl:\s*buildCheckoutSuccessUrl\(successUrlTemplate, sessionId\)/);
assert.match(commerce, /providerDestinationAccountId:\s*checkoutConfig\.destinationAccountId/);
assert.match(commerce, /executePublicCommunityCheckoutProviderStart/);
assert.match(commerce, /requirePublicCommunityCheckoutMayStart\(membership\)/);
assert.match(
  commerce,
  /if \(message === "checkout_attempt_expired"\) \{[\s\S]{0,220}expirePublicCommunityCheckoutSessionInternal/,
);
assert.doesNotMatch(
  commerce,
  /catch \(error\) \{\s*await ctx\.runMutation\([\s\S]{0,120}expirePublicCommunityCheckoutSessionInternal/,
  "ambiguous checkout-start failures must not expire their reconciliation row",
);

assert.match(core, /community_checkout:\$\{normalized\}/);
assert.match(core, /await args\.retrieveProviderSession/);
assert.match(core, /await args\.createProviderSession/);
assert.match(core, /await args\.attachProviderSession/);
assert.match(core, /checkout_attempt_duplicate_rows/);
assert.match(core, /checkout_attempt_binding_conflict/);
assert.match(core, /community_access_already_active/);
assert.match(core, /checkout_provider_session_conflict/);
assert.match(core, /checkout_provider_session_identity_invalid/);
assert.match(core, /parsed\.hostname !== "checkout\.stripe\.com"/);

assert.match(gateway, /session:\s*SessionT;/);
assert.doesNotMatch(
  gateway.slice(gateway.indexOf("export async function startCloudPublicFunnelCheckout")),
  /session:\s*SessionT \| null|if \(params\.session\)/,
);
assert.match(gateway, /requirePublicCommunityCheckoutStartResult/);
assert.match(gateway, /checkoutAttemptId:\s*params\.checkoutAttemptId/);

assert.doesNotMatch(funnelActions, /startCheckoutForPlan|startCloudPublicFunnelCheckout/);
assert.match(app, /useWebPublicCheckoutStart/);
assert.match(checkoutHook, /activeRef/);
assert.match(checkoutHook, /retryRef/);
assert.match(checkoutHook, /committedAuthorityKeyRef/);
assert.match(checkoutHook, /committedAuthorityRef/);
assert.match(checkoutHook, /current:\s*\{[\s\S]{0,100}\.\.\.committedAuthorityRef\.current/);
assert.match(checkoutHook, /getCurrentRouteAuthority/);
assert.match(checkoutHook, /generation:\s*\+\+generationRef\.current/);
assert.match(checkoutHook, /resolveAuthSubject\(session\) !== snapshot\.authSubject/);
assert.match(checkoutHook, /executePublicCommunityCheckoutStartAction/);
assert.match(checkoutAction, /isPublicCommunityCheckoutStartSnapshotCurrent/);
assert.match(checkoutAction, /if \(!args\.isCurrent\(\)\) return \{ outcome: "stale" \}/);

console.log("PASS: public community checkout-start contract holds.");
