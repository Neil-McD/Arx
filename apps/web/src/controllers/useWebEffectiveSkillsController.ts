import { useCallback, useRef, useState } from "react";

import {
  listCloudEffectiveSkills,
} from "../../../../shared/cloudEffectiveSkillGateway";
import type { EffectiveSkill } from "../../../../shared/effectiveSkills";
import {
  resolveUsableSession,
  type EnsureSessionFn,
} from "../../../../shared/ensureUsableSession";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseWebEffectiveSkillsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useWebEffectiveSkillsController<SessionT extends SessionLike>(
  args: UseWebEffectiveSkillsControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [effectiveSkills, setEffectiveSkills] = useState<EffectiveSkill[]>([]);
  const [isLoadingEffectiveSkills, setIsLoadingEffectiveSkills] = useState(false);
  const [effectiveSkillsError, setEffectiveSkillsError] = useState<string | null>(
    null,
  );
  const effectiveSkillsLoadedKeyRef = useRef<string | null>(null);
  const effectiveSkillsLoadRequestIdRef = useRef(0);

  const clearEffectiveSkills = useCallback(() => {
    effectiveSkillsLoadRequestIdRef.current += 1;
    setEffectiveSkills([]);
    setIsLoadingEffectiveSkills(false);
    setEffectiveSkillsError(null);
    effectiveSkillsLoadedKeyRef.current = null;
  }, []);

  const loadEffectiveSkills = useCallback(async (session: SessionT) => {
    const requestId = effectiveSkillsLoadRequestIdRef.current + 1;
    effectiveSkillsLoadRequestIdRef.current = requestId;
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(
      session,
      current.ensureSession,
    );
    if (!usableSession) {
      if (effectiveSkillsLoadRequestIdRef.current === requestId) {
        setIsLoadingEffectiveSkills(false);
      }
      return;
    }
    const loadedKey = `${usableSession.user.id}:${
      current.activeCommunityId ?? "personal"
    }`;
    const isCurrentRequest = () => {
      if (effectiveSkillsLoadRequestIdRef.current !== requestId) return false;
      const latest = argsRef.current;
      if (latest.session?.user.id !== usableSession.user.id) return false;
      const latestKey = `${usableSession.user.id}:${
        latest.activeCommunityId ?? "personal"
      }`;
      return latestKey === loadedKey;
    };

    setIsLoadingEffectiveSkills(true);
    setEffectiveSkillsError(null);
    try {
      const rows = await listCloudEffectiveSkills({
        session: usableSession,
        communityId: current.activeCommunityId,
      });
      if (!isCurrentRequest()) return;
      setEffectiveSkills(rows);
      effectiveSkillsLoadedKeyRef.current = loadedKey;
    } catch (error) {
      if (!isCurrentRequest()) return;
      setEffectiveSkillsError(
        toErrorMessage(error, "Failed to load harness skills."),
      );
      effectiveSkillsLoadedKeyRef.current = loadedKey;
    } finally {
      if (effectiveSkillsLoadRequestIdRef.current === requestId) {
        setIsLoadingEffectiveSkills(false);
      }
    }
  }, []);

  return {
    effectiveSkills,
    isLoadingEffectiveSkills,
    effectiveSkillsError,
    effectiveSkillsLoadedKeyRef,
    clearEffectiveSkills,
    loadEffectiveSkills,
  };
}
