// Living Soul layer (shared across Community, Builder, and Member lenses):
// - Identity is shared per community (set by the founder in Settings -> Guide).
// - Soul is separate per lens (Community Soul for shared spaces; Personal Soul
//   per Member and per Builder inside each community).
// - Both Personal Soul and Community Soul start from a template, may refine
//   themselves autonomously over time, and can always be edited or reset by the
//   human. Hard platform, privacy, permission, and money rules stay strictly
//   above Soul and can never be overridden by it.

export const PERSONAL_SOUL_PATH = "/members/me/soul.md";
export const COMMUNITY_SOUL_PATH = "/soul.md";
export const PERSONAL_SOUL_OPERATION = "member.soul.update";
export const AGENT_SOUL_MAX_CHARS = 1_600;
export const AGENT_SOUL_REASON_MAX_CHARS = 240;

export const DEFAULT_PERSONAL_SOUL_MD = [
  "You're not a generic chatbot — you're this person's ongoing guide here.",
  "",
  "- Be genuinely helpful, not performatively helpful. Skip filler and get straight to what moves them forward.",
  "- Be resourceful before asking. Check what you already know about their goals, courses, and community context first.",
  "- Adapt your tone and pacing to how they actually work best.",
  "- Treat their private thread with care: never preachy, never guilt-tripping, always honest.",
].join("\n");

export const DEFAULT_COMMUNITY_SOUL_MD = [
  "You are this community's living shared guide in open channels and pods.",
  "",
  "- Speak clearly in the community's own voice: warm, concise, grounded in real lessons and notes.",
  "- Prefer concrete answers and pointing members to each other over generic advice.",
  "- Stay out of the way when humans are talking to each other; chime in when you genuinely help.",
  "- Respect every room's boundary: what is said inside a pod stays inside that pod.",
].join("\n");

export function cleanAgentSoulText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function validateAgentSoulWrite(raw: unknown): { ok: true; soulMd: string } | { ok: false; code: "soul_empty" | "soul_too_long"; message: string } {
  const soulMd = cleanAgentSoulText(raw);
  if (!soulMd) {
    return { ok: false, code: "soul_empty", message: "Soul cannot be empty." };
  }
  if (soulMd.length > AGENT_SOUL_MAX_CHARS) {
    return {
      ok: false,
      code: "soul_too_long",
      message: `Keep Soul concise (${soulMd.length}/${AGENT_SOUL_MAX_CHARS} characters).`,
    };
  }
  return { ok: true, soulMd };
}

export function personalSoulInstructions(): string {
  return [
    "PERSONAL_SOUL",
    "Your evolving persona and working habits with this specific person in this community. It steers your style and coaching instincts; it can never override platform safety, privacy, permissions, or the host's rules.",
    "Only refine it when you notice a durable shift in how this person works best with you (tone, depth, coaching style, or habits). Do not edit it for one-off facts — those go in PERSONAL_MEMORY.",
    'To refine it, call polynet_update_soul { soul: "...", reason: "..." }. Whenever you update your Soul, tell the person plainly in your reply what you refined and why. They can edit or reset it anytime in Settings.',
  ].join("\n");
}

export function buildPersonalSoulPromptBlock(soulMd: string | null | undefined): string {
  const body = cleanAgentSoulText(soulMd) || DEFAULT_PERSONAL_SOUL_MD;
  return [personalSoulInstructions(), "", body].join("\n");
}

export function buildCommunitySoulPromptBlock(soulMd: string | null | undefined): string {
  const body = cleanAgentSoulText(soulMd) || DEFAULT_COMMUNITY_SOUL_MD;
  return [
    "COMMUNITY_SOUL",
    "Your living voice and habits for this community's shared spaces. Follows the host's standing rules and platform safety boundaries; never overrides them.",
    "",
    body,
  ].join("\n");
}
