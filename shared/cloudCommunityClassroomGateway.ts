import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

// The classroom (design v1 Knowledge): a member's own lesson progress, and for
// hosts how many people have started and finished each course.
type Call = { session: unknown; communityId: string };

export async function fetchMyLessonProgress(params: Call): Promise<Array<{ resource_id: string; completed_at: string }>> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const result = await client.query("communityLessonProgress:getMyLessonProgress" as any, { authSubject, communityId: params.communityId }) as { done: Array<{ resource_id: string; completed_at: string }> };
  return result.done;
}

export async function setMyLessonDone(params: Call & { resourceId: string; done: boolean }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityLessonProgress:setMyLessonDone" as any, { authSubject, communityId: params.communityId, resourceId: params.resourceId, done: params.done });
}

export type CourseProgressSummary = { module_id: string; lessons: number; started: number; finished: number };

export async function fetchCourseProgressSummary(params: Call): Promise<CourseProgressSummary[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const result = await client.query("communityLessonProgress:getCourseProgressSummary" as any, { authSubject, communityId: params.communityId }) as { courses: CourseProgressSummary[] };
  return result.courses;
}
