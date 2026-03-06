import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  acceptCommunityInviteRpc,
  classifyInviteAcceptError,
  getErrorMessage,
  type CloudSessionLike,
} from "./pay_first";

type PendingInviteLike = {
  invite_key: string;
  status: string;
  join_intent_at: number | null;
};

type JoinedCommunity = {
  id: string;
  slug: string;
  name: string;
};

type PendingInviteShellClient<PendingInviteT extends PendingInviteLike> = {
  listPendingInvites: () => Promise<PendingInviteT[]>;
  upsertPendingInvite: (args: { invite_key: string; source: "url" | "manual" | string }) => Promise<void>;
  dismissPendingInvite: (invite_key: string) => Promise<void>;
  requestJoinPendingInvite: (invite_key: string) => Promise<void>;
  markPendingInviteJoined: (args: {
    invite_key: string;
    community_id: string;
    community_name: string;
  }) => Promise<void>;
  markPendingInviteExpired: (invite_key: string) => Promise<void>;
};

type UsePendingInviteJoinControllerArgs<
  SessionT extends CloudSessionLike,
  PendingInviteT extends PendingInviteLike,
> = {
  shellClient: PendingInviteShellClient<PendingInviteT>;
  session: SessionT | null;
  pendingInvites: PendingInviteT[];
  activeInviteGateKey: string | null;
  autoJoinInvitesAttemptedRef: MutableRefObject<Set<string>>;
  normalizeInviteCode: (inviteKey: string) => string;
  loadCommunities: (session: SessionT) => Promise<void>;
  handleSignIn: () => Promise<void>;
  onJoinSuccess: (community: JoinedCommunity) => void;
  setPendingInvites: Dispatch<SetStateAction<PendingInviteT[]>>;
  setInviteJoinError: Dispatch<SetStateAction<string | null>>;
  setIsJoiningInvite: Dispatch<SetStateAction<boolean>>;
  setActiveInviteGateKey: Dispatch<SetStateAction<string | null>>;
  inviteExpiredMessage?: string;
  joinFailureMessage?: string;
};

export function usePendingInviteJoinController<
  SessionT extends CloudSessionLike,
  PendingInviteT extends PendingInviteLike,
