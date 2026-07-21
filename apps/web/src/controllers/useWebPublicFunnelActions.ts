import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  classifyPublicCommunityJoinError, getErrorMessage, joinPublicCommunityRpc, } from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/authResumeState";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";

import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import {
  cancelCloudMyJoinRequestBySlug,
  fetchCloudPublicCommunityMemoryOverview,
  fetchCloudPublicFunnelStats,
  recordCloudPublicFunnelVisit,
  resolveCloudPublicFunnel,
} from "../../../../shared/cloudPublicFunnelGateway";
import { preloadImageUrls } from "../../../../shared/preloadImageUrls";
import { applyShellVariantToPublicPath, readShellVariantFromPathname } from "../../../../shared/webAppRouteState";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { normalizeCommunitySlugIdentity } from "../../../../shared/communitySlug";
import type { AuthSession } from "../auth";
import type { CommunityBillingPeriod } from "../../../../shared/communityTypes";
import {
  isPublicCommunityAdmissionActionOwner,
  isPublicCommunityAdmissionActionSnapshotCurrent,
  isPublicCommunityLoadSnapshotCurrent,
  type PublicCommunityAdmissionActionKind,
  type PublicCommunityAdmissionActionOrigin,
  type PublicCommunityAdmissionActionSnapshot,
  type PublicCommunityAccessResolution,
  type PublicCommunityLoadSnapshot,
} from "../communityJoinPolicy";
import {
  executePublicCommunityCancelAction,
  executePublicCommunityJoinAction,
  type ReconciledAdmission,
} from "../publicCommunityAdmissionAction";

type UseWebPublicFunnelActionsArgs<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
    avatar_url?: string | null;
    banner_url?: string | null;
    online_faces?: Array<{
      avatar_url?: string | null;
      avatar_focus_x?: number | null;
      avatar_focus_y?: number | null;
      avatar_zoom?: number | null;
    } | null> | null;
    funnel?: {
      hero_media_kind?: unknown;
      hero_media_url?: string | null;
    } | null;
  },
  PublicPlanT extends { billing_period: CommunityBillingPeriod },
  CommunityAccessT extends CommunityAccessRow,
> = {
  getSession: () => AuthSession | null;
  getCurrentPublicCommunitySlug: () => string | null;
  getCurrentPublicFunnelSlug: () => string | null;
  getCurrentAuthSubject: () => string | null;
  session: AuthSession | null;
  ensureSession?: (session: AuthSession | null) => Promise<AuthSession | null>;
  requireSignIn: (intentInput: PendingAuthIntentInput) => void;
  loadCommunities: (session: AuthSession) => Promise<void>;
  openCommunityWorkspace: (opts: { communityId: string; communitySlug?: string | null }) => void;
  onJoinRequestSent?: (params: { communityId: string | null; communitySlug: string | null }) => void;

  setIsJoiningPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setIsCancellingPublicCommunityJoinRequest: Dispatch<SetStateAction<boolean>>;
  setPublicJoinError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunity: Dispatch<SetStateAction<PublicCommunityT | null>>;
  setPublicCommunityAccess: Dispatch<SetStateAction<CommunityAccessT | null>>;
  setPublicCommunityAccessResolution: Dispatch<SetStateAction<PublicCommunityAccessResolution>>;

  setIsLoadingPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setPublicCommunityError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunityPlans: Dispatch<SetStateAction<PublicPlanT[]>>;

  navigateToUrl: (url: string) => void;
};

type CommunityAccessRow = {
  community_id: string;
  relation?: "visitor" | "pending" | "member" | "moderator" | "admin" | "owner" | null;
  can_enter_community?: boolean;
  is_owner: boolean;
  is_blocked: boolean;
  join_request_status?: "pending" | "denied" | null;
  join_request_reapply_at?: string | null;
};

export function useWebPublicFunnelActions<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
    avatar_url?: string | null;
    banner_url?: string | null;
    online_faces?: Array<{
      avatar_url?: string | null;
      avatar_focus_x?: number | null;
      avatar_focus_y?: number | null;
      avatar_zoom?: number | null;
    } | null> | null;
    funnel?: {
      hero_media_kind?: unknown;
      hero_media_url?: string | null;
    } | null;
  },
  PublicPlanT extends { billing_period: CommunityBillingPeriod },
  CommunityAccessT extends CommunityAccessRow,
