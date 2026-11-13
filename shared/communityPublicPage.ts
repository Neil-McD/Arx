// A community's public page (its doorstep): the sales sections a founder
// fills in, beside what Polynet already knows (name, one-liner, banner,
// courses, price). Fixed sections, no builder: each shows only when it has
// something in it. Plain text only, with short limits so the page stays tight.
// Shared by the backend (which validates every save) and Studio's Settings.

export type CommunityPublicPageVideo = { provider: "youtube" | "vimeo" | "loom"; id: string };

export type CommunityPublicPage = {
  for_you: string[];
  not_for: string[];
  first_steps: Array<{ title: string; text: string }>;
  results: Array<{ quote: string; name: string; role: string }>;
  founder_bio: string;
  video: CommunityPublicPageVideo | null;
  guarantee: string;
  objections: Array<{ question: string; answer: string }>;
};

export const COMMUNITY_PUBLIC_PAGE_LIMITS = {
  forYou: { items: 4, chars: 140 },
  notFor: { items: 3, chars: 140 },
  firstSteps: { items: 3, title: 40, text: 140 },
  results: { items: 4, quote: 300, name: 60, role: 60 },
  founderBio: 300,
  guarantee: 160,
  objections: { items: 2, question: 120, answer: 300 },
} as const;

export function emptyCommunityPublicPage(): CommunityPublicPage {
  return { for_you: [], not_for: [], first_steps: [], results: [], founder_bio: "", video: null, guarantee: "", objections: [] };
}

// Only these players, by their own ids (never a raw link): YouTube's
// privacy-enhanced player, Vimeo's and Loom's.
const VIDEO_ID = { youtube: /^[A-Za-z0-9_-]{11}$/, vimeo: /^[0-9]{6,12}$/, loom: /^[0-9a-f]{32}$/ } as const;

export function communityPublicPageVideoFromUrl(raw: unknown): CommunityPublicPageVideo | null {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const pick = (provider: CommunityPublicPageVideo["provider"], id: string | undefined | null) =>
    id && VIDEO_ID[provider].test(id) ? { provider, id } : null;
  if (host === "youtu.be") return pick("youtube", parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") return pick("youtube", url.searchParams.get("v"));
    if (["embed", "shorts", "live"].includes(parts[0] ?? "")) return pick("youtube", parts[1]);
    return null;
  }
  if (host === "vimeo.com") return pick("vimeo", parts[0]);
  if (host === "player.vimeo.com" && parts[0] === "video") return pick("vimeo", parts[1]);
  if (host === "loom.com" && (parts[0] === "share" || parts[0] === "embed")) return pick("loom", parts[1]);
  return null;
}

// One line of plain text: control characters out, runs of whitespace one space.
function line(value: unknown): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export type CommunityPublicPageInput = {
  for_you?: unknown;
  not_for?: unknown;
  first_steps?: unknown;
  results?: unknown;
  founder_bio?: unknown;
  video_url?: unknown;
  guarantee?: unknown;
  objections?: unknown;
};

