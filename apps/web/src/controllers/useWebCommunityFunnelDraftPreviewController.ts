import { useEffect, useState } from "react";

import {
  normalizeCommunityFunnelManagerConfig,
} from "../../../../shared/communityFunnel";
import { fetchCloudCommunityFunnelDraftPreview } from "../../../../shared/cloudCommunityFunnelGateway";
import type {
  CommunityFunnelDocumentV1,
  CommunityFunnelManagerConfig,
} from "../../../../shared/communityTypes";
import type { AuthSession } from "../auth";

type EnsureSession = (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;

export function useWebCommunityFunnelDraftPreviewController(params: {
  enabled: boolean;
  communitySlug: string | null;
  session: AuthSession | null;
  ensureSession: EnsureSession;
}) {
  const [document, setDocument] = useState<CommunityFunnelDocumentV1 | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const slug = params.communitySlug?.trim() ?? "";
    if (!params.enabled || !slug) {
      setDocument(null);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const session = await params.ensureSession(params.session, "funnel_draft_preview");
        if (!session) throw new Error("Sign in as a community manager to preview this funnel.");
        const result = await fetchCloudCommunityFunnelDraftPreview<AuthSession, CommunityFunnelManagerConfig>({
          session,
          communitySlug: slug,
        });
        if (cancelled) return;
        setDocument(normalizeCommunityFunnelManagerConfig(result).draft_document_v1);
      } catch (cause) {
        if (cancelled) return;
        setDocument(null);
        setError(cause instanceof Error ? cause.message : "Failed to load the funnel draft.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.communitySlug, params.enabled, params.ensureSession, params.session]);

  return { document, isLoading, error };
}
