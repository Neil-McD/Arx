import { useCallback, useRef, useState } from "react";

import type {
  CommunityAttachedSkill,
  CreateSkillPackageInput,
  SkillPackageSummary,
} from "../../../../shared/communitySkillTypes";
import {
  attachCloudSkillPackageToCommunity,
  detachCloudCommunitySkill,
  listCloudCommunitySkillAttachments,
  listCloudOwnedSkillPackages,
  updateCloudCommunitySkillAttachment,
} from "../../../../shared/cloudCommunitySkillGateway";
import { createCloudUserPlatformSkill } from "../../../../shared/cloudUserPlatformSkillGateway";
import {
  resolveUsableSession,
  type EnsureSessionFn,
} from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebCommunitySkillAttachmentsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebCommunitySkillAttachmentsController<
  SessionT extends SessionLike,
>(args: UseWebCommunitySkillAttachmentsControllerArgs<SessionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [communitySkillAttachments, setCommunitySkillAttachments] = useState<
    CommunityAttachedSkill[]
  >([]);
  const [ownedSkillPackages, setOwnedSkillPackages] = useState<SkillPackageSummary[]>(
    [],
  );
  const [isLoadingCommunitySkillAttachments, setIsLoadingCommunitySkillAttachments] =
    useState(false);
  const [isLoadingOwnedSkillPackages, setIsLoadingOwnedSkillPackages] = useState(
    false,
  );
  const [communitySkillAttachmentError, setCommunitySkillAttachmentError] =
    useState<string | null>(null);
  const [ownedSkillPackagesError, setOwnedSkillPackagesError] =
    useState<string | null>(null);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [communitySkillMutationError, setCommunitySkillMutationError] =
    useState<string | null>(null);
  const [updatingCommunitySkillAttachmentId, setUpdatingCommunitySkillAttachmentId] =
    useState<string | null>(null);
  const [removingCommunitySkillAttachmentId, setRemovingCommunitySkillAttachmentId] =
    useState<string | null>(null);
  const [attachingSkillPackageId, setAttachingSkillPackageId] = useState<string | null>(
    null,
  );
  const communitySkillAttachmentsLoadedCommunityIdRef = useRef<string | null>(
    null,
  );
  const ownedSkillPackagesLoadedRef = useRef(false);

  const clearCommunitySkillAttachments = useCallback(() => {
    setCommunitySkillAttachments([]);
    setOwnedSkillPackages([]);
    setCommunitySkillAttachmentError(null);
    setOwnedSkillPackagesError(null);
    setCommunitySkillMutationError(null);
    communitySkillAttachmentsLoadedCommunityIdRef.current = null;
    ownedSkillPackagesLoadedRef.current = false;
  }, []);

  const loadCommunitySkillAttachments = useCallback(
    async (communityId: string, session: SessionT) => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        session,
        current.ensureSession,
      );
      if (!usableSession) return;
      setIsLoadingCommunitySkillAttachments(true);
      setCommunitySkillAttachmentError(null);
      try {
        const rows = await listCloudCommunitySkillAttachments({
          session: usableSession,
          communityId,
        });
        setCommunitySkillAttachments(rows);
        communitySkillAttachmentsLoadedCommunityIdRef.current = communityId;
      } catch (error) {
        setCommunitySkillAttachmentError(
          toErrorMessage(error, "Failed to load community skills."),
        );
        communitySkillAttachmentsLoadedCommunityIdRef.current = communityId;
      } finally {
        setIsLoadingCommunitySkillAttachments(false);
      }
    },
    [],
  );

  const loadOwnedSkillPackages = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(
      session,
      current.ensureSession,
    );
    if (!usableSession) return;
    setIsLoadingOwnedSkillPackages(true);
    setOwnedSkillPackagesError(null);
    try {
      const rows = await listCloudOwnedSkillPackages({
        session: usableSession,
      });
      setOwnedSkillPackages(rows);
      ownedSkillPackagesLoadedRef.current = true;
    } catch (error) {
      setOwnedSkillPackagesError(
        toErrorMessage(error, "Failed to load skill packages."),
      );
      ownedSkillPackagesLoadedRef.current = true;
    } finally {
      setIsLoadingOwnedSkillPackages(false);
    }
  }, []);

  const createPersonalSkillAndAttach = useCallback(
    async (input: CreateSkillPackageInput): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setIsCreatingSkill(true);
      setCommunitySkillMutationError(null);
      try {
        const created = await createCloudUserPlatformSkill({
          session: usableSession,
          input,
        });
        if (!created) return false;
        const createdSkillPackage = created.skill;
        setOwnedSkillPackages((prev) => {
          const next = prev.filter((entry) => entry.id !== createdSkillPackage.id);
          next.unshift(createdSkillPackage);
          return next;
        });
        const attached = await attachCloudSkillPackageToCommunity({
          session: usableSession,
          communityId,
          skillPackageId: createdSkillPackage.id,
        });
        if (!attached) {
          setCommunitySkillMutationError(
            "Created personal skill, but failed to attach it to this community.",
          );
          return false;
        }
        setCommunitySkillAttachments((prev) => {
          const next = prev.filter((entry) => entry.id !== attached.id);
          next.unshift(attached);
          return next;
        });
        return true;
      } catch (error) {
        setCommunitySkillMutationError(
          toErrorMessage(error, "Failed to create and attach skill."),
        );
        return false;
      } finally {
        setIsCreatingSkill(false);
      }
    },
    [],
  );

  const attachSkillPackageToCommunity = useCallback(
    async (skillPackageId: string): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setAttachingSkillPackageId(skillPackageId);
      setCommunitySkillMutationError(null);
      try {
        const attached = await attachCloudSkillPackageToCommunity({
          session: usableSession,
          communityId,
          skillPackageId,
        });
        if (!attached) return false;
        setCommunitySkillAttachments((prev) => {
          const next = prev.filter((entry) => entry.id !== attached.id);
          next.unshift(attached);
          return next;
        });
        return true;
      } catch (error) {
        setCommunitySkillMutationError(
          toErrorMessage(error, "Failed to attach skill package."),
        );
        return false;
      } finally {
        setAttachingSkillPackageId(null);
      }
    },
    [],
  );

  const updateCommunitySkillAttachment = useCallback(
    async (
      communitySkillAttachmentId: string,
      patch: { enabled?: boolean },
    ): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setUpdatingCommunitySkillAttachmentId(communitySkillAttachmentId);
      setCommunitySkillMutationError(null);
      try {
        const attached = await updateCloudCommunitySkillAttachment({
          session: usableSession,
          communityId,
          communitySkillAttachmentId,
          enabled: patch.enabled,
        });
        if (!attached) return false;
        setCommunitySkillAttachments((prev) =>
          prev.map((entry) => (entry.id === attached.id ? attached : entry)),
        );
        return true;
      } catch (error) {
        setCommunitySkillMutationError(
          toErrorMessage(error, "Failed to update skill."),
        );
        return false;
      } finally {
        setUpdatingCommunitySkillAttachmentId(null);
      }
    },
    [],
  );

  const detachCommunitySkill = useCallback(
    async (communitySkillAttachmentId: string): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      const communityId = current.activeCommunityId;
      if (!usableSession || !communityId) return false;
      setRemovingCommunitySkillAttachmentId(communitySkillAttachmentId);
      setCommunitySkillMutationError(null);
      try {
        const removed = await detachCloudCommunitySkill({
          session: usableSession,
          communityId,
          communitySkillAttachmentId,
        });
        if (!removed) return false;
        setCommunitySkillAttachments((prev) =>
          prev.filter((entry) => entry.id !== communitySkillAttachmentId),
        );
        return true;
      } catch (error) {
        setCommunitySkillMutationError(
          toErrorMessage(error, "Failed to detach skill."),
        );
        return false;
      } finally {
        setRemovingCommunitySkillAttachmentId(null);
      }
    },
    [],
  );

  return {
    communitySkillAttachments,
    ownedSkillPackages,
    isLoadingCommunitySkillAttachments,
    isLoadingOwnedSkillPackages,
    communitySkillAttachmentError,
    ownedSkillPackagesError,
    isCreatingSkill,
    communitySkillMutationError,
    updatingCommunitySkillAttachmentId,
    removingCommunitySkillAttachmentId,
    attachingSkillPackageId,
    communitySkillAttachmentsLoadedCommunityIdRef,
    ownedSkillPackagesLoadedRef,
    clearCommunitySkillAttachments,
    loadCommunitySkillAttachments,
    loadOwnedSkillPackages,
    createPersonalSkillAndAttach,
    attachSkillPackageToCommunity,
    updateCommunitySkillAttachment,
    detachCommunitySkill,
  };
}
