// One door: the prompt a builder pastes into their own coding agent (Claude
// Code, Cursor, Codex) to connect their app. Self-contained: the whole guide
// (docs/product/guides/connect-your-app.md) plus this community's own values,
// so the agent needs nothing else. It never contains a secret: the builder
// puts those in their own environment.

export type SetupPromptTier = { key: string; name: string; grants: string[] };
export type SetupPromptMilestone = { key: string; label: string; stageName: string };

function formatPromptMilestonesSection(args: {
  appName: string;
  apiOrigin: string;
  milestones?: SetupPromptMilestone[];
  identityMode: "unified" | "existing";
}): string {
  const endpoint = `${args.apiOrigin.replace(/\/+$/, "")}/apps/v1/milestones`;
  const idExample =
    args.identityMode === "unified"
      ? `"user_id": "pusr_..."` // or verified "email"
      : `"email": "member@example.com"`;
  const idNote =
    args.identityMode === "unified"
      ? `Identify the member with \`user_id\` (\`pusr_...\` from Sign in with Polynet) or their verified \`email\`.`
      : `Identify the member with their verified \`email\` (or \`user_id\` \`pusr_...\` if using Sign in with Polynet).`;
  const list = (args.milestones ?? []).filter((item) => item.key.trim() && item.label.trim());
  const configuredBlock = list.length
    ? `Configured Member Board checkpoints for "${args.appName}" (use these exact \`milestone\` keys so cards tick and auto-advance automatically):\n${list
        .map((item) => `- \`${item.key}\` — ${item.label} (Stage: ${item.stageName})`)
        .join("\n")}`
    : `No custom app checkpoints are configured on the Member Board yet. Inspect this app's key activation moments (e.g. first project created, first core action finished, first result achieved), suggest 2–3 snake_case \`milestone\` keys with a one-line reason each, and confirm with me before wiring them. Polynet automatically surfaces reported milestones on the Member Board for one-click tracking.`;

  return `${configuredBlock}
   - Endpoint (server-to-server, \`Authorization: Bearer \${POLYNET_APP_SECRET}\`): \`POST ${endpoint}\`
   - ${idNote}
   - Milestone / win: \`{ ${idExample}, "milestone": "<key>", "label": "<human label>", "outcome": "<optional win summary>", "idempotency_key": "<unique-event-id>" }\`
   - Daily active ping (keeps active app users from being marked quiet in Polynet even when they don't post in channels — works for UI, API, and MCP usage): send \`{ ${idExample}, "active": true }\` once per day on server-verified app activity (Polynet deduplicates to at most one write per UTC day).
   - Non-blocking & fail-safe: send fire-and-forget with a short timeout (~5s); never block user actions or throw if Polynet is unreachable.`;
}

export function buildCommunityPlanCheckoutUrl(args: {
  communityUrl: string;
  tierKey?: string | null;
  appId?: string | null;
}): string {
  const url = new URL(args.communityUrl);
  const tierKey = args.tierKey?.trim();
  if (tierKey && tierKey !== "member") {
    url.searchParams.set("plan", tierKey);
  }
  const appId = args.appId?.trim();
  if (appId) {
    url.searchParams.set("app", appId);
  }
  return url.toString();
}

