import { useMemo, useRef } from "react";
import type { AuthSession } from "../auth";
import type { CommunityFormDraft } from "../../../../shared/communityForms";
import { deleteCloudCommunityForm, draftCloudCommunityFormWithAgent, loadCloudCommunityFormDraftAgentName, listCloudWorkflowGuideChannelIds, listDeletedCloudCommunityForms, reorderCloudCommunityForms, restoreCloudCommunityForm, listCloudCommunityForms, saveCloudCommunityForm, publishCloudCommunityForm, listCloudCommunityFormResponses, listCloudCommunityClientProperties, type CloudCommunityClientProperty } from "../../../../shared/cloudCommunityFormsGateway";
import { listCloudWorkflowChanges, setCloudWorkflowAgentChangeReview, undoCloudWorkflowChange, type WorkflowAgentChangeReview, type WorkflowStageChanges } from "../../../../shared/cloudCommunityWorkflowChangesGateway";
import { applyCloudCommunitySettingProposal, listCloudCommunitySettingProposals, rejectCloudCommunitySettingProposal, type CommunitySettingProposal } from "../../../../shared/cloudCommunitySettingProposalsGateway";
import { fetchCloudMemberProgressReport, type CommunityMemberProgressReport } from "../../../../shared/cloudCommunityResourceProgressGateway";

export type CommunityFormsGateway = {
  responses?: (membershipId: string) => ReturnType<typeof listCloudCommunityFormResponses>;
  // The member's course progress and lesson answers, beside their form answers.
  courseProgress?: (membershipId: string) => Promise<CommunityMemberProgressReport>;
  scopeKey: string;
  load: () => Promise<CommunityFormDraft[]>;
  save: (form: CommunityFormDraft) => Promise<CommunityFormDraft>;
  publish: (form: CommunityFormDraft) => Promise<CommunityFormDraft>;
  /** The Forms list: order, the deleted forms, delete (refused while in use) and restore. */
  loadDeleted?: () => Promise<CommunityFormDraft[]>;
  reorder?: (keys: string[]) => Promise<unknown>;
  remove?: (key: string) => Promise<unknown>;
  restore?: (key: string) => Promise<unknown>;
  /** The Builder writes an unsaved form from a short brief. */
  agentName?: () => Promise<string>;
  /** Members' personal pods, which pod pickers list after the group pods. */
  guideChannelIds?: () => Promise<string[]>;
  draftWithAgent?: (brief: string) => Promise<{ name: string; questions: CommunityFormDraft["questions"] }>;
  /** Workflows › Recent changes: what agents and admins changed, Undo, the agents' permission, and changes waiting for the owner. */
  changes?: {
    list: () => Promise<WorkflowStageChanges>;
    undo: (changeId: string) => Promise<unknown>;
    setReview: (review: WorkflowAgentChangeReview) => Promise<unknown>;
    waiting: () => Promise<CommunitySettingProposal[]>;
    approve: (proposalId: string) => Promise<CommunitySettingProposal>;
    decline: (proposalId: string) => Promise<CommunitySettingProposal>;
  };
  /** Client properties a question can fill. */
  clientProperties?: () => Promise<CloudCommunityClientProperty[]>;
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
      responses: (membershipId: string) => run(s => listCloudCommunityFormResponses(s, communityId, membershipId)),
      courseProgress: (membershipId: string) => run(s => fetchCloudMemberProgressReport({ session: s, communityId, membershipId })),
      save: (form: CommunityFormDraft) => run(s => saveCloudCommunityForm(s, communityId, form)),
      publish: (form: CommunityFormDraft) => run(s => publishCloudCommunityForm(s, communityId, form)),
      loadDeleted: () => run(s => listDeletedCloudCommunityForms(s, communityId)),
      reorder: (keys: string[]) => run(s => reorderCloudCommunityForms(s, communityId, keys)),
      remove: (key: string) => run(s => deleteCloudCommunityForm(s, communityId, key)),
      restore: (key: string) => run(s => restoreCloudCommunityForm(s, communityId, key)),
      guideChannelIds: () => run(s => listCloudWorkflowGuideChannelIds(s, communityId)),
      agentName: () => run(s => loadCloudCommunityFormDraftAgentName(s, communityId)),
      draftWithAgent: (brief: string) => run(s => draftCloudCommunityFormWithAgent(s, communityId, brief)),
      changes: {
        list: () => run(s => listCloudWorkflowChanges(s, communityId)),
        undo: (changeId: string) => run(s => undoCloudWorkflowChange(s, communityId, changeId)),
        setReview: (review: WorkflowAgentChangeReview) => run(s => setCloudWorkflowAgentChangeReview(s, communityId, review)),
        waiting: () => run(async s => (await listCloudCommunitySettingProposals(s, communityId)).pending.filter(proposal => proposal.workflow)),
        approve: (proposalId: string) => run(s => applyCloudCommunitySettingProposal(s, communityId, proposalId)),
        decline: (proposalId: string) => run(s => rejectCloudCommunitySettingProposal(s, communityId, proposalId)),
      },
      clientProperties: () => run(s => listCloudCommunityClientProperties(s, communityId)) };
  }, [params.activeCommunityId, params.canManageMembers, params.session, params.ensureSession]);
}
