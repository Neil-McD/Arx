import { useCallback, useEffect, useState } from "react";

import {
  normalizeCommunityFunnelManagerConfig,
} from "../../../../shared/communityFunnel";
import { fetchCloudCommunityFunnelDraftPreview } from "../../../../shared/cloudCommunityFunnelGateway";
import type {
  CommunityFunnelContentV2,
  CommunityFunnelManagerConfig,
} from "../../../../shared/communityTypes";
import type { WebRouteScopedAccessState } from "../../../../shared/webRouteAccess";
import type { AuthSession } from "../auth";

type EnsureSession = (
  session?: AuthSession | null,
  source?: string,
) => Promise<AuthSession | null>;

export function classifyCommunityFunnelDraftPreviewFailure(
  cause: unknown,
): "denied" | "retryable" {
  const message = String(
    cause instanceof Error ? cause.message : cause,
  ).toLowerCase();
  return (
    message.includes("community_forbidden") ||
    message.includes("community_not_found") ||
    message.includes("community_archived")
  )
    ? "denied"
    : "retryable";
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
  return "The draft preview could not be opened. Try again.";
}

export function useWebCommunityFunnelDraftPreviewController(params: {
  enabled: boolean;
  communitySlug: string | null;
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
        const session = await params.ensureSession(
          params.session,
          "funnel_draft_preview",
        );
        if (!session) {
          throw new Error(
            "Sign in as a community manager to preview this funnel.",
          );
        }
        const result =
          await fetchCloudCommunityFunnelDraftPreview<
            AuthSession,
            CommunityFunnelManagerConfig
          >({
            session,
            communitySlug: slug,
          });
        if (!result) throw new Error("community_funnel_preview_unavailable");
        if (cancelled) return;
        const config = normalizeCommunityFunnelManagerConfig(result);
        setDocument(config.draft_content_v2);
        setVslUrl(config.draft_vsl_url);
        setAccessState("allowed");
      } catch (cause) {
        if (cancelled) return;
        setDocument(null);
        setVslUrl(null);
        if (classifyCommunityFunnelDraftPreviewFailure(cause) === "denied") {
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
    requestVersion,
  ]);

  return { document, vslUrl, isLoading, error, accessState, retry };
}
