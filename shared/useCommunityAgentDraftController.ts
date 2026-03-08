import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import {
  listCloudCommunityAgentDraftRows,
  setActiveCloudCommunityAgentDraft,
  upsertCloudCommunityAgentDraft,
} from "./cloudCommunityAgentGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityAgentDraftLike<LandingT> = {
  id: string;
  community_id: string;
  slot: number;
  name: string | null;
  landing_json: LandingT | null;
  system_prompt: string | null;
  is_active: boolean;
  updated_at: string;
};

type UseCommunityAgentDraftControllerArgs<
  SessionT extends SessionLike,
  LandingT,
  DraftT extends CommunityAgentDraftLike<LandingT>,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  communityAgentDraftLanding: LandingT;
  communityAgentDraftSystemPrompt: string;
  communityAgentDrafts: DraftT[];
  normalizeDraftForSave: (draft: LandingT) => LandingT | null;
  hydrateDraftEditor: (slot: number, drafts: DraftT[]) => void;
  setLoadedCommunityId: (communityId: string | null) => void;
  markDraftClean: () => void;
  setIsLoadingCommunityAgentDrafts: Dispatch<SetStateAction<boolean>>;
  setCommunityAgentDraftsError: Dispatch<SetStateAction<string | null>>;
  setCommunityAgentDrafts: Dispatch<SetStateAction<DraftT[]>>;
  setIsSavingCommunityAgentDraft: Dispatch<SetStateAction<boolean>>;
  setCommunityAgentDraftSaveError: Dispatch<SetStateAction<string | null>>;
  saveValidationErrorMessage: string;
  loadFailureMessage: string;
  saveFailureMessage: string;
};

type UpsertDraftResponseRow = {
  id: string;
  slot: number;
  is_active: boolean;
  updated_at: string;
};

const COMMUNITY_AGENT_PRIMARY_SLOT = 1;

export function useCommunityAgentDraftController<
  SessionT extends SessionLike,
  LandingT,
  DraftT extends CommunityAgentDraftLike<LandingT>,
>(
  args: UseCommunityAgentDraftControllerArgs<SessionT, LandingT, DraftT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityAgentDrafts = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityAgentDrafts(true);
    current.setCommunityAgentDraftsError(null);
    try {
      const rows = await listCloudCommunityAgentDraftRows<SessionT, DraftT>({
        session,
        communityId,
      });
      rows.sort((a, b) => a.slot - b.slot);
      current.setCommunityAgentDrafts(rows);
      current.setLoadedCommunityId(communityId);
      current.hydrateDraftEditor(COMMUNITY_AGENT_PRIMARY_SLOT, rows);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.loadFailureMessage;
      current.setCommunityAgentDrafts([]);
      current.setCommunityAgentDraftsError(message);
      current.setLoadedCommunityId(communityId);
    } finally {
      current.setIsLoadingCommunityAgentDrafts(false);
    }
  }, []);

  const handleSaveCommunityAgentDraft = useCallback(async (): Promise<boolean> => {
    const current = argsRef.current;
    const session = current.session;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return false;

    const normalized = current.normalizeDraftForSave(current.communityAgentDraftLanding);
    if (!normalized) {
      current.setCommunityAgentDraftSaveError(current.saveValidationErrorMessage);
      return false;
    }

    current.setIsSavingCommunityAgentDraft(true);
    current.setCommunityAgentDraftSaveError(null);
    try {
      const row = (await upsertCloudCommunityAgentDraft({
        session,
        communityId,
        slot: COMMUNITY_AGENT_PRIMARY_SLOT,
        name: null,
        landingJson: normalized,
        systemPrompt: current.communityAgentDraftSystemPrompt,
      })) as UpsertDraftResponseRow | null;
      if (!row) return false;
      await setActiveCloudCommunityAgentDraft({
        session,
        communityId,
        slot: COMMUNITY_AGENT_PRIMARY_SLOT,
      });
      current.setCommunityAgentDrafts((prev) => {
        const without = prev.filter((draft) => draft.slot !== row.slot);
        const next: DraftT[] = [
          ...without,
          {
            id: row.id,
            community_id: communityId,
            slot: row.slot,
            name: null,
            landing_json: normalized,
            system_prompt: current.communityAgentDraftSystemPrompt,
            is_active: true,
            updated_at: row.updated_at,
          } as DraftT,
        ];
        next.sort((a, b) => a.slot - b.slot);
        return next;
      });
      current.markDraftClean();
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.saveFailureMessage;
      current.setCommunityAgentDraftSaveError(message);
      return false;
    } finally {
      current.setIsSavingCommunityAgentDraft(false);
    }
  }, []);

  return {
    loadCommunityAgentDrafts,
    handleSaveCommunityAgentDraft,
  };
}
