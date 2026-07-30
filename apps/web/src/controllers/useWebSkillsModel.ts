import { useCallback, useEffect } from "react";

import type { AuthSession } from "../auth";
import type {
  AppPage,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import { COMMUNITY_MANAGER_PLATFORM_SKILLS } from "../../../../shared/platformSkills";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import { useWebCommunitySkillAttachmentsController } from "./useWebCommunitySkillAttachmentsController";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

export function useWebSkillsModel(params: {
  activeCommunityId: string | null;
  activePage: AppPage;
  canManageMembers: boolean;
  canManageResources: boolean;
  communityTab: CommunityTab;
  ensureSession: EnsureAuthSession;
  session: AuthSession | null;
}) {
  const {
    activeCommunityId,
    activePage,
    canManageMembers,
    canManageResources,
    communityTab,
    ensureSession,
    session,
  } = params;

  const communityController =
    useWebCommunitySkillAttachmentsController<AuthSession>({
      activeCommunityId,
      session,
      ensureSession,
    });

  const createCommunitySkill = useCallback(
    (input: CreateSkillPackageInput) =>
      communityController.createPersonalSkillAndAttach(input),
    [communityController.createPersonalSkillAndAttach],
  );
  const attachSkillPackageToCommunity = useCallback(
    (skillPackageId: string) =>
      communityController.attachSkillPackageToCommunity(skillPackageId),
    [communityController.attachSkillPackageToCommunity],
  );
  const updateCommunitySkillAttachment = useCallback(
    (attachmentId: string, patch: { enabled?: boolean }) =>
      communityController.updateCommunitySkillAttachment(attachmentId, patch),
    [communityController.updateCommunitySkillAttachment],
  );
  const detachCommunitySkill = useCallback(
    (attachmentId: string) =>
      communityController.detachCommunitySkill(attachmentId),
    [communityController.detachCommunitySkill],
  );

  useEffect(() => {
    const shouldLoad =
      activePage === "community" && communityTab === "ai_agent";
    if (!shouldLoad) return;
    if (!session || !activeCommunityId || !canManageMembers) {
      communityController.clearCommunitySkillAttachments();
      return;
    }
    if (
      communityController.communitySkillAttachmentsLoadedCommunityIdRef
        .current === activeCommunityId
    ) {
      return;
    }
    void communityController.loadCommunitySkillAttachments(
      activeCommunityId,
      session,
    );
  }, [
    activeCommunityId,
    activePage,
    canManageMembers,
    communityController.clearCommunitySkillAttachments,
    communityController.communitySkillAttachmentsLoadedCommunityIdRef,
    communityController.loadCommunitySkillAttachments,
    communityTab,
    session,
  ]);

  useEffect(() => {
    const shouldLoad =
      activePage === "community" && communityTab === "ai_agent";
    if (!shouldLoad) return;
    if (!session || !canManageMembers) {
      communityController.clearCommunitySkillAttachments();
      return;
    }
    if (communityController.ownedSkillPackagesLoadedRef.current) return;
    void communityController.loadOwnedSkillPackages(session);
  }, [
    activePage,
    canManageMembers,
    communityController.clearCommunitySkillAttachments,
    communityController.loadOwnedSkillPackages,
    communityController.ownedSkillPackagesLoadedRef,
    communityTab,
    session,
  ]);

  return {
    community: communityController,
    communityPlatformSkills: canManageResources
      ? COMMUNITY_MANAGER_PLATFORM_SKILLS
      : [],
    actions: {
      createCommunitySkill,
      attachSkillPackageToCommunity,
      updateCommunitySkillAttachment,
      detachCommunitySkill,
    },
  };
}
