import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type CommunityLike = {
  id: string;
  name: string;
};

type DraftLike = {
  slot: number;
  name: string | null;
  landing_json: unknown;
  system_prompt: string | null;
};

type LandingLike = {
  tabs: Array<{ id: string }>;
};

type UseCommunityAgentEditorUiControllerArgs<
  LandingT extends LandingLike,
  EditT,
  DraftT extends DraftLike,
> = {
  activeCommunityId: string | null;
  communities: CommunityLike[];
  defaultLanding: LandingT;
  buildDefaultCommunityLanding: (communityName: string) => LandingT;
  normalizeCommunityAgentLanding: (input: unknown) => LandingT | null;

  setCommunityAgentDraftName: Dispatch<SetStateAction<string>>;
  setCommunityAgentDraftLanding: Dispatch<SetStateAction<LandingT>>;
  setCommunityAgentDraftSystemPrompt: Dispatch<SetStateAction<string>>;
  setCommunityAgentDraftSaveError: Dispatch<SetStateAction<string | null>>;
  setCommunityAgentPreviewTabId: Dispatch<SetStateAction<string>>;
  setCommunityAgentLandingEdit: Dispatch<SetStateAction<EditT | null>>;
  setCommunityAgentLandingEditValue: Dispatch<SetStateAction<string>>;

  communityAgentDraftDirtyRef: MutableRefObject<boolean>;
};

const COMMUNITY_AGENT_PRIMARY_SLOT = 1;

export function useCommunityAgentEditorUiController<
  LandingT extends LandingLike,
  EditT,
  DraftT extends DraftLike,
>(args: UseCommunityAgentEditorUiControllerArgs<LandingT, EditT, DraftT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const markCommunityAgentDraftDirty = useCallback(() => {
    argsRef.current.communityAgentDraftDirtyRef.current = true;
  }, []);

  const beginCommunityAgentLandingEdit = useCallback((edit: EditT, value: string) => {
    const current = argsRef.current;
    current.setCommunityAgentLandingEdit(edit);
    current.setCommunityAgentLandingEditValue(value);
  }, []);

  const clearCommunityAgentLandingEdit = useCallback(() => {
    const current = argsRef.current;
    current.setCommunityAgentLandingEdit(null);
    current.setCommunityAgentLandingEditValue("");
  }, []);

  const hydrateCommunityAgentEditor = useCallback((_slot: number, drafts: DraftT[]) => {
    const current = argsRef.current;
    const row = drafts.find((draft) => draft.slot === COMMUNITY_AGENT_PRIMARY_SLOT) ?? null;
    const communityName = current.activeCommunityId
      ? (current.communities.find((community) => community.id === current.activeCommunityId)?.name ?? "").trim()
      : "";
    const fallbackLanding = communityName
      ? current.buildDefaultCommunityLanding(communityName)
      : current.defaultLanding;
    const landing = current.normalizeCommunityAgentLanding(row?.landing_json) ?? fallbackLanding;
    current.setCommunityAgentDraftName(row?.name ?? "");
    current.setCommunityAgentDraftLanding(landing);
    current.setCommunityAgentDraftSystemPrompt(row?.system_prompt ?? "");
    current.setCommunityAgentDraftSaveError(null);
    current.communityAgentDraftDirtyRef.current = false;
    current.setCommunityAgentPreviewTabId(landing.tabs[0]?.id ?? "");
    current.setCommunityAgentLandingEdit(null);
    current.setCommunityAgentLandingEditValue("");
  }, []);

  return {
    markCommunityAgentDraftDirty,
    beginCommunityAgentLandingEdit,
    clearCommunityAgentLandingEdit,
    hydrateCommunityAgentEditor,
  };
}
