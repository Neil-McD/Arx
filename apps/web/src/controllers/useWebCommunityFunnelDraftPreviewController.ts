import { useCallback, useEffect, useState } from "react";

import {
  normalizeCommunityFunnelManagerConfig,
  normalizeCommunityFunnelSlot,
} from "../../../../shared/communityFunnel";
import { fetchCloudCommunityFunnelDraftPreview } from "../../../../shared/cloudCommunityFunnelGateway";
import type {
  CommunityFunnelContentV2,
  CommunityFunnelManagerConfig,
  CommunityFunnelSlot,
} from "../../../../shared/communityTypes";
import type { WebRouteScopedAccessState } from "../../../../shared/webRouteAccess";
import type { AuthSession } from "../auth";

type EnsureSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

export function classifyCommunityFunnelDraftPreviewFailure(
  cause: unknown,
): "denied" | "session" | "retryable" {
  const message = String(
    cause instanceof Error ? cause.message : cause,
  ).toLowerCase();
  if (
    message.includes("community_forbidden") ||
    message.includes("community_not_found") ||
    message.includes("community_archived")
  ) return "denied";
  if (
    message.includes("sign in as a community manager") ||
    message.includes("session expired") ||
    message.includes("auth_session") ||
    message.includes("unauthenticated")
  ) return "session";
  return "retryable";
}

export function formatCommunityFunnelDraftPreviewFailure(
  cause: unknown,
): string {
  const message = String(
    cause instanceof Error ? cause.message : cause,
  ).toLowerCase();
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout")
  ) {
    return "The draft preview could not connect. Try again.";
  }
  if (
    message.includes("sign in as a community manager") ||
    message.includes("session expired") ||
    message.includes("auth_session") ||
    message.includes("unauthenticated")
  ) {
    return "Your session could not be verified. Try again.";
  }
  return "The draft preview could not be opened. Try again.";
}

export function useWebCommunityFunnelDraftPreviewController(params: {
  enabled: boolean;
  communitySlug: string | null;
  slot: CommunityFunnelSlot;
  session: AuthSession | null;
  ensureSession: EnsureSession;
}) {
  const [document, setDocument] = useState<CommunityFunnelContentV2 | null>(null);
  const [vslUrl, setVslUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessState, setAccessState] =
    useState<WebRouteScopedAccessState>("not_applicable");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setRequestVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const slug = params.communitySlug?.trim() ?? "";
    if (!params.enabled || !slug) {
      setDocument(null);
      setVslUrl(null);
      setError(null);
      setIsLoading(false);
      setAccessState("not_applicable");
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    setAccessState("resolving");
    void (async () => {
      try {
        let session = await params.ensureSession(
          params.session,
          "funnel_draft_preview",
        );
        if (!session && params.session) {
          session = await params.ensureSession(
            params.session,
            "funnel_draft_preview_retry",
            { forceRefresh: true },
          );
        }
        if (!session) {
          throw new Error(
            "Sign in as a community manager to preview this funnel.",
          );
        }
        let result: CommunityFunnelManagerConfig | null = null;
        try {
          result = await fetchCloudCommunityFunnelDraftPreview<
              AuthSession,
              CommunityFunnelManagerConfig
            >({
              session,
              communitySlug: slug,
            });
        } catch (cause) {
          if (classifyCommunityFunnelDraftPreviewFailure(cause) !== "session") {
            throw cause;
          }
          const refreshed = await params.ensureSession(
            session,
            "funnel_draft_preview_query_retry",
            { forceRefresh: true },
          );
          if (!refreshed) throw cause;
          session = refreshed;
          result = await fetchCloudCommunityFunnelDraftPreview<
            AuthSession,
            CommunityFunnelManagerConfig
          >({
            session,
            communitySlug: slug,
          });
        }
        if (!result) throw new Error("community_funnel_preview_unavailable");
        if (cancelled) return;
        const config = normalizeCommunityFunnelManagerConfig(result);
        const slot = normalizeCommunityFunnelSlot(params.slot);
        const variant = slot === "default" ? null : config.custom_funnels[slot];
        setDocument(variant?.draft_content_v2 ?? null);
        setVslUrl(variant?.draft_vsl_url ?? null);
        setAccessState("allowed");
      } catch (cause) {
        if (cancelled) return;
        setDocument(null);
        setVslUrl(null);
        const failureKind = classifyCommunityFunnelDraftPreviewFailure(cause);
        if (failureKind === "denied") {
          setAccessState("denied");
          setError(null);
        } else {
          setAccessState("resolving");
          setError(formatCommunityFunnelDraftPreviewFailure(cause));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    params.communitySlug,
    params.enabled,
    params.ensureSession,
    params.session,
    params.slot,
    requestVersion,
  ]);

  return { document, vslUrl, isLoading, error, accessState, retry };
}