>(args: UsePendingInviteJoinControllerArgs<SessionT, PendingInviteT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadPendingInvites = useCallback(async () => {
    const current = argsRef.current;
    try {
      const invites = await current.shellClient.listPendingInvites();
      current.setPendingInvites(invites);
    } catch {
      // Non-fatal; keep any in-memory state.
    }
  }, []);

  const consumeInviteQueryParam = useCallback(async () => {
    const current = argsRef.current;
    const params = new URLSearchParams(window.location.search);
    const inviteKey = params.get("invite") ?? params.get("join");
    if (!inviteKey) return;

    const normalized = current.normalizeInviteCode(inviteKey);
    try {
      await current.shellClient.upsertPendingInvite({ invite_key: normalized, source: "url" });
    } catch {
      // ignore
    }

    await loadPendingInvites();

    params.delete("invite");
    params.delete("join");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    window.history.replaceState({}, document.title, nextUrl);
  }, [loadPendingInvites]);

  const joinCommunityForInviteKey = useCallback(async (
    inviteKey: string,
    session: SessionT,
  ): Promise<JoinedCommunity> => {
    const current = argsRef.current;
    const key = current.normalizeInviteCode(inviteKey);
    if (!key) throw new Error("Invite code is required.");

    const joined = await acceptCommunityInviteRpc({
      session,
      inviteCode: key,
    });
    return { id: joined.community_id, slug: joined.community_slug, name: joined.community_name };
  }, []);

  const handleDismissInvite = useCallback(async (inviteKey: string) => {
    const current = argsRef.current;
    current.setInviteJoinError(null);
    try {
      await current.shellClient.dismissPendingInvite(inviteKey);
      await loadPendingInvites();
    } catch {
      // ignore
    }
  }, [loadPendingInvites]);

  const handleJoinInvite = useCallback(async (inviteKey: string) => {
    const current = argsRef.current;
    const cleaned = current.normalizeInviteCode(inviteKey);
    if (!cleaned) {
      current.setInviteJoinError("Invite code is required.");
      return;
    }
    current.setInviteJoinError(null);

    if (!current.session) {
      try {
        await current.shellClient.requestJoinPendingInvite(cleaned);
        await loadPendingInvites();
      } catch {
        // ignore
      }
      await current.handleSignIn();
      return;
    }

    current.setIsJoiningInvite(true);
    try {
      await current.shellClient.upsertPendingInvite({ invite_key: cleaned, source: "manual" });
      await loadPendingInvites();

      const joined = await joinCommunityForInviteKey(cleaned, current.session);
      await current.shellClient.markPendingInviteJoined({
        invite_key: cleaned,
        community_id: joined.id,
        community_name: joined.name,
      });
      await loadPendingInvites();

      await current.loadCommunities(current.session);
      current.onJoinSuccess(joined);
    } catch (error) {
      const kind = classifyInviteAcceptError(error);
      if (kind === "invite_expired") {
        try {
          await current.shellClient.markPendingInviteExpired(cleaned);
          await loadPendingInvites();
        } catch {
          // ignore
        }
      }
      const message = getErrorMessage(error, current.joinFailureMessage ?? "Failed to join community.");
      current.setInviteJoinError(
        kind === "invite_expired"
          ? (current.inviteExpiredMessage ?? "This invite has expired. Ask the community founder for a new invite link.")
          : message,
      );
    } finally {
      current.setIsJoiningInvite(false);
    }
  }, [joinCommunityForInviteKey, loadPendingInvites]);

  const handleInviteGateJoin = useCallback(async () => {
    const current = argsRef.current;
    if (!current.activeInviteGateKey) return;
    const key = current.activeInviteGateKey;
    current.setActiveInviteGateKey(null);
    await handleJoinInvite(key);
  }, [handleJoinInvite]);

  const handleInviteGateDismiss = useCallback(async () => {
    const current = argsRef.current;
    if (!current.activeInviteGateKey) return;
    const key = current.activeInviteGateKey;
    current.setActiveInviteGateKey(null);
    await handleDismissInvite(key);
  }, [handleDismissInvite]);

  const maybeAutoJoinPendingInvites = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    let invites: PendingInviteT[] = [];
    try {
      invites = await current.shellClient.listPendingInvites();
      current.setPendingInvites(invites);
    } catch {
      invites = current.pendingInvites;
    }

    const candidates = invites
      .filter((invite) => invite.status === "pending" && Boolean(invite.join_intent_at))
      .sort((a, b) => (a.join_intent_at ?? 0) - (b.join_intent_at ?? 0));

    const next = candidates.find((invite) => !current.autoJoinInvitesAttemptedRef.current.has(invite.invite_key));
    if (!next) return;

    current.autoJoinInvitesAttemptedRef.current.add(next.invite_key);
    try {
      const joined = await joinCommunityForInviteKey(next.invite_key, session);
      await current.shellClient.markPendingInviteJoined({
        invite_key: next.invite_key,
        community_id: joined.id,
        community_name: joined.name,
      });
      await loadPendingInvites();
      await current.loadCommunities(session);
      current.onJoinSuccess(joined);
    } catch (error) {
      const kind = classifyInviteAcceptError(error);
      if (kind === "invite_expired") {
        try {
          await current.shellClient.markPendingInviteExpired(next.invite_key);
          await loadPendingInvites();
        } catch {
          // ignore
        }
      }
      const message = getErrorMessage(error, current.joinFailureMessage ?? "Failed to join community.");
      current.setInviteJoinError(
        kind === "invite_expired"
          ? (current.inviteExpiredMessage ?? "This invite has expired. Ask the community founder for a new invite link.")
          : message,
      );
    }
  }, [joinCommunityForInviteKey, loadPendingInvites]);

  return {
    loadPendingInvites,
    consumeInviteQueryParam,
    handleDismissInvite,
    handleJoinInvite,
    handleInviteGateJoin,
    handleInviteGateDismiss,
    maybeAutoJoinPendingInvites,
  };
}
