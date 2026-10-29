import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityLessonProgressStatus, CommunityLessonStage } from "./communityLessonContract";
import type { CommunityTrackView } from "./communityLessonTracks";

/** A member's saved answer to one lesson element (button, checklist or quiz). */
export type CommunityLessonResponse = {
  element: string;
  value: boolean | string[];
  correct: boolean | null;
  complete: boolean;
  answered_at: string;
  // Quizzes: the explanation once answered, and the right answer once answered right.
  explanation_md?: string | null;
  answer?: string[] | null;
};

export type CommunityResourceProgressLesson = {
  ref: string;
  title: string;
  status: CommunityLessonProgressStatus;
  locked: boolean;
  started_at: string | null;
  completed_at: string | null;
  responses?: CommunityLessonResponse[];
};

export type CommunityResourceProgressState = {
  stages: CommunityLessonStage[];
  // Every skill track the member can see, with where they stand in it.
  tracks?: CommunityTrackView[];
  lessons: CommunityResourceProgressLesson[];
  truncated: boolean;
};

/** The signed-in member's own lesson progress in one community, with stage locks. */
export async function fetchCloudOwnResourceProgress<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<CommunityResourceProgressState> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query(api.communityResourceProgress.getOwnResourceProgress, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
  })) as CommunityResourceProgressState;
}

export type SetCommunityResourceProgressResult =
  | { ok: true; ref: string; status: CommunityLessonProgressStatus }
  | { ok: false; code: string; message: string };

/** Sets (never toggles) one lesson's status, so a retry is safe. */
export async function setCloudOwnResourceProgress<SessionT>(params: {
  session: SessionT;
  communityId: string;
  resourceId: string;
  status: CommunityLessonProgressStatus;
}): Promise<SetCommunityResourceProgressResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    resourceId: params.resourceId,
    status: params.status,
  })) as SetCommunityResourceProgressResult;
}

export type SetCommunityLessonResponseResult =
  | { ok: true; ref: string; element: string; response: CommunityLessonResponse | null; required_remaining: string[] }
  | { ok: false; code: string; message: string };

/** Saves (or with null, clears) the member's answer to one element of a lesson. Quizzes are graded on the server. */
export async function setCloudOwnLessonResponse<SessionT>(params: {
  session: SessionT;
  communityId: string;
  resourceId: string;
  element: string;
  value: true | string[] | null;
}): Promise<SetCommunityLessonResponseResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityResourceProgress.setOwnLessonResponse, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    resourceId: params.resourceId,
    element: params.element,
    value: params.value,
  })) as SetCommunityLessonResponseResult;
}

export type CommunityMemberCourseSummary = {
  ref: string;
  name: string | null;
  lesson_count: number;
  done_count: number;
  percent: number;
  completed_at: string | null;
};

export type CommunityMemberProgressReport = {
  membership_id: string;
  name: string | null;
  courses: CommunityMemberCourseSummary[];
  stages: CommunityLessonStage[];
  lessons: CommunityResourceProgressLesson[];
  truncated: boolean;
};

/** One member's course progress, answers included. Owners and admins only. */
export async function fetchCloudMemberProgressReport<SessionT>(params: {
  session: SessionT;
  communityId: string;
  membershipId: string;
}): Promise<CommunityMemberProgressReport> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query(api.communityResourceProgress.getMemberProgressReport, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    membershipId: params.membershipId,
  })) as CommunityMemberProgressReport;
}
