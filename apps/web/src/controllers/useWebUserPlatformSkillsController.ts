import { useCallback, useRef, useState } from "react";

import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import {
  createCloudUserPlatformSkill,
  deleteCloudUserPlatformSkill,
  listCloudUserPlatformSkills,
  updateCloudUserPlatformSkillPackage,
  updateCloudUserPlatformSkillInstall,
} from "../../../../shared/cloudUserPlatformSkillGateway";
import {
  resolveUsableSession,
  type EnsureSessionFn,
} from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebUserPlatformSkillsControllerArgs<SessionT extends SessionLike> = {
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebUserPlatformSkillsController<
  SessionT extends SessionLike,
>(args: UseWebUserPlatformSkillsControllerArgs<SessionT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [userPlatformSkills, setUserPlatformSkills] = useState<
    UserPlatformInstalledSkill[]
  >([]);
  const [isLoadingUserPlatformSkills, setIsLoadingUserPlatformSkills] =
    useState(false);
  const [userPlatformSkillError, setUserPlatformSkillError] = useState<
    string | null
  >(null);
  const [isCreatingUserPlatformSkill, setIsCreatingUserPlatformSkill] =
    useState(false);
  const [userPlatformSkillMutationError, setUserPlatformSkillMutationError] =
    useState<string | null>(null);
  const [updatingUserPlatformSkillInstallId, setUpdatingUserPlatformSkillInstallId] =
    useState<string | null>(null);
  const [removingUserPlatformSkillInstallId, setRemovingUserPlatformSkillInstallId] =
    useState<string | null>(null);
  const userPlatformSkillsLoadedUserIdRef = useRef<string | null>(null);

  const clearUserPlatformSkills = useCallback(() => {
    setUserPlatformSkills([]);
    setUserPlatformSkillError(null);
    setUserPlatformSkillMutationError(null);
    userPlatformSkillsLoadedUserIdRef.current = null;
  }, []);

  const loadUserPlatformSkills = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(
      session,
      current.ensureSession,
    );
    if (!usableSession) return;
    setIsLoadingUserPlatformSkills(true);
    setUserPlatformSkillError(null);
    try {
      const rows = await listCloudUserPlatformSkills({
        session: usableSession,
      });
      setUserPlatformSkills(rows);
      userPlatformSkillsLoadedUserIdRef.current = usableSession.user.id;
    } catch (error) {
      setUserPlatformSkillError(
        toErrorMessage(error, "Failed to load personal skills."),
      );
      userPlatformSkillsLoadedUserIdRef.current = usableSession.user.id;
    } finally {
      setIsLoadingUserPlatformSkills(false);
    }
  }, []);

  const createUserPlatformSkill = useCallback(
    async (input: CreateSkillPackageInput): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setIsCreatingUserPlatformSkill(true);
      setUserPlatformSkillMutationError(null);
      try {
        const created = await createCloudUserPlatformSkill({
          session: usableSession,
          input,
        });
        if (!created) return false;
        setUserPlatformSkills((prev) => {
          const next = prev.filter((entry) => entry.id !== created.id);
          next.unshift(created);
          return next;
        });
        userPlatformSkillsLoadedUserIdRef.current = usableSession.user.id;
        return true;
      } catch (error) {
        setUserPlatformSkillMutationError(
          toErrorMessage(error, "Failed to create personal skill."),
        );
        return false;
      } finally {
        setIsCreatingUserPlatformSkill(false);
      }
    },
    [],
  );

  const updateUserPlatformSkill = useCallback(
    async (
      userPlatformSkillInstallId: string,
      patch: { enabled?: boolean },
    ): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setUpdatingUserPlatformSkillInstallId(userPlatformSkillInstallId);
      setUserPlatformSkillMutationError(null);
      try {
        const updated = await updateCloudUserPlatformSkillInstall({
          session: usableSession,
          userPlatformSkillInstallId,
          enabled: patch.enabled,
        });
        if (!updated) return false;
        setUserPlatformSkills((prev) =>
          prev.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        return true;
      } catch (error) {
        setUserPlatformSkillMutationError(
          toErrorMessage(error, "Failed to update personal skill."),
        );
        return false;
      } finally {
        setUpdatingUserPlatformSkillInstallId(null);
      }
    },
    [],
  );

  const saveUserPlatformSkill = useCallback(
    async (
      userPlatformSkillInstallId: string,
      input: CreateSkillPackageInput,
    ): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setUpdatingUserPlatformSkillInstallId(userPlatformSkillInstallId);
      setUserPlatformSkillMutationError(null);
      try {
        const updated = await updateCloudUserPlatformSkillPackage({
          session: usableSession,
          userPlatformSkillInstallId,
          name: input.name,
          description: input.description,
          instructionsMd: input.instructions_md,
        });
        if (!updated) return false;
        setUserPlatformSkills((prev) =>
          prev.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        return true;
      } catch (error) {
        setUserPlatformSkillMutationError(
          toErrorMessage(error, "Failed to save personal skill."),
        );
        return false;
      } finally {
        setUpdatingUserPlatformSkillInstallId(null);
      }
    },
    [],
  );

  const deleteUserPlatformSkill = useCallback(
    async (userPlatformSkillInstallId: string): Promise<boolean> => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(
        current.session,
        current.ensureSession,
      );
      if (!usableSession) return false;
      setRemovingUserPlatformSkillInstallId(userPlatformSkillInstallId);
      setUserPlatformSkillMutationError(null);
      try {
        const removed = await deleteCloudUserPlatformSkill({
          session: usableSession,
          userPlatformSkillInstallId,
        });
        if (!removed) return false;
        setUserPlatformSkills((prev) =>
          prev.filter((entry) => entry.id !== userPlatformSkillInstallId),
        );
        return true;
      } catch (error) {
        setUserPlatformSkillMutationError(
          toErrorMessage(error, "Failed to delete personal skill."),
        );
        return false;
      } finally {
        setRemovingUserPlatformSkillInstallId(null);
      }
    },
    [],
  );

  return {
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    isCreatingUserPlatformSkill,
    userPlatformSkillMutationError,
    updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId,
    userPlatformSkillsLoadedUserIdRef,
    clearUserPlatformSkills,
    loadUserPlatformSkills,
    createUserPlatformSkill,
    saveUserPlatformSkill,
    updateUserPlatformSkill,
    deleteUserPlatformSkill,
  };
}
