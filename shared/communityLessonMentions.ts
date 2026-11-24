// Mentions (docs: the community brain, slice B): when a lesson's words name
// another lesson or a course, that is a link on the community brain's map.
// Exact names only, no model: a link is drawn because the builder wrote the
// name. These are the rules, free of the database so they can be tested
// alone; convex/communityLessonMentions.ts reads the lessons and keeps the list.

export type LessonName = { ref: string; title: string; courseRef: string };
export type CourseName = { ref: string; name: string };
// from: a lesson. to: a lesson or a course.
export type LessonLink = { from: string; to: string };

export const LESSON_MENTIONS_MAX = 600;
export const LESSON_MENTIONS_PER_LESSON = 8;

function key(raw: string): string {
  return String(raw ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[.,:;!?]+$/, "");
}

// A name anyone would write in passing ("Pods", "A tour") only counts when the
// writer marked it: bold, in quotes, or as a link's words. A longer name
// (two words and eight letters or more) counts wherever it stands.
function standsAlone(name: string): boolean {
  return name.split(" ").length >= 2 && name.replace(/[^a-z0-9]/g, "").length >= 8;
}

export type NameIndex = { marked: Map<string, string>; plain: Array<{ name: string; ref: string }> };

// Every name that means exactly one thing. A name two things share (two
// lessons called "Welcome", a lesson named after its course) links nothing.
export function lessonNameIndex(lessons: readonly LessonName[], courses: readonly CourseName[]): NameIndex {
  const found = new Map<string, string | null>();
  const add = (name: string, ref: string) => {
    const k = key(name);
    if (!k || k.length < 3) return;
    found.set(k, found.has(k) ? null : ref);
  };
  for (const course of courses) add(course.name, course.ref);
  for (const lesson of lessons) add(lesson.title, lesson.ref);
  const marked = new Map<string, string>();
  const plain: Array<{ name: string; ref: string }> = [];
  for (const [name, ref] of found) {
    if (!ref) continue;
    marked.set(name, ref);
    if (standsAlone(name)) plain.push({ name, ref });
  }
  // Longest first, so "Build your community, A to Z" wins over a shorter name inside it.
  plain.sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
  return { marked, plain };
}

const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// What one lesson's words name. Code is skipped; a lesson never links itself
// or its own course.
export function lessonMentions(lesson: LessonName, bodyMd: string, index: NameIndex): string[] {
  const text = String(bodyMd ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const found: string[] = [];
  const take = (ref: string | undefined) => {
    if (!ref || ref === lesson.ref || ref === lesson.courseRef || found.includes(ref)) return;
    found.push(ref);
  };
  // Marked names: **bold**, "quoted", [a link's words].
  for (const match of text.matchAll(/\*\*([^*\n]{2,160})\*\*|["“]([^"”\n]{2,160})["”]|\[([^\]\n]{2,160})\]\(/g)) {
    take(index.marked.get(key(match[1] ?? match[2] ?? match[3] ?? "")));
  }
  // Longer names, wherever they stand, as whole words.
  let rest = ` ${key(text.replace(/[*_#>[\]()]/g, " "))} `;
  for (const { name, ref } of index.plain) {
    const at = new RegExp(`(^|[^a-z0-9])${esc(name)}([^a-z0-9]|$)`);
    if (!at.test(rest)) continue;
    take(ref);
    // Its words are spent: a shorter name inside it is not also named.
    rest = rest.replace(new RegExp(esc(name), "g"), " ");
  }
  return found.slice(0, LESSON_MENTIONS_PER_LESSON);
}

// What changes when the links need working out again: any lesson's or
// course's name, any lesson's words, or which lessons there are.
export function lessonMentionsFingerprint(lessons: ReadonlyArray<LessonName & { body: string }>, courses: readonly CourseName[]): string {
  let h = 2166136261;
  const eat = (text: string) => { for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 124; h = Math.imul(h, 16777619); };
  for (const course of courses) { eat(course.ref); eat(course.name); }
  for (const lesson of lessons) { eat(lesson.ref); eat(lesson.title); eat(lesson.courseRef); eat(lesson.body); }
  return `v1:${lessons.length}:${(h >>> 0).toString(36)}`;
}
