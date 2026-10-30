import { useMemo, useRef } from "react";
import type { AuthSession } from "../auth";
import {
  archiveCloudClientProperty,
  createCloudClientProperty,
  deleteCloudClientView,
  fetchCloudClientBulkAction,
  listAllCloudCommunityClients,
  listCloudClientViews,
  recordCloudClientEvent,
  runCloudClientBulkAction,
  saveCloudClientView,
  setCloudClientPropertyValue,
  setCloudClientStuckDays,
  updateCloudClientProperty,
  type CloudCommunityClientBulkInput,
  createCloudAccessIntegration,
  createCloudMyCommunityLicenseKey,
  endCloudCommunityAccess,
  fetchCloudClientAccess,
  fetchCloudClientTimeline,
  fetchCloudMyCommunityMemberAccess,
  grantCloudCommunityAccess,
  listCloudAccessIntegrationEvents,
  listCloudAccessIntegrations,
  listCloudCommunityClients,
  retryCloudAccessIntegrationEvent,
  revokeCloudAccessIntegration,
  revokeCloudClientLicenseKey,
  rotateCloudAccessIntegrationSecret,
  sendCloudAccessIntegrationTest,
  updateCloudAccessIntegration,
  type CloudCommunityIntegrationInput,
} from "../../../../shared/cloudCommunityMemberAccessGateway";
import { fetchCloudCommunityOffers } from "../../../../shared/cloudCommunityOffersGateway";

type Run = <T>(operation: (session: unknown) => Promise<T>) => Promise<T>;

// Every access call bound to one community and one signed-in person. Clients,
// the dossier's Access tab, Settings → Access and the member's own key card
// all go through this.
export function buildCommunityAccessGateway(communityId: string, scopeKey: string, run: Run) {
  return {
    scopeKey,
    communityId,
    listClients: (cursor?: string | null) => run((s) => listCloudCommunityClients(s, communityId, cursor)),
    listAllClients: () => run((s) => listAllCloudCommunityClients(s, communityId)),
    views: () => run((s) => listCloudClientViews(s, communityId)),
    saveView: (input: Parameters<typeof saveCloudClientView>[2]) => run((s) => saveCloudClientView(s, communityId, input)),
    deleteView: (key: string) => run((s) => deleteCloudClientView(s, communityId, key)),
    createProperty: (input: Parameters<typeof createCloudClientProperty>[2]) => run((s) => createCloudClientProperty(s, communityId, input)),
    updateProperty: (key: string, input: Parameters<typeof updateCloudClientProperty>[3]) => run((s) => updateCloudClientProperty(s, communityId, key, input)),
    archiveProperty: (key: string) => run((s) => archiveCloudClientProperty(s, communityId, key)),
    setValue: (membershipId: string, key: string, value: Parameters<typeof setCloudClientPropertyValue>[4]) =>
      run((s) => setCloudClientPropertyValue(s, communityId, membershipId, key, value)),
    recordEvent: (membershipId: string, type: "flagged" | "note", body?: string) => run((s) => recordCloudClientEvent(s, communityId, membershipId, type, body)),
    setStuckDays: (days: number) => run((s) => setCloudClientStuckDays(s, communityId, days)),
    bulk: (action: CloudCommunityClientBulkInput, membershipIds: string[]) => run((s) => runCloudClientBulkAction(s, communityId, action, membershipIds)),
    bulkStatus: (bulkActionId: string) => run((s) => fetchCloudClientBulkAction(s, communityId, bulkActionId)),
    clientAccess: (membershipId: string) => run((s) => fetchCloudClientAccess(s, communityId, membershipId)),
    timeline: (membershipId: string) => run((s) => fetchCloudClientTimeline(s, communityId, membershipId)),
    grant: (input: { membershipId?: string; email?: string; endsAt: string | null; reason: string; offerKey?: string | null }) =>
      run((s) => grantCloudCommunityAccess(s, communityId, input)),
    offers: () => run((s) => fetchCloudCommunityOffers({ session: s, communityId })),
    end: (membershipId: string) => run((s) => endCloudCommunityAccess(s, communityId, membershipId)),
    revokeKey: (membershipId: string) => run((s) => revokeCloudClientLicenseKey(s, communityId, membershipId)),
    integrations: () => run((s) => listCloudAccessIntegrations(s, communityId)),
    createIntegration: (input: CloudCommunityIntegrationInput) => run((s) => createCloudAccessIntegration(s, communityId, input)),
    updateIntegration: (integrationId: string, input: Partial<CloudCommunityIntegrationInput>) =>
      run((s) => updateCloudAccessIntegration(s, communityId, integrationId, input)),
    rotateSecret: (integrationId: string, which: "api_key" | "signing_secret") =>
      run((s) => rotateCloudAccessIntegrationSecret(s, communityId, integrationId, which)),
    revokeIntegration: (integrationId: string) => run((s) => revokeCloudAccessIntegration(s, communityId, integrationId)),
    sendTest: (integrationId: string) => run((s) => sendCloudAccessIntegrationTest(s, communityId, integrationId)),
    events: (integrationId: string) => run((s) => listCloudAccessIntegrationEvents(s, communityId, integrationId)),
    retryEvent: (integrationId: string, eventId: string) => run((s) => retryCloudAccessIntegrationEvent(s, communityId, integrationId, eventId)),
    myAccess: () => run((s) => fetchCloudMyCommunityMemberAccess(s, communityId)),
    createMyKey: () => run((s) => createCloudMyCommunityLicenseKey(s, communityId)),
  };
}

export type CommunityAccessGateway = ReturnType<typeof buildCommunityAccessGateway>;

/** For a page that has a session and ensureSession (Settings panes). */
export function useCommunityAccessGatewayForSession(params: {
  communityId: string | null;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}): CommunityAccessGateway | null {
  const current = useRef(params); current.current = params;
  const userId = (params.session as { user?: { id?: string } } | null)?.user?.id ?? null;
  return useMemo(() => {
    const { communityId } = params;
    if (!communityId || !userId) return null;
    return buildCommunityAccessGateway(communityId, `${communityId}:${userId}`, async (operation) => {
      const ready = await current.current.ensureSession(current.current.session);
      if (!ready) throw new Error("auth_session_required");
      return operation(ready);
    });
  }, [params.communityId, userId]);
}

/** Workflows: owners and admins only, dropped when the community or person changes. */
export function useWebCommunityAccessGateway(params: {
  activeCommunityId: string | null; canManageMembers: boolean; session: AuthSession | null;
  ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;
}): CommunityAccessGateway | undefined {
  const current = useRef(params); current.current = params;
  return useMemo(() => {
    const { activeCommunityId: communityId, session } = params;
    if (!communityId || !session || !params.canManageMembers) return undefined;
    const valid = () => current.current.activeCommunityId === communityId && current.current.session?.user.id === session.user.id && current.current.canManageMembers;
    return buildCommunityAccessGateway(communityId, `${communityId}:${session.user.id}`, async (operation) => {
      if (!valid()) throw new Error("access_scope_changed");
      const ready = await params.ensureSession(session, "community_access");
      if (!ready || ready.user.id !== session.user.id || !valid()) throw new Error("access_scope_changed");
      return operation(ready);
    });
  }, [params.activeCommunityId, params.canManageMembers, params.session, params.ensureSession]);
}
