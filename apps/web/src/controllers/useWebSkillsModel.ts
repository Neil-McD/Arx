import { useCallback, useEffect, useMemo } from "react";

import type { AuthSession } from "../auth";
import type {
  AppPage,
  CommunityTab,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import { buildEffectiveSkills } from "../../../../shared/effectiveSkills";
import { COMMUNITY_MANAGER_PLATFORM_SKILLS } from "../../../../shared/platformSkills";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import { useWebCommunitySkillAttachmentsController } from "./useWebCommunitySkillAttachmentsController";
import { useWebEffectiveSkillsController } from "./useWebEffectiveSkillsController";
import { useWebUserPlatformSkillsController } from "./useWebUserPlatformSkillsController";

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
  settingsPage: SettingsPage;
}) {
  const {
    activeCommunityId,
    activePage,
    canManageMembers,
    canManageResources,
    communityTab,
    ensureSession,
    session,
    settingsPage,
  } = params;

  const effectiveController = useWebEffectiveSkillsController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession,
  });
  const userController = useWebUserPlatformSkillsController<AuthSession>({
    session,
    ensureSession,
  });
  const communityController =
    useWebCommunitySkillAttachmentsController<AuthSession>({
      activeCommunityId,
      session,
      ensureSession,
    });

  const reloadEffectiveSkills = useCallback(async () => {
    if (!session) {
      effectiveController.clearEffectiveSkills();
      return;
    }
    effectiveController.effectiveSkillsLoadedKeyRef.current = null;
    await effectiveController.loadEffectiveSkills(session);
  }, [
    effectiveController.clearEffectiveSkills,
    effectiveController.effectiveSkillsLoadedKeyRef,
    effectiveController.loadEffectiveSkills,
    session,
  ]);

  const runThenRefresh = useCallback(async (
    mutation: () => Promise<boolean>,
  ) => {
    const succeeded = await mutation();
    if (succeeded) void reloadEffectiveSkills();
    return succeeded;
  }, [reloadEffectiveSkills]);

  const createCommunitySkill = useCallback(
    (input: CreateSkillPackageInput) =>
      runThenRefresh(() => communityController.createPersonalSkillAndAttach(input)),
    [communityController.createPersonalSkillAndAttach, runThenRefresh],
  );
  const createUserPlatformSkill = useCallback(
    (input: CreateSkillPackageInput) =>
      runThenRefresh(() => userController.createUserPlatformSkill(input)),
    [runThenRefresh, userController.createUserPlatformSkill],
  );
  const updateUserPlatformSkill = useCallback(
    (installId: string, patch: { enabled?: boolean }) =>
      runThenRefresh(() => userController.updateUserPlatformSkill(installId, patch)),
    [runThenRefresh, userController.updateUserPlatformSkill],
  );
  const saveUserPlatformSkill = useCallback(
    (installId: string, input: CreateSkillPackageInput) =>
      runThenRefresh(() => userController.saveUserPlatformSkill(installId, input)),
    [runThenRefresh, userController.saveUserPlatformSkill],
  );
  const deleteUserPlatformSkill = useCallback(
    (installId: string) =>
      runThenRefresh(() => userController.deleteUserPlatformSkill(installId)),
    [runThenRefresh, userController.deleteUserPlatformSkill],
  );
  const attachSkillPackageToCommunity = useCallback(
    (skillPackageId: string) =>
      runThenRefresh(() =>
        communityController.attachSkillPackageToCommunity(skillPackageId)),
    [communityController.attachSkillPackageToCommunity, runThenRefresh],
  );
  const updateCommunitySkillAttachment = useCallback(
    (attachmentId: string, patch: { enabled?: boolean }) =>
      runThenRefresh(() =>
        communityController.updateCommunitySkillAttachment(attachmentId, patch)),
    [communityController.updateCommunitySkillAttachment, runThenRefresh],
  );
  const detachCommunitySkill = useCallback(
    (attachmentId: string) =>
      runThenRefresh(() =>
        communityController.detachCommunitySkill(attachmentId)),
    [communityController.detachCommunitySkill, runThenRefresh],
  );

  useEffect(() => {
    const shouldLoad =
      activePage === "settings" && settingsPage === "integrations";
    if (!shouldLoad) return;
    if (!session) {
      effectiveController.clearEffectiveSkills();
      return;
    }
    const loadedKey = `${session.user.id}:${activeCommunityId ?? "personal"}`;
    if (effectiveController.effectiveSkillsLoadedKeyRef.current === loadedKey) return;
    void effectiveController.loadEffectiveSkills(session);
  }, [
    activeCommunityId,
    activePage,
    effectiveController.clearEffectiveSkills,
    effectiveController.effectiveSkillsLoadedKeyRef,
    effectiveController.loadEffectiveSkills,
    session,
    settingsPage,
  ]);

  useEffect(() => {
    const shouldLoad =
      activePage === "discover" ||
      (activePage === "settings" && settingsPage === "integrations");
    if (!shouldLoad) return;
    if (!session) {
      userController.clearUserPlatformSkills();
      return;
    }
    if (userController.userPlatformSkillsLoadedUserIdRef.current === session.user.id) return;
    void userController.loadUserPlatformSkills(session);
  }, [
    activePage,
    session,
    settingsPage,
    userController.clearUserPlatformSkills,
    userController.loadUserPlatformSkills,
    userController.userPlatformSkillsLoadedUserIdRef,
  ]);

  useEffect(() => {
    const shouldLoad =
      (activePage === "community" && communityTab === "ai_agent") ||
      activePage === "discover" ||
      (activePage === "settings" && settingsPage === "integrations");
    if (!shouldLoad) return;
    if (!session || !activeCommunityId || !canManageMembers) {
      communityController.clearCommunitySkillAttachments();
      return;
    }
    if (
      communityController.communitySkillAttachmentsLoadedCommunityIdRef.current
      === activeCommunityId
    ) {
      return;
    }
    void communityController.loadCommunitySkillAttachments(activeCommunityId, session);
  }, [
    activeCommunityId,
    activePage,
    canManageMembers,
    communityController.clearCommunitySkillAttachments,
    communityController.communitySkillAttachmentsLoadedCommunityIdRef,
    communityController.loadCommunitySkillAttachments,
    communityTab,
    session,
    settingsPage,
  ]);

  useEffect(() => {
    const shouldLoad =
      (activePage === "community" && communityTab === "ai_agent") ||
      activePage === "discover";
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

  const settingsEffectiveSkills = useMemo(() => {
    if (!effectiveController.effectiveSkillsError) {
      return effectiveController.effectiveSkills;
    }
    return buildEffectiveSkills({
      platformSkills:
        activeCommunityId && canManageResources
          ? COMMUNITY_MANAGER_PLATFORM_SKILLS
          : [],
      personalSkills: userController.userPlatformSkills,
      communitySkills: communityController.communitySkillAttachments,
    });
  }, [
    activeCommunityId,
    canManageResources,
    communityController.communitySkillAttachments,
    effectiveController.effectiveSkills,
    effectiveController.effectiveSkillsError,
    userController.userPlatformSkills,
  ]);
  const settingsEffectiveSkillsError =
    effectiveController.effectiveSkillsError && settingsEffectiveSkills.length === 0
      ? effectiveController.effectiveSkillsError
      : null;

  return {
    effective: effectiveController,
    user: userController,
    community: communityController,
    communityPlatformSkills: canManageResources
      ? COMMUNITY_MANAGER_PLATFORM_SKILLS
      : [],
    settingsEffectiveSkills,
    settingsEffectiveSkillsError,
    actions: {
      createCommunitySkill,
      createUserPlatformSkill,
      updateUserPlatformSkill,
      saveUserPlatformSkill,
      deleteUserPlatformSkill,
      attachSkillPackageToCommunity,
      updateCommunitySkillAttachment,
      detachCommunitySkill,
    },
  };
}
