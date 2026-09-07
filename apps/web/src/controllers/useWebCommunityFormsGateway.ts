import { useMemo, useRef } from "react";
import type { AuthSession } from "../auth";
import type { CommunityFormDraft } from "../../../../shared/communityForms";
import { listCloudCommunityForms, saveCloudCommunityForm, publishCloudCommunityForm } from "../../../../shared/cloudCommunityFormsGateway";

export type CommunityFormsGateway = {
  scopeKey: string;
  load: () => Promise<CommunityFormDraft[]>;
  save: (form: CommunityFormDraft) => Promise<CommunityFormDraft>;
  publish: (form: CommunityFormDraft) => Promise<CommunityFormDraft>;
};
export function useWebCommunityFormsGateway(params: {
  activeCommunityId: string | null; canManageMembers: boolean; session: AuthSession | null;
  ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;
}): CommunityFormsGateway | undefined {
  const current = useRef(params); current.current = params;
  return useMemo(() => {
    const { activeCommunityId: communityId, session } = params;
    if (!communityId || !session || !params.canManageMembers) return undefined;
    const run = async <T,>(operation: (session: AuthSession) => Promise<T>): Promise<T> => {
      const valid = () => current.current.activeCommunityId === communityId && current.current.session?.user.id === session.user.id && current.current.canManageMembers;
      if (!valid()) throw new Error("form_scope_changed");
      const ready = await params.ensureSession(session, "community_forms");
      if (!ready || ready.user.id !== session.user.id || !valid()) throw new Error("form_scope_changed");
      const result = await operation(ready);
      if (!valid()) throw new Error("form_scope_changed");
      return result;
    };
    return { scopeKey: `${communityId}:${session.user.id}`, load: () => run(s => listCloudCommunityForms(s, communityId)),
      save: (form: CommunityFormDraft) => run(s => saveCloudCommunityForm(s, communityId, form)),
      publish: (form: CommunityFormDraft) => run(s => publishCloudCommunityForm(s, communityId, form)) };
  }, [params.activeCommunityId, params.canManageMembers, params.session, params.ensureSession]);
}
