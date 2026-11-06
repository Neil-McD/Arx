const FOUNDER_WELCOME_VERSION = 1;

function boundedLabel(raw: unknown, fallback: string): string {
  const normalized = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  return normalized || fallback;
}

export function communityFounderWelcomeIdempotencyKey(communityId: unknown): string {
  const normalizedCommunityId = String(communityId ?? "").trim();
  if (!normalizedCommunityId) throw new Error("community_founder_welcome_community_required");
  return `founder_welcome:v${FOUNDER_WELCOME_VERSION}:${normalizedCommunityId}`;
}

export function buildCommunityFounderWelcomeText(args: {
  founderDisplayName?: unknown;
  communityName?: unknown;
}): string {
  const founderName = boundedLabel(args.founderDisplayName, "there");
  const communityName = boundedLabel(args.communityName, "your community");
  return [
    `Hi ${founderName} — welcome to ${communityName}.`,
    "I’m your community concierge.",
    `Reply to me in this thread using Reply, or mention @${communityName} anywhere in chat whenever you want my help.`,
    "To get going: invite people with Invite people (it shares your community's own site), set a price and connect Stripe in Settings when you want paid members, and build your own site whenever you like (ask your AI, or run npx @polynet/cli deploy).",
  ].join(" ");
}
