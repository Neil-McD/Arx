// One door: the prompt a builder pastes into their own coding agent (Claude
// Code, Cursor, Codex) to connect their app. Self-contained: the whole guide
// (docs/product/guides/connect-your-app.md) plus this community's own values,
// so the agent needs nothing else. It never contains a secret: the builder
// puts those in their own environment.

export type SetupPromptTier = { key: string; name: string; grants: string[] };

export function buildConnectedAppSetupPrompt(args: {
  communityName: string;
  appName: string;
  appId: string;
  apiOrigin: string;
  hasWebhook: boolean;
  tiers: SetupPromptTier[];
  guide: string;
  // Where buyers open the community (its home), and whether members already
  // see a link to the app in Polynet.
  communityUrl?: string | null;
  hasAppLink?: boolean;
}): string {
  const plans = args.tiers.length
    ? args.tiers.map((tier) => `- ${tier.name}: tier key \`${tier.key}\`${tier.key === "member" ? " (the base membership: leave \`tier\` out)" : ""}; grants ${["community", ...tier.grants].map((grant) => `\`${grant}\``).join(", ")}`).join("\n")
    : "- (No plans named yet: everyone holds the base membership `member` and the grant `community`.)";
  // The guide without its front matter.
  const guide = args.guide.replace(/^---[\s\S]*?\n---\n+/, "").trim();
  return `Connect this app to its Polynet community ("${args.communityName}").

Polynet runs the community and its plans; this app keeps its own sign-in and checkout. Implement the integration described in the guide below, in this codebase, following its conventions:

1. Report this app's own sales to Polynet after every subscription change (no Polynet fee on these).
2. Gate features on Polynet grants as well as this app's own billing (someone may have bought through Polynet).
${args.hasWebhook ? "3. Add the webhook endpoint for access.changed, verifying the Standard Webhooks signature." : "3. (Optional) If you add a webhook address in Polynet later, add the access.changed endpoint."}
4. Link to the community from this app (guide section 4). Look at this app's screens first, then suggest where the link would help buyers most (after purchase, main navigation, onboarding, account or billing page, help menu, welcome email), with a one-line reason each. Ask me which to add before adding any; use this app's own components and design.

Values for this community:
- POLYNET_API_ORIGIN = ${args.apiOrigin}
- App: ${args.appName} (${args.appId})
- Community link: ${args.communityUrl ?? "(shown under Your app in Polynet)"}
${args.hasAppLink ? "- Polynet already links members to this app from the community's left column.\n" : "- Polynet doesn't link to this app yet: I'll set its address under Your app.\n"}- POLYNET_APP_SECRET: I will set this myself in the server environment. Read it from process.env; never hard-code, log or commit it, and never expose it to browser code.
${args.hasWebhook ? "- POLYNET_WEBHOOK_SECRET: same, for the webhook signature.\n" : ""}
Plans (map this app's plans to these tier keys; gate on the grants):
${plans}

Before writing code, find where this app records subscription changes and where it checks what a user can access, and tell me your plan. Add tests for the sales report (including that it never breaks billing) and the access check (including the "Polynet unreachable" case). Add the environment variable names to the example env file.

--- The guide ---

${guide}
`;
}
