import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityFormDraft } from "./communityForms";
export async function listCloudCommunityFormResponses(session: unknown, communityId: string, membershipId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const page = await client.query(api.communityFormRequests.listBuilderResponses, { authSubject, communityId: communityId as Id<"communities">, membershipId: membershipId as Id<"communityMemberships">, includeCompleteness: true });
  if (Array.isArray(page)) throw new Error("form_response_completeness_unavailable");
  return page;
}

export async function listCloudCommunityForms(session: unknown, communityId: string): Promise<CommunityFormDraft[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityForms.listBuilderForms, { authSubject, communityId: communityId as Id<"communities"> });
}
export async function saveCloudCommunityForm(session: unknown, communityId: string, form: CommunityFormDraft): Promise<CommunityFormDraft> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.saveBuilderForm, { authSubject, communityId: communityId as Id<"communities">,
    key: form.key, expectedRevision: form.revision, name: form.name, questions: form.questions });
}
export type CloudCommunityClientProperty = { key: string; name: string; type: string; options: string[] };
export async function listCloudCommunityClientProperties(session: unknown, communityId: string): Promise<CloudCommunityClientProperty[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const result = await client.query(api.communityClients.listClientProperties, { authSubject, communityId: communityId as Id<"communities"> });
  return (result as any).properties ?? [];
}
/**
 * A select property with these options, made if missing: an existing one with
 * the same name gets any missing options; a same-named property of another
 * type is left alone and a "<name> (agent)" property is used instead.
 */
export async function ensureCloudCommunitySelectProperty(session: unknown, communityId: string,
  wanted: { name: string; options: string[] }): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const id = communityId as Id<"communities">;
  const properties = await listCloudCommunityClientProperties(session, communityId);
  for (const name of [wanted.name, `${wanted.name} (agent)`]) {
    const found = properties.find((property) => property.name.toLowerCase() === name.toLowerCase());
    if (found && found.type !== "select") continue;
    if (found) {
      const missing = wanted.options.filter((option) => !found.options.includes(option));
      if (missing.length) await client.mutation(api.communityClients.updateClientProperty, { authSubject, communityId: id, key: found.key, options: [...found.options, ...missing] });
      return found.key;
    }
    const created = await client.mutation(api.communityClients.createClientProperty, { authSubject, communityId: id, name, type: "select", options: wanted.options });
    return (created as { property: { key: string } }).property.key;
  }
  throw new Error("client_property_name_taken");
}
export async function listDeletedCloudCommunityForms(session: unknown, communityId: string): Promise<CommunityFormDraft[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityForms.listDeletedBuilderForms, { authSubject, communityId: communityId as Id<"communities"> });
}
export async function reorderCloudCommunityForms(session: unknown, communityId: string, keys: string[]) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.reorderBuilderForms, { authSubject, communityId: communityId as Id<"communities">, keys });
}
export async function deleteCloudCommunityForm(session: unknown, communityId: string, key: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.deleteBuilderForm, { authSubject, communityId: communityId as Id<"communities">, key });
}
export async function restoreCloudCommunityForm(session: unknown, communityId: string, key: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.restoreBuilderForm, { authSubject, communityId: communityId as Id<"communities">, key });
}
export async function publishCloudCommunityForm(session: unknown, communityId: string, form: CommunityFormDraft): Promise<CommunityFormDraft> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityForms.publishBuilderForm, { authSubject, communityId: communityId as Id<"communities">,
    key: form.key, expectedRevision: form.revision });
}
/** The Builder writes a form from a brief. Returns an unsaved draft for review. */
export async function draftCloudCommunityFormWithAgent(session: unknown, communityId: string, brief: string): Promise<{ name: string; questions: CommunityFormDraft["questions"] }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.action(api.communityFormDrafts.draftBuilderFormWithAgent, { authSubject, communityId: communityId as Id<"communities">, brief });
}
export async function loadCloudCommunityFormDraftAgentName(session: unknown, communityId: string): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityFormDrafts.formDraftAgentName, { authSubject, communityId: communityId as Id<"communities"> });
}
/** Members' personal pods, which pod pickers list after the group pods. */
export async function listCloudWorkflowGuideChannelIds(session: unknown, communityId: string): Promise<string[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityWorkflowGuideChannels.listWorkflowGuideChannelIds, { authSubject, communityId: communityId as Id<"communities"> });
}
