import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { generateInviteCode } from "./communityInviteLinks";

import {
  createCloudCommunityInvite,
  deleteCloudCommunityInvite,
  listCloudCommunityInvites,
  revokeCloudCommunityInvite,
} from "./cloudCommunityInviteGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type InviteLike = {
  id: string;
  community_id: string;
  code: string;
  max_uses: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

type UseCommunityInviteControllerArgs<
  SessionT extends SessionLike,
  InviteT extends InviteLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  inviteMaxUsesPreset: string;
  inviteMaxUsesCustom: string;
  inviteExpiryPreset: string;
  inviteExpiryCustom: string;
  setCommunityInvites: Dispatch<SetStateAction<InviteT[]>>;
  setIsLoadingCommunityInvites: Dispatch<SetStateAction<boolean>>;
  setInviteCreateError: Dispatch<SetStateAction<string | null>>;
  setIsCreatingInvite: Dispatch<SetStateAction<boolean>>;
  setInviteMaxUsesPreset: Dispatch<SetStateAction<string>>;
  setInviteMaxUsesCustom: Dispatch<SetStateAction<string>>;
  setInviteExpiryPreset: Dispatch<SetStateAction<string>>;
  setInviteExpiryCustom: Dispatch<SetStateAction<string>>;
  onInviteCreated?: (invite: InviteT) => void | Promise<void>;
};

export function useCommunityInviteController<
  SessionT extends SessionLike,
  InviteT extends InviteLike,
>(args: UseCommunityInviteControllerArgs<SessionT, InviteT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityInvites = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityInvites(true);
    try {
      const rows = await listCloudCommunityInvites<SessionT, InviteT>({
        session,
        communityId,
      });
      current.setCommunityInvites(rows);
    } catch (error) {
      console.warn("Failed to load community invites:", error);
      current.setCommunityInvites([]);
    } finally {
      current.setIsLoadingCommunityInvites(false);
    }
  }, []);

  const handleCreateInvite = useCallback(async () => {
    const current = argsRef.current;
    const session = current.session;
    if (!session || !current.activeCommunityId) return;

    current.setInviteCreateError(null);
    current.setIsCreatingInvite(true);
    let maxUses: number | null = null;
    if (current.inviteMaxUsesPreset === "custom") {
      const raw = current.inviteMaxUsesCustom.trim();
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        current.setInviteCreateError("Custom max uses must be a positive integer.");
        current.setIsCreatingInvite(false);
        return;
      }
      maxUses = parsed;
    } else if (current.inviteMaxUsesPreset !== "unlimited") {
      maxUses = Number(current.inviteMaxUsesPreset);
    }

    let expiresAt: string | null = null;
    if (current.inviteExpiryPreset === "custom") {
      const raw = current.inviteExpiryCustom.trim();
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        current.setInviteCreateError("Custom expiry must be a positive integer (days).");
        current.setIsCreatingInvite(false);
        return;
      }
      expiresAt = new Date(Date.now() + parsed * 86400000).toISOString();
    } else if (current.inviteExpiryPreset !== "never") {
      const expiryMillisMap: Record<string, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 86400000,
        "30d": 30 * 86400000,
        "90d": 90 * 86400000,
      };
      const ms = expiryMillisMap[current.inviteExpiryPreset] ?? 0;
      if (ms > 0) expiresAt = new Date(Date.now() + ms).toISOString();
    }

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateInviteCode(10);
      try {
        const invite = await createCloudCommunityInvite<SessionT, InviteT>({
          session,
          communityId: current.activeCommunityId,
          code,
          maxUses,
          expiresAt,
          createdBy: session.user.id,
        });
        if (invite) {
          current.setCommunityInvites((prev) => [invite, ...prev]);
          current.setInviteMaxUsesPreset("unlimited");
          current.setInviteMaxUsesCustom("");
          current.setInviteExpiryPreset("7d");
          current.setInviteExpiryCustom("");
          try {
            await current.onInviteCreated?.(invite);
          } catch {
            // ignore copy/share helper failures
          }
        }
        current.setIsCreatingInvite(false);
        return;
      } catch (error) {
        lastError = typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create invite.";
      }
    }

    current.setInviteCreateError(lastError ?? "Failed to create invite.");
    current.setIsCreatingInvite(false);
  }, []);

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    const current = argsRef.current;
    const session = current.session;
    if (!session) return;
    try {
      const row = await revokeCloudCommunityInvite<SessionT, InviteT>({
        session,
        inviteId,
      });
      if (row) {
        current.setCommunityInvites((prev) => prev.map((invite) => (invite.id === inviteId ? row : invite)));
      }
    } catch (error) {
      console.warn("Failed to revoke invite:", error);
    }
  }, []);

  const handleDeleteInvite = useCallback(async (inviteId: string) => {
    const current = argsRef.current;
    const session = current.session;
    if (!session) return;
    try {
      await deleteCloudCommunityInvite<SessionT>({
        session,
        inviteId,
      });
      current.setCommunityInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    } catch (error) {
      console.warn("Failed to delete invite:", error);
    }
  }, []);

  return {
    loadCommunityInvites,
    handleCreateInvite,
    handleRevokeInvite,
    handleDeleteInvite,
  };
}
