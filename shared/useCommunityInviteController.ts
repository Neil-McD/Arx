import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { generateInviteCode } from "./communityInviteLinks";

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
  supabaseSession: SessionT | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
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
  missingSupabaseUrlMessage?: string;
};

export function useCommunityInviteController<
  SessionT extends SessionLike,
  InviteT extends InviteLike,
>(args: UseCommunityInviteControllerArgs<SessionT, InviteT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityInvites = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;

    current.setIsLoadingCommunityInvites(true);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_invites?select=id,community_id,code,max_uses,expires_at,revoked_at,created_by,created_at&community_id=eq.${communityId}&order=created_at.desc`,
        {},
        session,
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load invites.");
      }
      const rows = (await response.json()) as InviteT[];
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
    if (!current.supabaseSession || !current.activeCommunityId) return;

    current.setInviteCreateError(null);
    current.setIsCreatingInvite(true);
    const url = current.getSupabaseUrl();
    if (!url) {
      current.setInviteCreateError(current.missingSupabaseUrlMessage ?? "Missing Supabase URL.");
      current.setIsCreatingInvite(false);
      return;
    }

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
        const response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/community_invites`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              community_id: current.activeCommunityId,
              code,
              max_uses: maxUses,
              expires_at: expiresAt,
              created_by: current.supabaseSession.user.id,
            }),
          },
          current.supabaseSession,
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to create invite.");
        }

        const created = (await response.json()) as InviteT[];
        const invite = created[0] ?? null;
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
    if (!current.supabaseSession) return;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_invites?id=eq.${inviteId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ revoked_at: new Date().toISOString() }),
        },
        current.supabaseSession,
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to revoke invite.");
      }
      const updated = (await response.json()) as InviteT[];
      const row = updated[0];
      if (row) {
        current.setCommunityInvites((prev) => prev.map((invite) => (invite.id === inviteId ? row : invite)));
      }
    } catch (error) {
      console.warn("Failed to revoke invite:", error);
    }
  }, []);

  const handleDeleteInvite = useCallback(async (inviteId: string) => {
    const current = argsRef.current;
    if (!current.supabaseSession) return;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_invites?id=eq.${inviteId}`,
        { method: "DELETE" },
        current.supabaseSession,
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete invite.");
      }
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