// A founder's save, made canonical: blank items dropped, every limit checked.
// Too long or too many is refused by name (never cut silently); a video link
// that isn't a YouTube, Vimeo or Loom video is refused.
export function normalizeCommunityPublicPage(input: CommunityPublicPageInput):
  { ok: true; page: CommunityPublicPage } | { ok: false; error: string } {
  const limits = COMMUNITY_PUBLIC_PAGE_LIMITS;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const lines = (field: string, value: unknown, items: number, chars: number) => {
    const kept = list(value).map(line).filter(Boolean);
    if (kept.length > items) throw new Error(`${field}_too_many`);
    if (kept.some((text) => text.length > chars)) throw new Error(`${field}_too_long`);
    return kept;
  };
  const records = <K extends string>(field: string, value: unknown, items: number, max: Record<K, number>, required: string[]) => {
    const kept = list(value).map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return Object.fromEntries(Object.keys(max).map((key) => [key, line(row[key])])) as Record<K, string>;
    }).filter((row) => Object.values(row).some(Boolean));
    if (kept.length > items) throw new Error(`${field}_too_many`);
    for (const row of kept) {
      for (const key of Object.keys(max) as K[]) if (row[key].length > max[key]) throw new Error(`${field}_too_long`);
      if (required.some((key) => !row[key as K])) throw new Error(`${field}_incomplete`);
    }
    return kept;
  };
  const text = (field: string, value: unknown, chars: number) => {
    const kept = line(value);
    if (kept.length > chars) throw new Error(`${field}_too_long`);
    return kept;
  };
  try {
    const videoUrl = line(input.video_url);
    const video = videoUrl ? communityPublicPageVideoFromUrl(videoUrl) : null;
    if (videoUrl && !video) return { ok: false, error: "video_url_unsupported" };
    return {
      ok: true,
      page: {
        for_you: lines("for_you", input.for_you, limits.forYou.items, limits.forYou.chars),
        not_for: lines("not_for", input.not_for, limits.notFor.items, limits.notFor.chars),
        first_steps: records("first_steps", input.first_steps, limits.firstSteps.items,
          { title: limits.firstSteps.title, text: limits.firstSteps.text }, ["title"]),
        results: records("results", input.results, limits.results.items,
          { quote: limits.results.quote, name: limits.results.name, role: limits.results.role }, ["quote", "name"]),
        founder_bio: text("founder_bio", input.founder_bio, limits.founderBio),
        video,
        guarantee: text("guarantee", input.guarantee, limits.guarantee),
        objections: records("objections", input.objections, limits.objections.items,
          { question: limits.objections.question, answer: limits.objections.answer }, ["question", "answer"]),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "public_page_invalid" };
  }
}

// "Draft with AI": the sections a model may suggest, from what the founder
// already wrote. Never results (only real members' words), never a guarantee
// or a bio (only the founder's own promise and story).
export type CommunityPublicPageDraft = Pick<CommunityPublicPage, "for_you" | "not_for" | "first_steps" | "objections">;

export const COMMUNITY_PUBLIC_PAGE_DRAFT_PROMPT = [
  "You draft the sales sections of a community's public page, for its founder to review before anything is published.",
  "Use only what the founder wrote (the community's name, one-liner, about and course list). Never invent results, numbers, testimonials, prices, guarantees or credentials.",
  "Write plainly and specifically, in the founder's voice, to the person deciding whether to join. No hype, no emoji.",
  "Return only JSON: {\"for_you\": [up to 4 lines], \"not_for\": [up to 3 lines], \"first_steps\": [up to 3 {\"title\", \"text\"}], \"objections\": [up to 2 {\"question\", \"answer\"}]}.",
  "Lines: for_you and not_for under 140 characters each, written as the end of \"This is for you if...\" / \"It's not for you if...\". First steps: what a new member does first, title under 40 characters, text under 140. Objections: the real hesitations someone would have, question under 120 characters, answer under 300, answered from the sources.",
  "If the sources don't support a section, return it as an empty list.",
].join("\n");

// A model's answer, made safe: JSON only, each item within its limits (an item
// over a limit is left out, never cut mid-sentence), at most the allowed number.
export function parseCommunityPublicPageDraft(text: unknown): CommunityPublicPageDraft | null {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const limits = COMMUNITY_PUBLIC_PAGE_LIMITS;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const lines = (value: unknown, items: number, chars: number) =>
    list(value).map(line).filter((item) => item && item.length <= chars).slice(0, items);
  const pairs = <A extends string, B extends string>(value: unknown, items: number, a: [A, number], b: [B, number]) =>
    list(value).flatMap((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const first = line(row[a[0]]);
      const second = line(row[b[0]]);
      return first && second && first.length <= a[1] && second.length <= b[1] ? [{ [a[0]]: first, [b[0]]: second } as Record<A | B, string>] : [];
    }).slice(0, items);
  const draft = {
    for_you: lines(parsed.for_you, limits.forYou.items, limits.forYou.chars),
    not_for: lines(parsed.not_for, limits.notFor.items, limits.notFor.chars),
    first_steps: pairs(parsed.first_steps, limits.firstSteps.items, ["title", limits.firstSteps.title], ["text", limits.firstSteps.text]),
    objections: pairs(parsed.objections, limits.objections.items, ["question", limits.objections.question], ["answer", limits.objections.answer]),
  };
  return draft.for_you.length || draft.not_for.length || draft.first_steps.length || draft.objections.length ? draft : null;
}