>(
  args: UseWebPublicFunnelActionsArgs<
    PublicCommunityT,
    PublicPlanT,
    CommunityAccessT
  >,
) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const publicCommunityLoadGenerationRef = useRef(0);
  const publicCommunityActionGenerationRef = useRef(0);
  const activePublicCommunityActionRef = useRef<PublicCommunityAdmissionActionSnapshot | null>(null);
  const renderActionAuthorityKey = `${String(args.getCurrentPublicFunnelSlug() ?? "").trim()}\u0000${String(
    args.getCurrentAuthSubject() ?? "",
  ).trim()}`;

  const actionSnapshotIsCurrent = useCallback(
    (snapshot: PublicCommunityAdmissionActionSnapshot): boolean =>
      isPublicCommunityAdmissionActionSnapshotCurrent({
        snapshot,
        current: {
          generation: publicCommunityActionGenerationRef.current,
          publicFunnelSlug: argsRef.current.getCurrentPublicFunnelSlug(),
          authSubject: argsRef.current.getCurrentAuthSubject(),
        },
      }),
    [],
  );

  useEffect(() => {
    const active = activePublicCommunityActionRef.current;
    if (active && actionSnapshotIsCurrent(active)) return;
    if (active) publicCommunityActionGenerationRef.current += 1;
    activePublicCommunityActionRef.current = null;
    argsRef.current.setIsJoiningPublicCommunity(false);
    argsRef.current.setIsCancellingPublicCommunityJoinRequest(false);
  }, [actionSnapshotIsCurrent, renderActionAuthorityKey]);

  const beginAdmissionAction = useCallback(
    (args: {
      kind: PublicCommunityAdmissionActionKind;
      origin: PublicCommunityAdmissionActionOrigin;
      communitySlug: string;
      authSubject: string;
    }): PublicCommunityAdmissionActionSnapshot | null => {
      const snapshot: PublicCommunityAdmissionActionSnapshot = {
        generation: ++publicCommunityActionGenerationRef.current,
        kind: args.kind,
        origin: args.origin,
        communitySlug: args.communitySlug,
        authSubject: args.authSubject,
      };
      if (!actionSnapshotIsCurrent(snapshot)) return null;
      activePublicCommunityActionRef.current = snapshot;
      const current = argsRef.current;
      current.setIsJoiningPublicCommunity(args.kind === "join");
      current.setIsCancellingPublicCommunityJoinRequest(args.kind === "cancel");
      current.setPublicJoinError(null);
      return snapshot;
    },
    [actionSnapshotIsCurrent],
  );

  const finishAdmissionAction = useCallback(
    (snapshot: PublicCommunityAdmissionActionSnapshot): void => {
      if (
        !isPublicCommunityAdmissionActionOwner({
          active: activePublicCommunityActionRef.current,
          snapshot,
        })
      ) return;
      activePublicCommunityActionRef.current = null;
      argsRef.current.setIsJoiningPublicCommunity(false);
      argsRef.current.setIsCancellingPublicCommunityJoinRequest(false);
    },
    [],
  );

  const setCurrentFunnelEntryPolicy = useCallback(
    (
      snapshot: PublicCommunityAdmissionActionSnapshot,
      entryPolicy: "approval" | "paid_subscription",
    ): void => {
      if (!actionSnapshotIsCurrent(snapshot)) return;
      const current = argsRef.current;
      if (current.getCurrentPublicFunnelSlug() !== snapshot.communitySlug) return;
      current.setPublicCommunity((previous) =>
        previous?.slug === snapshot.communitySlug
          ? ({ ...previous, entry_policy: entryPolicy } as PublicCommunityT)
          : previous,
      );
    },
    [actionSnapshotIsCurrent],
  );

  const navigateAuthResumeToFunnel = useCallback(
    (snapshot: PublicCommunityAdmissionActionSnapshot): void => {
      if (snapshot.origin !== "auth_resume" || !actionSnapshotIsCurrent(snapshot)) return;
      if (argsRef.current.getCurrentPublicFunnelSlug() === snapshot.communitySlug) return;
      const shellVariant = readShellVariantFromPathname(window.location.pathname || "/");
      const path = applyShellVariantToPublicPath(
        `/c/${encodeURIComponent(snapshot.communitySlug)}`,
        shellVariant,
      );
      argsRef.current.navigateToUrl(path);
    },
    [actionSnapshotIsCurrent],
  );

  const reconcileAdmissionBySlug = useCallback(
    async (
      snapshot: PublicCommunityAdmissionActionSnapshot,
      session: AuthSession,
    ): Promise<ReconciledAdmission<CommunityAccessT>> => {
      let access: CommunityAccessT | null;
      try {
        access = await fetchCloudMyCommunityAccessBySlug<AuthSession, CommunityAccessT>({
          session,
          communitySlug: snapshot.communitySlug,
        });
      } catch {
        if (!actionSnapshotIsCurrent(snapshot)) return { status: "stale", access: null };
        const current = argsRef.current;
        if (current.getCurrentPublicFunnelSlug() === snapshot.communitySlug) {
          current.setPublicCommunityAccess(null);
          current.setPublicCommunityAccessResolution({
            status: "unavailable",
            communitySlug: snapshot.communitySlug,
            authSubject: snapshot.authSubject,
          });
        }
        return { status: "unavailable", access: null };
      }
      if (!actionSnapshotIsCurrent(snapshot)) return { status: "stale", access: null };
      if (!access || typeof access.is_blocked !== "boolean") {
        const current = argsRef.current;
        if (current.getCurrentPublicFunnelSlug() === snapshot.communitySlug) {
          current.setPublicCommunityAccess(null);
          current.setPublicCommunityAccessResolution({
            status: "unavailable",
            communitySlug: snapshot.communitySlug,
            authSubject: snapshot.authSubject,
          });
        }
        return { status: "unavailable", access: null };
      }

      const current = argsRef.current;
      if (
        current.getCurrentPublicFunnelSlug() === snapshot.communitySlug &&
        current.getCurrentPublicCommunitySlug() === snapshot.communitySlug
      ) {
        current.setPublicCommunityAccess(access);
        current.setPublicCommunityAccessResolution({
          status: "ready",
          communitySlug: snapshot.communitySlug,
          authSubject: snapshot.authSubject,
        });
      }
      if (access.is_blocked) return { status: "blocked", access };
      if ((access.can_enter_community || access.is_owner) && access.community_id) {
        return { status: "entered", access };
      }
      if (access.join_request_status === "pending") return { status: "pending", access };
      if (access.join_request_status === "denied") return { status: "denied", access };
      return { status: "none", access };
    },
    [actionSnapshotIsCurrent],
  );

  const enterReconciledCommunity = useCallback(
    async (
      snapshot: PublicCommunityAdmissionActionSnapshot,
      session: AuthSession,
      communityId: string,
    ): Promise<void> => {
      if (!actionSnapshotIsCurrent(snapshot)) return;
      const current = argsRef.current;
      current.setPublicJoinError(null);
      current.openCommunityWorkspace({
        communityId,
        communitySlug: snapshot.communitySlug,
      });
      await current.loadCommunities(session);
    },
    [actionSnapshotIsCurrent],
  );

  const joinPublicCommunity = useCallback(
    async (opts: {
      communitySlug: string;
      origin: PublicCommunityAdmissionActionOrigin;
    }): Promise<void> => {
      const trimmedSlug = normalizeCommunitySlugIdentity(opts.communitySlug);
      if (!trimmedSlug) return;

      const current = argsRef.current;
      const rawSession = current.getSession();
      const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
      if (!session) {
        current.requireSignIn({
          reason: "join_public_community",
          payload: {
            community_slug: trimmedSlug,
          },
        });
        return;
      }
      const authSubject = String(resolveAuthSubject(session) ?? "").trim();
      if (!authSubject || authSubject !== String(current.getCurrentAuthSubject() ?? "").trim()) return;
      const snapshot = beginAdmissionAction({
        kind: "join",
        origin: opts.origin,
        communitySlug: trimmedSlug,
        authSubject,
      });
      if (!snapshot) return;
      try {
        await executePublicCommunityJoinAction<CommunityAccessT>({
          communitySlug: trimmedSlug,
          runJoin: () => joinPublicCommunityRpc({ session, communitySlug: trimmedSlug }),
          isCurrent: () => actionSnapshotIsCurrent(snapshot),
          reconcile: () => reconcileAdmissionBySlug(snapshot, session),
          enterCommunity: (communityId) =>
            enterReconciledCommunity(snapshot, session, communityId),
          setEntryPolicy: (entryPolicy) => setCurrentFunnelEntryPolicy(snapshot, entryPolicy),
          navigateAuthResumeToFunnel: () => navigateAuthResumeToFunnel(snapshot),
          setError: (message) => argsRef.current.setPublicJoinError(message),
          onJoinRequestSent: (params) => argsRef.current.onJoinRequestSent?.(params),
          getErrorMessage,
          classifyError: classifyPublicCommunityJoinError,
        });
      } finally {
        finishAdmissionAction(snapshot);
      }
    },
    [
      actionSnapshotIsCurrent,
      beginAdmissionAction,
      enterReconciledCommunity,
      finishAdmissionAction,
      navigateAuthResumeToFunnel,
      reconcileAdmissionBySlug,
      setCurrentFunnelEntryPolicy,
    ],
  );

  const cancelMyPendingJoinRequest = useCallback(
    async (communitySlug: string): Promise<void> => {
      const trimmedSlug = normalizeCommunitySlugIdentity(communitySlug);
      if (!trimmedSlug) return;
      const current = argsRef.current;
      const rawSession = current.getSession();
      const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
      if (!session) return;
      const authSubject = String(resolveAuthSubject(session) ?? "").trim();
      if (!authSubject || authSubject !== String(current.getCurrentAuthSubject() ?? "").trim()) return;
      const snapshot = beginAdmissionAction({
        kind: "cancel",
        origin: "funnel",
        communitySlug: trimmedSlug,
        authSubject,
      });
      if (!snapshot) return;
      try {
        await executePublicCommunityCancelAction<CommunityAccessT>({
          runCancel: () =>
            cancelCloudMyJoinRequestBySlug({
              session,
              communitySlug: trimmedSlug,
            }),
          isCurrent: () => actionSnapshotIsCurrent(snapshot),
          reconcile: () => reconcileAdmissionBySlug(snapshot, session),
          setError: (message) => argsRef.current.setPublicJoinError(message),
          getErrorMessage,
        });
      } finally {
        finishAdmissionAction(snapshot);
      }
    },
    [
      actionSnapshotIsCurrent,
      beginAdmissionAction,
      finishAdmissionAction,
      reconcileAdmissionBySlug,
    ],
  );

  const loadPublicCommunity = useCallback(
    async (
      slug: string,
      opts?: { recordVisit?: boolean; isPreviewMode?: boolean },
    ): Promise<void> => {
      const requestedSlug = normalizeCommunitySlugIdentity(slug);
      if (!requestedSlug) return;
      const routeSlug = String(argsRef.current.getCurrentPublicFunnelSlug() ?? "").trim();
      if (routeSlug !== requestedSlug) return;

      const generation = ++publicCommunityLoadGenerationRef.current;
      const authSubject = String(argsRef.current.getCurrentAuthSubject() ?? "").trim() || null;
      const hadSession = Boolean(argsRef.current.getSession());
      const isPreviewMode = opts?.isPreviewMode === true;
      const snapshot: PublicCommunityLoadSnapshot = {
        generation,
        communitySlug: requestedSlug,
        authSubject,
      };
      const snapshotIsCurrent = (): boolean =>
        isPublicCommunityLoadSnapshotCurrent({
          snapshot,
          current: {
            generation: publicCommunityLoadGenerationRef.current,
            communitySlug: String(argsRef.current.getCurrentPublicFunnelSlug() ?? "").trim(),
            authSubject: String(argsRef.current.getCurrentAuthSubject() ?? "").trim() || null,
          },
        });

      const current = argsRef.current;
      const currentSlug = current.getCurrentPublicCommunitySlug();
      const isSameSlugRefresh = currentSlug === requestedSlug;

      current.setIsLoadingPublicCommunity(true);
      current.setPublicCommunityError(null);
      current.setPublicJoinError(null);
      current.setPublicCommunityAccess(null);
      if (isPreviewMode || !hadSession) {
        current.setPublicCommunityAccessResolution({
          status: "not_required",
          communitySlug: null,
          authSubject: null,
        });
      } else if (!authSubject) {
        current.setPublicCommunityAccessResolution({
          status: "unavailable",
          communitySlug: requestedSlug,
          authSubject: null,
        });
      } else {
        current.setPublicCommunityAccessResolution({
          status: "verifying",
          communitySlug: requestedSlug,
          authSubject,
        });
      }
      if (!isSameSlugRefresh) {
        current.setPublicCommunity(null);
        current.setPublicCommunityPlans([]);
      }
      try {
        const payload = await resolveCloudPublicFunnel<AuthSession, PublicCommunityT, PublicPlanT>({
          communitySlug: requestedSlug,
        });
        if (!payload?.community?.slug) throw new Error("Community not found.");
        if (!snapshotIsCurrent()) return;

        const revealImageUrls = [
          payload.community.avatar_url ?? null,
          payload.community.banner_url ?? null,
          ...((payload.community.online_faces ?? []).map((face) => face?.avatar_url ?? null)),
          (payload.community.funnel?.hero_media_kind ?? null) === "image"
            ? (payload.community.funnel?.hero_media_url ?? null)
            : null,
        ];
        await preloadImageUrls(revealImageUrls, { maxUrls: 8, timeoutMs: 1500 });
        if (!snapshotIsCurrent()) return;

        const loadedCommunity = payload.community;
        const resolvedSlug = loadedCommunity.slug;
        /* Merge into the same community, never replace it: the memory graph and
           stats are folded in by the async fetches below, and a bare replace on
           any re-fire would drop them for a beat — that is the panel flicker.
           (Same additive pattern the stats/memory merges use.) */
        argsRef.current.setPublicCommunity((prev) =>
          prev && prev.slug === resolvedSlug
            ? ({
                ...prev,
                ...loadedCommunity,
                visibility: toCanonicalCommunityVisibility(loadedCommunity.visibility, "unlisted"),
              } as PublicCommunityT)
            : ({
                ...loadedCommunity,
                visibility: toCanonicalCommunityVisibility(loadedCommunity.visibility, "unlisted"),
              } as PublicCommunityT),
        );
        argsRef.current.setPublicCommunityPlans(payload.active_plan ? [payload.active_plan] : []);
        argsRef.current.setIsLoadingPublicCommunity(false);

        if (opts?.recordVisit !== false) {
          void recordCloudPublicFunnelVisit<AuthSession>({
            session: argsRef.current.getSession(),
            communitySlug: resolvedSlug,
          }).catch((error) => {
            console.warn("Failed to record public funnel visit:", error);
          });
        }

        void fetchCloudPublicFunnelStats<AuthSession, Record<string, unknown>>({
          communitySlug: resolvedSlug,
        })
          .then((statsPayload) => {
            if (!snapshotIsCurrent()) return;
            const stats = statsPayload?.community as Partial<PublicCommunityT> | undefined;
            if (!stats) return;
            argsRef.current.setPublicCommunity((prev) =>
              prev && prev.slug === resolvedSlug
                ? ({ ...prev, ...stats } as PublicCommunityT)
                : prev,
            );
          })
          .catch((error) => {
            console.warn("Failed to resolve public community stats:", error);
          });

        void fetchCloudPublicCommunityMemoryOverview<AuthSession, Record<string, unknown>>({
          communitySlug: resolvedSlug,
        })
          .then((overviewPayload) => {
            if (!snapshotIsCurrent()) return;
            if (!overviewPayload?.ok || !overviewPayload.overview) return;
            argsRef.current.setPublicCommunity((prev) =>
              prev && prev.slug === resolvedSlug
                ? ({ ...prev, memory_overview: overviewPayload.overview } as PublicCommunityT)
                : prev,
            );
          })
          .catch((error) => {
            console.warn("Failed to resolve public community memory overview:", error);
          });

        if (isPreviewMode || !hadSession) return;
        if (!authSubject) {
          if (!snapshotIsCurrent()) return;
          argsRef.current.setPublicCommunityError(
            "You are signed in, but Polynet could not verify your identity. Sign in again and retry.",
          );
          return;
        }

        void (async () => {
          try {
            const latest = argsRef.current;
            const rawSession = latest.getSession();
            const session = latest.ensureSession ? await latest.ensureSession(rawSession) : rawSession;
            if (!snapshotIsCurrent()) return;
            if (!session) throw new Error("auth_session_unavailable");
            if (resolveAuthSubject(session) !== authSubject) return;

            const access = await fetchCloudMyCommunityAccessBySlug<AuthSession, CommunityAccessT>({
              session,
              communitySlug: resolvedSlug,
            });
            if (!snapshotIsCurrent()) return;
            if (!access || typeof access.is_blocked !== "boolean") {
              throw new Error("community_access_contract_invalid");
            }
            argsRef.current.setPublicCommunityAccess(access);
            argsRef.current.setPublicCommunityAccessResolution({
              status: "ready",
              communitySlug: requestedSlug,
              authSubject,
            });
          } catch (error) {
            if (!snapshotIsCurrent()) return;
            argsRef.current.setPublicCommunityAccess(null);
            argsRef.current.setPublicCommunityAccessResolution({
              status: "unavailable",
              communitySlug: requestedSlug,
              authSubject,
            });
            argsRef.current.setPublicCommunityError(
              "You are signed in, but Polynet could not verify your community access. Refresh and try again.",
            );
            console.warn("Failed to verify signed-in community access:", error);
          }
        })();
      } catch (error) {
        if (!snapshotIsCurrent()) return;
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load community.";
        argsRef.current.setPublicCommunityError(message);
        argsRef.current.setIsLoadingPublicCommunity(false);
        if (!isPreviewMode && hadSession && authSubject) {
          argsRef.current.setPublicCommunityAccessResolution({
            status: "unavailable",
            communitySlug: requestedSlug,
            authSubject,
          });
        }
      }
    },
    [],
  );

  return {
    cancelMyPendingJoinRequest,
    joinPublicCommunity,
    loadPublicCommunity,
  };
}
