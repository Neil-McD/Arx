// The community brain's side panel: small rules, kept apart so they can be
// tested without drawing anything.
import type { BrainCourse } from "../../../../shared/communityBrain";
import type { CommunityResource } from "../components/communityResourcesContracts";

// A course's button, in the chips' words: start it, carry on from the next
// lesson, or look back over a finished one.
export function brainCourseAction(course: Pick<BrainCourse, "lessons">): { label: string; lessonId: string | null } {
  const lessons = [...course.lessons].sort((a, b) => a.order - b.order);
  if (!lessons.length) return { label: "Open the course", lessonId: null };
  const next = lessons.find((lesson) => !lesson.done);
  if (!next) return { label: "Review the course", lessonId: null };
  const started = lessons.some((lesson) => lesson.done);
  return { label: `${started ? "Continue" : "Start"}: ${next.title}`, lessonId: next.id };
}

// The loaded lesson for a dot on the map ("resource:<id>"), if this person
// has it: only what Knowledge already shows them.
export function brainLessonOf(lessons: readonly CommunityResource[] | undefined, mapId: string): CommunityResource | null {
  const id = mapId.replace(/^resource:/, "");
  return lessons?.find((lesson) => lesson.id === id) ?? null;
}

// At most about `max` characters, cut at a word, with an ellipsis.
export function clipWords(raw: string, max: number): string {
  const text = String(raw ?? "").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}
