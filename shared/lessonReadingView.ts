// The member's reading view of a lesson: which platform's steps they see, and
// the table of contents built from its headings and videos.

export type LessonPlatform = { key: string; label: string };

const PLATFORM_HEADING = /^### In (.+?)\s*$/;
const SECTION_HEADING = /^#{1,2} /;
const FENCE = /^(`{3,}|~{3,})/;

function platformKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "default";
}

type Span = { key: string; label: string; start: number; end: number };

// "### In Cowork" and its siblings, each running to the next one or to the
// next top-level section ("## …"), which every member reads. Lines inside
// code blocks never count as headings.
function platformSpans(lines: string[]): Span[] {
  const spans: Span[] = [];
  let fence: string | null = null;
  let open: Span | null = null;
  lines.forEach((line, index) => {
    const marker = FENCE.exec(line)?.[1];
    if (marker && (!fence || line.startsWith(fence))) fence = fence ? null : marker;
    if (fence && !marker) return;
    const platform = PLATFORM_HEADING.exec(line);
    if (platform || SECTION_HEADING.test(line)) {
      if (open) { open.end = index; spans.push(open); open = null; }
      if (platform) open = { key: platformKey(platform[1]!), label: platform[1]!.trim(), start: index, end: lines.length };
    }
  });
  if (open) spans.push(open);
  return spans;
}

/** The platforms a lesson is written for, in order; empty when there's one way to do it. */
export function lessonPlatforms(body: string): LessonPlatform[] {
  const seen = new Set<string>();
  const platforms = platformSpans(body.replace(/\r\n?/g, "\n").split("\n"))
    .filter((span) => !seen.has(span.key) && Boolean(seen.add(span.key)))
    .map(({ key, label }) => ({ key, label }));
  return platforms.length > 1 ? platforms : [];
}

/** The lesson as a member on one platform reads it: the other platforms' steps
 *  are left out, and the chosen one's "In …" heading with them (the tabs say it). */
export function lessonBodyForPlatform(body: string, key: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const spans = platformSpans(lines);
  if (new Set(spans.map((span) => span.key)).size < 2) return body;
  const chosen = spans.some((span) => span.key === key) ? key : spans[0]!.key;
  const drop = new Set<number>();
  for (const span of spans) {
    if (span.key === chosen) { drop.add(span.start); continue; }
    for (let index = span.start; index < span.end; index += 1) drop.add(index);
  }
  return lines.filter((_line, index) => !drop.has(index)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type LessonTocEntry = { id: string; label: string; level: 2 | 3; kind: "section" | "video" };

/** A contents list earns its place once a lesson has three or more stops. */
export const LESSON_TOC_MIN_ENTRIES = 3;

export function lessonTocSlug(label: string, taken: Set<string>): string {
  const base = `lesson-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "section"}`;
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const FILE_LINK = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|drawio|json|md|txt|png|jpe?g|svg|mp3|mp4|mov|key|numbers|pages)(?:[?#]|$)/i;

/** Links in a lesson that hand the member a file, for the side column. */
export function isLessonFileLink(href: string): boolean {
  try {
    return FILE_LINK.test(new URL(href, "https://local.arx").pathname);
  } catch {
    return false;
  }
}
