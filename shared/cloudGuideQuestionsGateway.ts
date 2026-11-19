// The guide's questions to a person, answered above the box where they type,
// and what they let it do without asking (convex/communityGuideQuestions.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { GuideAnswerResult, GuideQuestionAnswer } from "./guideQuestions";

type Params = { session: unknown; communityId: string };

export async function answerGuideQuestion(params: Params & { questionId: string; answer: GuideQuestionAnswer }): Promise<GuideAnswerResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.action("communityGuideQuestions:answerGuideQuestion" as any, {
    authSubject, communityId: params.communityId, questionId: params.questionId, answer: params.answer });
}

export async function setGuideAlwaysAllowed(params: Params & { on: boolean; kind?: "post" | "message" }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityGuideQuestions:setGuideAlwaysAllowed" as any, { authSubject, communityId: params.communityId, kind: params.kind ?? "post", on: params.on });
}
