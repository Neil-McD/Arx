import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityFormDraft } from "./communityForms";

export async function listCloudCommunityForms(session: unknown, communityId: string): Promise<CommunityFormDraft[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityForms.listBuilderForms, { authSubject, communityId: communityId as Id<"communities"> });
}
export async function saveCloudCommunityForm(session: unknown, communityId: string, form: CommunityFormDraft): Promise<CommunityFormDraft> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.saveBuilderForm, { authSubject, communityId: communityId as Id<"communities">,
    key: form.key, expectedRevision: form.revision, name: form.name, questions: form.questions });
}
export async function publishCloudCommunityForm(session: unknown, communityId: string, form: CommunityFormDraft): Promise<CommunityFormDraft> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.publishBuilderForm, { authSubject, communityId: communityId as Id<"communities">,
    key: form.key, expectedRevision: form.revision });
}
