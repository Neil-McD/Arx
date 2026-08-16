const COMMUNITY_MEMBER_WELCOME_VERSION = 1;

export const COMMUNITY_MEMBER_WELCOME_DELAY_MS = 12 * 60 * 60 * 1000;
export const COMMUNITY_MEMBER_WELCOME_MAX_MENTIONS = 24;

function boundedLabel(raw: unknown, fallback: string): string {
  const normalized = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  return normalized || fallback;
}

function normalizedHandle(raw: unknown): string | null {
  const handle = String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
  return handle ? handle.slice(0, 64) : null;
}

export function communityMemberWelcomeIdempotencyKey(batchId: unknown): string {
  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) throw new Error("community_member_welcome_batch_required");
  return `member_welcome:v${COMMUNITY_MEMBER_WELCOME_VERSION}:${normalizedBatchId}`;
}

export function buildCommunityMemberWelcomeText(args: {
  communityName?: unknown;
  memberHandles: unknown[];
  hasOverflow?: boolean;
}): string {
  const communityName = boundedLabel(args.communityName, "the community");
  const handles = Array.from(
    new Set(args.memberHandles.map(normalizedHandle).filter((value): value is string => Boolean(value))),
  ).slice(0, COMMUNITY_MEMBER_WELCOME_MAX_MENTIONS);
  if (handles.length === 0) throw new Error("community_member_welcome_members_required");
  const memberList = handles.map((handle) => `@${handle}`).join(", ");
  const overflow = args.hasOverflow ? " and everyone else who joined recently" : "";
  return [
    `Welcome ${memberList}${overflow} to ${communityName}.`,
    "I’m your community concierge.",
    "Reply in this thread whenever you need help finding your way around.",
  ].join(" ");
}