export function buildConnectedAppSetupPrompt(args: {
  communityName: string;
  communitySlug?: string | null;
  appName: string;
  appId: string;
  apiOrigin: string;
  hasWebhook: boolean;
  tiers: SetupPromptTier[];
  milestones?: SetupPromptMilestone[];
  guide: string;
  // Where buyers open the community (its home), and whether members already
  // see a link to the app in Polynet.
  communityUrl?: string | null;
  hasAppLink?: boolean;
}): string {
  const plans = args.tiers.length
    ? args.tiers
        .map((tier) => {
          const checkoutLink = args.communityUrl
            ? ` -> Polynet upgrade checkout link: ${buildCommunityPlanCheckoutUrl({
                communityUrl: args.communityUrl,
                tierKey: tier.key,
                appId: args.appId,
              })}`
            : "";
          return `- ${tier.name}: tier key \`${tier.key}\`${tier.key === "member" ? " (the base membership: leave \`tier\` out)" : ""}; grants ${["community", ...tier.grants].map((grant) => `\`${grant}\``).join(", ")}${checkoutLink}`;
        })
        .join("\n")
    : `- (No plans named yet: everyone holds the base membership \`member\` and the grant \`community\`.${args.communityUrl ? ` Polynet join/checkout link: ${buildCommunityPlanCheckoutUrl({ communityUrl: args.communityUrl, appId: args.appId })}` : ""})`;
  const milestonesSection = formatPromptMilestonesSection({
    appName: args.appName,
    apiOrigin: args.apiOrigin,
    milestones: args.milestones,
    identityMode: "existing",
  });
  const communitySlugHint = args.communitySlug?.trim() || "<your-community-slug>";
  // The guide without its front matter.
  const guide = args.guide.replace(/^---[\s\S]*?\n---\n+/, "").trim();
  return `Connect this app ("${args.appName}") to its Polynet community ("${args.communityName}") using the **Native to your app** path (keep your own sign-in and outside Stripe).

Billing & fee rule:
- Customers this app acquires and bills completely on its own stay on this app's own Stripe (**0% Polynet fee**).
- Customers who originate from Polynet (arriving with \`polynet_community=${communitySlugHint}\` from your community's outbound app link, or already holding a free community membership in Polynet) route their Upgrade buttons to Polynet's direct plan checkout link below (**2.9% Polynet fee**, returning straight back to this app after payment).

Implement these parts in this codebase following its conventions:

1. **Detect Polynet-originated visitors & route their upgrades to Polynet checkout:**
   - When a visitor lands with \`?polynet_community=${communitySlugHint}\` (automatically appended by Polynet on outbound app links), store that origin in a first-party cookie/session (e.g. 90 days) without breaking normal app navigation.
   - When a Polynet-originated user (or a signed-in user who has free/base access in Polynet and is upgrading) clicks Upgrade, send them to the matching Polynet direct plan checkout link listed under Plans below (forwarding any \`de_aid\`, \`de_cid\`, \`utm_*\`, and \`ref\` tags from their browser session so attribution never drops).
2. **Report this app's own outside-Stripe sales (with optional attribution & revenue) to Polynet:**
   - After every outside-Stripe subscription change (created, renewed, upgraded, canceled), POST to \`${args.apiOrigin.replace(/\/+$/, "")}/apps/v1/sales\` with \`email\`, \`active\`, \`tier\`, \`external_ref\`, plus optional:
     - \`attribution\`: \`{ "de_aid": "...", "de_cid": "...", "utm_source": "...", "utm_medium": "...", "utm_campaign": "...", "utm_content": "...", "referrer_host": "...", "referral_code": "..." }\` (capture first-touch on signup/checkout so Polynet Analytics and Distribution Engineer stay accurate),
     - \`revenue\`: \`{ "amount_base_units": 4900, "currency": "USD", "billing_interval": "monthly" }\` (\`"monthly" | "annual" | "one_time"\`; populates Member Records and LTV by source in Polynet Analytics with 0% Polynet fee).
3. **Gate features on Polynet grants as well as this app's own billing:**
   - Someone may have bought through Polynet checkout or been comped there; check \`GET ${args.apiOrigin.replace(/\/+$/, "")}/apps/v1/access?email=<verified_email>\` and union with your own billing (fail closed for Polynet-sourced grants if unreachable).
4. ${args.hasWebhook ? "**Add the webhook endpoint for `access.changed`**, verifying the Standard Webhooks signature." : "(Optional) If you add a webhook address in Polynet later, add the `access.changed` endpoint verifying the Standard Webhooks signature."}
5. **Link to the community from this app (guide section 4):** Look at this app's screens first, then suggest where the link would help buyers most (after purchase, main navigation, onboarding, account or billing page, help menu, welcome email), with a one-line reason each. Ask me which to add before adding any; use this app's own components and design.
6. **Report member milestones and daily app activity to the Member Board so onboarding and Chief of Staff reflect real product progress:**
   ${milestonesSection}

Values for this community:
- POLYNET_API_ORIGIN = ${args.apiOrigin}
- App: ${args.appName} (${args.appId})
- Community link: ${args.communityUrl ?? "(shown under Your app in Polynet)"}
${args.hasAppLink ? "- Polynet already links members to this app from the community's left column (tagged with `polynet_community`).\n" : "- Polynet doesn't link to this app yet: I'll set its address under Your app.\n"}- POLYNET_APP_SECRET: I will set this myself in the server environment. Read it from process.env; never hard-code, log or commit it, and never expose it to browser code.
${args.hasWebhook ? "- POLYNET_WEBHOOK_SECRET: same, for the webhook signature.\n" : ""}
Plans (map this app's plans to these tier keys; gate on the grants; use the Polynet checkout link for Polynet-originated upgrades):
${plans}

Before writing code, find where this app records subscription changes, renders Upgrade buttons, and checks what a user can access, and tell me your plan. Add tests for the sales report (including attribution/revenue passthrough and never breaking billing), Polynet-originated upgrade routing, and the access check (including the "Polynet unreachable" case). Add the environment variable names to the example env file.

--- The guide ---

${guide}
`;
}

export function buildCustomLandingPagePrompt(args: {
  communityName: string;
  communitySlug: string;
  communityUrl: string;
  oneLiner?: string | null;
  tiers: SetupPromptTier[];
  appName?: string | null;
  appUrl?: string | null;
  appId?: string | null;
}): string {
  const plans = args.tiers.length
    ? args.tiers
        .map((tier) => {
          const checkoutUrl = buildCommunityPlanCheckoutUrl({
            communityUrl: args.communityUrl,
            tierKey: tier.key,
            appId: args.appId,
          });
          return `- ${tier.name}${tier.grants.length ? ` (includes: ${tier.grants.join(", ")})` : ""} -> CTA URL: ${checkoutUrl}`;
        })
        .join("\n")
    : `- Standard membership (managed on Polynet) -> CTA URL: ${buildCommunityPlanCheckoutUrl({ communityUrl: args.communityUrl, appId: args.appId })}`;
  const oneLiner = args.oneLiner?.trim();
  const appName = args.appName?.trim();
  const appUrl = args.appUrl?.trim();
  return `Build a clean, conversion-focused custom landing page for "${args.communityName}" that I can host anywhere (Vercel, Cloudflare Pages, or Netlify).

Polynet runs the community, member gate, and checkout. This landing page should sell the value clearly and send every primary call-to-action straight to my Polynet join and checkout page — do not build a separate signup form or checkout flow.

Community details:
- Name: ${args.communityName}
- Slug: ${args.communitySlug}
${oneLiner ? `- Positioning: ${oneLiner}\n` : ""}- Polynet join & checkout link (use this for general "Join" / "Get started" buttons): ${buildCommunityPlanCheckoutUrl({ communityUrl: args.communityUrl, appId: args.appId })}
${appName ? `- Connected software product: ${appName}${appUrl ? ` (${appUrl})` : ""}\n` : ""}
Plans to reflect on the page (wire each plan's button directly to its CTA URL so that plan is pre-selected in Polynet checkout):
${plans}

What to build:
1. A focused hero section with a clear headline, subheadline, social proof placeholder, and a prominent primary CTA linking to ${buildCommunityPlanCheckoutUrl({ communityUrl: args.communityUrl, appId: args.appId })}.
2. A concise "What's inside" section highlighting the community${appName ? `, ${appName},` : ""} and how members get results.
3. A clean pricing / access section matching the plans above, where each plan button links to its exact CTA URL.
4. A short FAQ section answering common objections and ending with a final CTA to ${buildCommunityPlanCheckoutUrl({ communityUrl: args.communityUrl, appId: args.appId })}.
5. Responsive layout (desktop + mobile), fast load time, clean semantic HTML/CSS, and ready-to-deploy config for Vercel or Cloudflare Pages.
6. Attribution pass-through: add a tiny inline script that reads incoming \`de_aid\`, \`de_cid\`, \`utm_source\`, \`utm_medium\`, \`utm_campaign\`, \`utm_content\`, and \`ref\` query parameters (and any \`de_aid\`/\`de_cid\` saved by the Distribution Engineer pixel) and appends them onto every Polynet CTA link on the page so attribution never drops at checkout.

Before writing code, ask me 3 quick questions (brand vibe/colors, target audience & main promise, and any real testimonials or numbers I want included) — or tell me you can start immediately with crisp defaults if I say "just build it".
`;
}

export function buildUnifiedGateAppPrompt(args: {
  communityName: string;
  appName: string;
  appId: string;
  appOrigin: string;
  apiOrigin: string;
  communityUrl: string;
  redirectUrls: string[];
  hasWebhook: boolean;
  tiers: SetupPromptTier[];
  milestones?: SetupPromptMilestone[];
}): string {
  const authorizeUrl = `${args.appOrigin.replace(/\/+$/, "")}/oauth/authorize`;
  const tokenUrl = `${args.apiOrigin.replace(/\/+$/, "")}/apps/v1/oauth/token`;
  const accessUrl = `${args.apiOrigin.replace(/\/+$/, "")}/apps/v1/access`;
  const milestonesSection = formatPromptMilestonesSection({
    appName: args.appName,
    apiOrigin: args.apiOrigin,
    milestones: args.milestones,
    identityMode: "unified",
  });
  const plans = args.tiers.length
    ? args.tiers
        .map((tier) => {
          const checkoutUrl = buildCommunityPlanCheckoutUrl({
            communityUrl: args.communityUrl,
            tierKey: tier.key,
            appId: args.appId,
          });
          return `- ${tier.name} (tier key \`${tier.key}\`): grants ${["community", ...tier.grants].map((grant) => `\`${grant}\``).join(", ")} -> checkout link: ${checkoutUrl}`;
        })
        .join("\n")
    : `- Base membership (\`member\`): grant \`community\` -> checkout link: ${buildCommunityPlanCheckoutUrl({ communityUrl: args.communityUrl, appId: args.appId })}`;
  const callbacks = args.redirectUrls.length
    ? args.redirectUrls.map((url) => `- ${url}`).join("\n")
    : "- (Add your exact callback URL — e.g. `https://your-app.com/api/auth/polynet/callback` or `http://localhost:3000/api/auth/polynet/callback` — under Settings -> Your app -> Sign-in callbacks.)";

  return `Use Polynet as the single unified gate (**Native to Polynet**: Sign in with Polynet + checkout + plan grants; 2.9% fee on all transactions) for "${args.appName}" connected to the "${args.communityName}" community.

Do NOT build a separate password auth system or a separate Stripe checkout. Polynet handles sign-in, subscriptions, upgrades, refunds, and member grants; this app only needs a thin server session and server-side grant checks.

Values for this app:
- POLYNET_APP_ORIGIN = ${args.appOrigin.replace(/\/+$/, "")}
- POLYNET_API_ORIGIN = ${args.apiOrigin.replace(/\/+$/, "")}
- POLYNET_CLIENT_ID = ${args.appId}
- POLYNET_APP_SECRET: I will set this in my server environment. Read from process.env; never hard-code, log, commit, or expose it to browser code.
${args.hasWebhook ? "- POLYNET_WEBHOOK_SECRET: I will set this in my server environment for Standard Webhooks verification.\n" : ""}- Community link: ${args.communityUrl}

Registered Sign-in callback URLs:
${callbacks}

Plans & direct checkout links (each link pre-selects that plan and returns the buyer straight back to this app after checkout):
${plans}

Implement these 6 parts in this codebase following its conventions:

1. **Sign in with Polynet (OAuth 2.1 + PKCE S256):**
   - Start route (e.g. \`GET /api/auth/polynet/start\`): generate cryptographic random \`state\` and PKCE \`code_verifier\` (43–128 chars), store both in an HttpOnly, Secure (in prod), SameSite=Lax short-lived cookie, compute \`code_challenge = base64url(SHA-256(code_verifier))\`, and redirect the browser to:
     \`${authorizeUrl}?client_id=${args.appId}&redirect_uri=<EXACT_REGISTERED_CALLBACK>&response_type=code&code_challenge=<CHALLENGE>&code_challenge_method=S256&state=<STATE>\`
     (Preserve any captured \`de_aid\`, \`de_cid\`, \`utm_source\`, \`utm_medium\`, \`utm_campaign\`, \`utm_content\`, and \`ref\` query params on this redirect URL too so Polynet carries the visitor's original arrival source across sign-in and join.)
   - Callback route: verify \`state\` matches the cookie in constant time, handle \`?error=access_denied\` gracefully, then call server-to-server:
     \`\`\`http
     POST ${tokenUrl}
     Authorization: Bearer \${POLYNET_APP_SECRET}
     Content-Type: application/json

     { "grant_type": "authorization_code", "code": "...", "redirect_uri": "<EXACT_REGISTERED_CALLBACK>", "code_verifier": "..." }
     \`\`\`
   - Response is \`200 OK\`:
     \`{ "user": { "id": "pusr_...", "email": "...", "email_verified": true, "name": "...", "avatar_url": "..." }, "access": { "allowed": true, "tier": { "key": "...", "name": "..." }, "grants": ["community", "..."] } }\`
   - Clear the PKCE cookie, create this app's signed HttpOnly session cookie storing \`user.id\`, \`user.email\`, and \`user.name\` (never store permanent grants in the cookie), and redirect into the app.

2. **Live server-side grant gating (fail closed):**
   - On protected routes/APIs, call \`GET ${accessUrl}?email=<verified_email>\` with \`Authorization: Bearer \${POLYNET_APP_SECRET}\` (short server cache up to 60s is fine).
   - Gate features on \`access.allowed\` and \`access.grants\` (never on prices). If Polynet is unreachable, fail closed for Polynet-gated features.
   - If a signed-in user is not a member yet (\`!access.allowed\`), send them to the matching direct checkout URL above so they pay on Polynet and return straight back to this app.
   - If a signed-in user is already a member (\`access.allowed === true\`) and needs a higher tier's grant, send them to \`${args.communityUrl}/settings\` so they can switch plans under "Your plan".

3. **${args.hasWebhook ? "Webhook cache invalidation (Standard Webhooks):" : "(Optional) Webhook cache invalidation:"}**
   - Verify \`webhook-id\`, \`webhook-timestamp\` (within 5 minutes), and \`webhook-signature\` (\`v1,\` + base64 HMAC-SHA256 of \`\${id}.\${timestamp}.\${rawBody}\` using \`POLYNET_WEBHOOK_SECRET\` without \`whsec_\`). On \`access.changed\`, drop any cached access for \`data.email\`.

4. **Community link in the app:**
   - Add a clean link to \`${args.communityUrl}\` in navigation so members can jump between "${args.appName}" and "${args.communityName}" in one click.

5. **Report product milestones & daily activity to the Member Board:**
   ${milestonesSection}

6. **Preserve marketing & Distribution Engineer attribution into Polynet:**
   - Capture incoming \`de_aid\`, \`de_cid\`, \`utm_source\`, \`utm_medium\`, \`utm_campaign\`, \`utm_content\`, and \`ref\` query parameters (plus any \`de_aid\`/\`de_cid\` cookie or localStorage value written by the Distribution Engineer pixel) in a short-lived first-party cookie/storage, and append them onto outbound links to \`${authorizeUrl}\` and the direct Polynet plan checkout URLs above so attribution never drops between this app and Polynet.

Before writing code, inspect this repo's framework and routing structure, propose your exact file plan, and ask me if any details need adjusting. Add tests for PKCE state verification, token exchange error handling, and fail-closed grant checks, and add the env variable names to \`.env.example\`.
`;
}
