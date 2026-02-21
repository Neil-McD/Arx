import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

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
  supabaseSession: SessionT | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  communityAgentDraftName: string;
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
  setLiveFailureMessage: string;
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingCommunityAgentDrafts(true);
    current.setCommunityAgentDraftsError(null);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/list_community_agent_drafts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: communityId }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        current.setCommunityAgentDrafts([]);
        current.setCommunityAgentDraftsError(message);
        current.setLoadedCommunityId(communityId);
        return;
      }

      const rows = (await response.json()) as DraftT[];
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

  const handleSaveCommunityAgentDraft = useCallback(async () => {
    const current = argsRef.current;
    const session = current.supabaseSession;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    const normalized = current.normalizeDraftForSave(current.communityAgentDraftLanding);
    if (!normalized) {
      current.setCommunityAgentDraftSaveError(current.saveValidationErrorMessage);
      return;
    }

    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsSavingCommunityAgentDraft(true);
    current.setCommunityAgentDraftSaveError(null);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/upsert_community_agent_draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: communityId,
            p_slot: COMMUNITY_AGENT_PRIMARY_SLOT,
            p_name: current.communityAgentDraftName,
            p_landing_json: normalized,
            p_system_prompt: current.communityAgentDraftSystemPrompt,
          }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        current.setCommunityAgentDraftSaveError(message);
        return;
      }

      const rows = (await response.json()) as UpsertDraftResponseRow[];
      const row = rows[0];
      if (!row) return;
      current.setCommunityAgentDrafts((prev) => {
        const without = prev.filter((draft) => draft.slot !== row.slot);
        const next: DraftT[] = [
          ...without,
          {
            id: row.id,
            community_id: communityId,
            slot: row.slot,
            name: current.communityAgentDraftName.trim() ? current.communityAgentDraftName.trim() : null,
            landing_json: normalized,
            system_prompt: current.communityAgentDraftSystemPrompt,
            is_active: row.is_active,
            updated_at: row.updated_at,
          } as DraftT,
        ];
        next.sort((a, b) => a.slot - b.slot);
        return next;
      });
      current.markDraftClean();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.saveFailureMessage;
      current.setCommunityAgentDraftSaveError(message);
    } finally {
      current.setIsSavingCommunityAgentDraft(false);
    }
  }, []);

  const handleSetLiveCommunityAgentDraft = useCallback(async () => {
    const current = argsRef.current;
    const session = current.supabaseSession;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsSavingCommunityAgentDraft(true);
    current.setCommunityAgentDraftSaveError(null);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/set_active_community_agent_draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: communityId, p_slot: COMMUNITY_AGENT_PRIMARY_SLOT }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        current.setCommunityAgentDraftSaveError(message);
        return;
      }
      current.setCommunityAgentDrafts((prev) =>
        prev.map((draft) =>
          draft.community_id === communityId ? { ...draft, is_active: draft.slot === COMMUNITY_AGENT_PRIMARY_SLOT } : draft,
        ),
      );
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.setLiveFailureMessage;
      current.setCommunityAgentDraftSaveError(message);
    } finally {
      current.setIsSavingCommunityAgentDraft(false);
    }
  }, []);

  return {
    loadCommunityAgentDrafts,
    handleSaveCommunityAgentDraft,
    handleSetLiveCommunityAgentDraft,
  };
}
