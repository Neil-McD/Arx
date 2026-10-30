import { buildCommunityResourceEvidenceRef } from "./communityEvidenceContract";
import {
  computeCommunityLessonStages,
  type CommunityLessonFields,
  type CommunityLessonProgressStatus,
} from "./communityLessonContract";

export type CommunityCourseProgress = {
  done: number;
  total: number;
  /** Why the course can't be opened yet, when every staged lesson in it is locked. */
  lockedReason?: string;
};

type CourseLesson = {
  id: string;
  title: string;
  module_id: string | null;
  resource_role?: string | null;
  lesson?: CommunityLessonFields | null;
};

/**
 * A member's progress per course (module id), from their lesson progress. The
 * same store and gates as the Board and the site SDK's progress(), so course
 * cards never disagree with them.
 */
export function computeCommunityCourseProgress(args: {
  lessons: readonly CourseLesson[];
  statusByRef: Readonly<Record<string, CommunityLessonProgressStatus>>;
  // Course names by module id: a lock names the course to finish, never a
  // lesson the member hasn't reached yet (2026-10-28).
  courseTitles?: Readonly<Record<string, string>>;
}): Record<string, CommunityCourseProgress> {
  const pages = args.lessons.filter((lesson) => lesson.resource_role !== "source");
  const refOf = (lesson: CourseLesson) => buildCommunityResourceEvidenceRef(lesson.id);
  const doneRefs = new Set(pages.map(refOf).filter((ref) => args.statusByRef[ref] === "done"));
  const { stages, lockedRefs } = computeCommunityLessonStages({
    lessons: pages.map((lesson) => ({ ref: refOf(lesson), lesson: lesson.lesson })),
    doneRefs,
  });
  const titleByRef = new Map<string, string>(pages.map((lesson) => [refOf(lesson), lesson.title]));
  const courseByRef = new Map<string, string | null>(pages.map((lesson) => [refOf(lesson), lesson.module_id]));
  const blockedByStage = new Map(stages.map((stage) => [stage.name, stage.blocked_by]));

  const byCourse = new Map<string, CourseLesson[]>();
  for (const lesson of pages) {
    if (!lesson.module_id) continue;
    byCourse.set(lesson.module_id, [...(byCourse.get(lesson.module_id) ?? []), lesson]);
  }
  const result: Record<string, CommunityCourseProgress> = {};
  for (const [courseId, lessons] of byCourse) {
    const refs = lessons.map(refOf);
    const progress: CommunityCourseProgress = {
      done: refs.filter((ref) => doneRefs.has(ref)).length,
      total: refs.length,
    };
    const staged = lessons.filter((lesson) => lesson.lesson?.stage);
    if (staged.length > 0 && staged.every((lesson) => lockedRefs.has(refOf(lesson)))) {
      const gate = blockedByStage.get(staged[0].lesson?.stage ?? "");
      const gateCourse = gate ? courseByRef.get(gate) : null;
      const gateCourseTitle = gateCourse && gateCourse !== courseId ? args.courseTitles?.[gateCourse] : null;
      const gateTitle = gate ? titleByRef.get(gate) : null;
      progress.lockedReason = gateCourseTitle
        ? `Opens after "${gateCourseTitle}"`
        : gateTitle ? `Finish "${gateTitle}" first` : "Locked";
    }
    result[courseId] = progress;
  }
  return result;
}
