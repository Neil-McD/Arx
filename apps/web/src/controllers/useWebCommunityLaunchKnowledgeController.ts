import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  applyCloudCommunityWikiArchitectProposal,
  beginCloudCommunityGoogleDriveSourceOAuth,
  beginCloudCommunityGitHubSourceOAuth,
  crawlCloudCommunitySourceRoot,
  deleteCloudCommunityResource,
  disconnectCloudCommunityGitHubSourceConnection,
  disconnectCloudCommunityGoogleDriveSourceConnection,
  draftCloudCommunityResourceContentFromSources,
  getCloudCommunitySourceCrawlJob,
  importCloudCommunityGitHubSourceFiles,
  importCloudCommunityGoogleDriveSourceFiles,
  ingestCloudCommunitySources,
  listCloudCommunityGitHubSourceFiles,
  listCloudCommunityGitHubSourceRepositories,
  listCloudCommunityGoogleDriveSourceFiles,
  listCloudCommunityLaunchKnowledgeSources,
  loadCloudCommunityGitHubSourceConnection,
  loadCloudCommunityGoogleDriveSourceConnection,
  runCloudCommunityWikiArchitectProposal,
  saveCloudCommunityResource,
  uploadCloudCommunityResourceSourceFile,
  type CloudCommunityLaunchKnowledgeSource,
  type CloudCommunitySourceCrawlJob,
} from "../../../../shared/cloudCommunityAdminGateway";
import type {
  CommunityLaunchGitHubFileListResult,
  CommunityLaunchGitHubImportResult,
  CommunityLaunchGitHubRepositoryListResult,
  CommunityLaunchGoogleDriveFileListRequest,
  CommunityLaunchGoogleDriveFileListResult,
  CommunityLaunchGoogleDriveImportResult,
  CommunityLaunchKnowledgeContentDraftResult,
  CommunityLaunchKnowledgeOAuthRedirectRequest,
  CommunityLaunchKnowledgePlanApplyResult,
  CommunityLaunchKnowledgePlanResult,
  CommunityLaunchKnowledgeSourceIngestionResult,
  WebCommunityLaunchKnowledgeModel,
  WebCommunityLaunchKnowledgeSourceGroups,
} from "../components/webCommunityLaunchKnowledgeModel";
import { buildCommunityLaunchKnowledgeSourceOAuthReturnToPath } from "../communityLaunchKnowledgeSourceOAuth";

const COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_ROOTS = 5;
const COMMUNITY_LAUNCH_SOURCE_CRAWL_POLL_INTERVAL_MS = 1_000;
const COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_POLLS = 45;

const EMPTY_SOURCE_GROUPS: WebCommunityLaunchKnowledgeSourceGroups = {
  links: [],
  files: [],
  googleDrive: [],
  github: [],
};

type ActiveCommunityLaunchKnowledgeTarget = {
  id: string;
  slug: string;
};

type CommunityLaunchKnowledgeOperationContext<TSession> = {
  session: TSession;
  sessionKey: string;
  communityId: string;
  communitySlug: string;
};

type UseWebCommunityLaunchKnowledgeControllerParams<TSession> = {
  session: TSession | null;
  sessionKey: string | null;
  activeCommunity: ActiveCommunityLaunchKnowledgeTarget | null;
  canManageCommunitySettings: boolean;
  loadCommunityResources: (
    communityId: string,
    session: TSession,
  ) => Promise<unknown> | unknown;
  refreshLaunchSetupStatus: () => Promise<unknown> | unknown;
  reloadKnowledgeIntegrations: () => void;
  onAuthorizeSourceIntegration: (
    request: CommunityLaunchKnowledgeOAuthRedirectRequest,
  ) => void;
};

type LatestCommunityLaunchKnowledgeContext<TSession> = {
  session: TSession | null;
  sessionKey: string | null;
  communityId: string | null;
  communitySlug: string | null;
  canManageCommunitySettings: boolean;
};

export function partitionCommunityLaunchKnowledgeSources(
  sources: CloudCommunityLaunchKnowledgeSource[],
): WebCommunityLaunchKnowledgeSourceGroups {
  const groups: WebCommunityLaunchKnowledgeSourceGroups = {
    links: [],
    files: [],
    googleDrive: [],
    github: [],
  };
  for (const source of sources) {
    if (source.source_external_provider === "google_drive") {
      groups.googleDrive.push(source);
      continue;
    }
    if (source.source_external_provider === "github") {
      groups.github.push(source);
      continue;
    }
    if (source.source_ingestion_kind === "url") {
      groups.links.push(source);
      continue;
    }
    if (source.source_ingestion_kind === "file") {
      groups.files.push(source);
    }
  }
  return groups;
}

export function isCommunityLaunchKnowledgeRequestCurrent(args: {
  requestId: number;
  activeRequestId: number;
  requestSessionKey: string;
  activeSessionKey: string | null;
  requestCommunityId: string;
  activeCommunityId: string | null;
  canManageCommunitySettings: boolean;
}): boolean {
  return (
    args.requestId === args.activeRequestId &&
    args.requestSessionKey === args.activeSessionKey &&
    args.requestCommunityId === args.activeCommunityId &&
    args.canManageCommunitySettings
  );
}

function waitForCommunityLaunchDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCommunityLaunchSourceCrawlUrl(
  source: CloudCommunityLaunchKnowledgeSource,
): string | null {
  if (source.source_ingestion_kind !== "url") return null;
  if (source.source_external_provider) return null;
  if (source.source_ingestion_status === "ready") return null;
  const url = String(source.source_external_url ?? "").trim();
  return url || null;
}

async function waitForCommunityLaunchSourceCrawlJob<TSession>(args: {
  session: TSession;
  communityId: string;
  crawlJobId: string;
}): Promise<CloudCommunitySourceCrawlJob> {
  let latestJob: CloudCommunitySourceCrawlJob | null = null;
  for (
    let attempt = 0;
    attempt < COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_POLLS;
    attempt += 1
  ) {
    const result = await getCloudCommunitySourceCrawlJob({
      session: args.session,
      communityId: args.communityId,
      crawlJobId: args.crawlJobId,
    });
    latestJob = result?.job ?? latestJob;
    if (latestJob?.status === "ready" || latestJob?.status === "failed") {
      return latestJob;
    }
    await waitForCommunityLaunchDelay(
      COMMUNITY_LAUNCH_SOURCE_CRAWL_POLL_INTERVAL_MS,
    );
  }
  if (latestJob) return latestJob;
  throw new Error("community_source_crawl_status_unavailable");
}

function normalizeCommunityLaunchKnowledgeUrls(rawUrls: string[]): URL[] {
  const trimmedUrls = rawUrls.map((url) => url.trim()).filter(Boolean);
  if (trimmedUrls.length === 0) throw new Error("Add a source link.");
  if (trimmedUrls.length > 5) {
    throw new Error("Add up to five source links at a time.");
  }
  return trimmedUrls.map((rawUrl) => {
    const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      throw new Error("Add valid source links.");
    }
    if (parsedUrl.protocol !== "https:") {
      throw new Error("Add https source links.");
    }
    return parsedUrl;
  });
}

export function useWebCommunityLaunchKnowledgeController<TSession>(
  params: UseWebCommunityLaunchKnowledgeControllerParams<TSession>,
): WebCommunityLaunchKnowledgeModel {
  const [sources, setSources] =
    useState<WebCommunityLaunchKnowledgeSourceGroups>(EMPTY_SOURCE_GROUPS);
  const sourceRequestIdRef = useRef(0);
  const latestContextRef =
    useRef<LatestCommunityLaunchKnowledgeContext<TSession>>({
      session: params.session,
      sessionKey: params.sessionKey,
      communityId: params.activeCommunity?.id ?? null,
      communitySlug: params.activeCommunity?.slug ?? null,
      canManageCommunitySettings: params.canManageCommunitySettings,
    });
  const externalActionsRef = useRef({
    loadCommunityResources: params.loadCommunityResources,
    refreshLaunchSetupStatus: params.refreshLaunchSetupStatus,
    reloadKnowledgeIntegrations: params.reloadKnowledgeIntegrations,
    onAuthorizeSourceIntegration: params.onAuthorizeSourceIntegration,
  });
  latestContextRef.current = {
    session: params.session,
    sessionKey: params.sessionKey,
    communityId: params.activeCommunity?.id ?? null,
    communitySlug: params.activeCommunity?.slug ?? null,
    canManageCommunitySettings: params.canManageCommunitySettings,
  };
  externalActionsRef.current = {
    loadCommunityResources: params.loadCommunityResources,
    refreshLaunchSetupStatus: params.refreshLaunchSetupStatus,
    reloadKnowledgeIntegrations: params.reloadKnowledgeIntegrations,
    onAuthorizeSourceIntegration: params.onAuthorizeSourceIntegration,
  };

  const isContextCurrent = useCallback(
    (context: CommunityLaunchKnowledgeOperationContext<TSession>): boolean => {
      const latest = latestContextRef.current;
      return (
        latest.sessionKey === context.sessionKey &&
        latest.communityId === context.communityId &&
        latest.canManageCommunitySettings
      );
    },
    [],
  );

  const assertContextCurrent = useCallback(
    (context: CommunityLaunchKnowledgeOperationContext<TSession>): void => {
      if (!isContextCurrent(context)) {
        throw new Error(
          "The active community changed. Reopen Knowledge and try again.",
        );
      }
    },
    [isContextCurrent],
  );

  const requireOperationContext = useCallback(
    (): CommunityLaunchKnowledgeOperationContext<TSession> => {
      if (!params.session || !params.sessionKey) {
        throw new Error("Sign in before updating community launch setup.");
      }
      if (!params.activeCommunity?.id || !params.activeCommunity.slug) {
        throw new Error(
          "Select a community before updating community launch setup.",
        );
      }
      if (!params.canManageCommunitySettings) {
        throw new Error(
          "Community manager access is required to update launch setup.",
        );
      }
      const context = {
        session: params.session,
        sessionKey: params.sessionKey,
        communityId: params.activeCommunity.id,
        communitySlug: params.activeCommunity.slug,
      };
      assertContextCurrent(context);
      return context;
    },
    [
      assertContextCurrent,
      params.activeCommunity?.id,
      params.activeCommunity?.slug,
      params.canManageCommunitySettings,
      params.session,
      params.sessionKey,
    ],
  );

  const loadSourcesForContext = useCallback(
    async (
      context: CommunityLaunchKnowledgeOperationContext<TSession>,
    ): Promise<void> => {
      const requestId = sourceRequestIdRef.current + 1;
      sourceRequestIdRef.current = requestId;
      const result = await listCloudCommunityLaunchKnowledgeSources({
        session: context.session,
        communityId: context.communityId,
        limit: 100,
      });
      const latest = latestContextRef.current;
      const isCurrent = isCommunityLaunchKnowledgeRequestCurrent({
        requestId,
        activeRequestId: sourceRequestIdRef.current,
        requestSessionKey: context.sessionKey,
        activeSessionKey: latest.sessionKey,
        requestCommunityId: context.communityId,
        activeCommunityId: latest.communityId,
        canManageCommunitySettings: latest.canManageCommunitySettings,
      });
      if (!isCurrent) return;
      if (
        result.community_id &&
        result.community_id !== context.communityId
      ) {
        return;
      }
      setSources(
        partitionCommunityLaunchKnowledgeSources(result.sources ?? []),
      );
    },
    [],
  );

  const loadSources = useCallback(async (): Promise<void> => {
    await loadSourcesForContext(requireOperationContext());
  }, [loadSourcesForContext, requireOperationContext]);

  const refreshProjection = useCallback(
    async (
      context: CommunityLaunchKnowledgeOperationContext<TSession>,
      options: {
        includeResources?: boolean;
        includeSources?: boolean;
      } = {},
    ): Promise<void> => {
      if (!isContextCurrent(context)) return;
      if (options.includeResources) {
        await externalActionsRef.current.loadCommunityResources(
          context.communityId,
          context.session,
        );
      }
      if (!isContextCurrent(context)) return;
      if (options.includeSources !== false) {
        await loadSourcesForContext(context);
      }
      if (!isContextCurrent(context)) return;
      await externalActionsRef.current.refreshLaunchSetupStatus();
    },
    [isContextCurrent, loadSourcesForContext],
  );

  const refreshProjectionBestEffort = useCallback(
    async (
      context: CommunityLaunchKnowledgeOperationContext<TSession>,
      options: {
        includeResources?: boolean;
        includeSources?: boolean;
      } = {},
    ): Promise<void> => {
      try {
        await refreshProjection(context, options);
      } catch (error) {
        console.warn(
          "[community-launch] failed to refresh knowledge projection after source write:",
          error,
        );
      }
    },
    [refreshProjection],
  );

  const addLinks = useCallback(
    async (draft: { urls: string[] }): Promise<void> => {
      const context = requireOperationContext();
      const normalizedUrls = normalizeCommunityLaunchKnowledgeUrls(draft.urls);
      for (const parsedUrl of normalizedUrls) {
        assertContextCurrent(context);
        const titlePath =
          parsedUrl.pathname && parsedUrl.pathname !== "/"
            ? parsedUrl.pathname
            : "";
        const title =
          `${parsedUrl.hostname.replace(/^www\./, "")}${titlePath}`.slice(
            0,
            120,
          );
        await saveCloudCommunityResource({
          session: context.session,
          resourceId: null,
          isPatch: false,
          payload: {
            community_id: context.communityId,
            title: title || "Source link",
            body_md: null,
            url: parsedUrl.toString(),
            type: "link",
            resource_role: "source",
            resource_status: "review",
            source_ingestion_status: "queued",
            source_ingestion_kind: "url",
            pinned: false,
          },
        });
      }
      await refreshProjectionBestEffort(context, {
        includeResources: true,
      });
      assertContextCurrent(context);
    },
    [
      assertContextCurrent,
      refreshProjectionBestEffort,
      requireOperationContext,
    ],
  );

  const addFiles = useCallback(
    async (draft: { files: File[] }): Promise<void> => {
      const context = requireOperationContext();
      const files = draft.files.filter((file) => file.size > 0).slice(0, 5);
      if (files.length === 0) throw new Error("Add a source file.");
      for (const file of files) {
        assertContextCurrent(context);
        const storageId = await uploadCloudCommunityResourceSourceFile({
          session: context.session,
          communityId: context.communityId,
          file,
        });
        assertContextCurrent(context);
        await saveCloudCommunityResource({
          session: context.session,
          resourceId: null,
          isPatch: false,
          payload: {
            community_id: context.communityId,
            title: file.name || "Source file",
            body_md: null,
            url: null,
            file_key: storageId,
            type: "file",
            resource_role: "source",
            resource_status: "review",
            source_ingestion_status: "queued",
            source_ingestion_kind: "file",
            source_original_filename: file.name || null,
            source_original_mime_type: file.type || null,
            source_original_bytes: file.size,
            pinned: false,
          },
        });
      }
      await refreshProjectionBestEffort(context, {
        includeResources: true,
      });
      assertContextCurrent(context);
    },
    [
      assertContextCurrent,
      refreshProjectionBestEffort,
      requireOperationContext,
    ],
  );

  const ingest = useCallback(async () => {
    const context = requireOperationContext();
    const latestSources = await listCloudCommunityLaunchKnowledgeSources({
      session: context.session,
      communityId: context.communityId,
      limit: 100,
    });
    const crawlTargets = new Map<
      string,
      CloudCommunityLaunchKnowledgeSource
    >();
    for (const source of latestSources.sources ?? []) {
      const crawlUrl = getCommunityLaunchSourceCrawlUrl(source);
      if (crawlUrl && !crawlTargets.has(crawlUrl)) {
        crawlTargets.set(crawlUrl, source);
      }
    }
    const crawlFailures: Array<{
      title: string;
      url: string | null;
      message: string;
    }> = [];
    if (crawlTargets.size > 0) {
      await Promise.all(
        Array.from(crawlTargets.entries())
          .slice(0, COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_ROOTS)
          .map(async ([rootUrl, source]) => {
            try {
              assertContextCurrent(context);
              const started = await crawlCloudCommunitySourceRoot({
                session: context.session,
                communityId: context.communityId,
                rootUrl,
                maxPages: 1,
                maxDepth: 0,
              });
              const crawlJobId = started?.job?.id ?? "";
              if (!crawlJobId) {
                throw new Error("community_source_crawl_job_create_failed");
              }
              const job = await waitForCommunityLaunchSourceCrawlJob({
                session: context.session,
                communityId: context.communityId,
                crawlJobId,
              });
              if (job.status === "failed") {
                throw new Error(
                  job.error || "community_source_crawl_failed",
                );
              }
              return { source, rootUrl, job };
            } catch (error) {
              crawlFailures.push({
                title: source.title || "Source link",
                url: rootUrl,
                message:
                  error instanceof Error
                    ? error.message
                    : "community_source_crawl_failed",
              });
              return null;
            }
          }),
      );
    }
    assertContextCurrent(context);
    const result = await ingestCloudCommunitySources({
      session: context.session,
      communityId: context.communityId,
    });
    await refreshProjectionBestEffort(context, {
      includeResources: true,
    });
    assertContextCurrent(context);
    if (crawlFailures.length === 0) {
      return result as CommunityLaunchKnowledgeSourceIngestionResult | null;
    }
    return {
      ...(result ?? {}),
      ok: false,
      failed: Number(result?.failed ?? 0) + crawlFailures.length,
      failures: [
        ...(Array.isArray(result?.failures) ? result.failures : []),
        ...crawlFailures,
      ],
      ready_sources: Number(result?.ready_sources ?? 0),
      total_sources: Number(
        result?.total_sources ?? latestSources.sources?.length ?? 0,
      ),
      pending_sources: Number(result?.pending_sources ?? 0),
      pending_url_sources: Number(result?.pending_url_sources ?? 0),
      pending_file_sources: Number(result?.pending_file_sources ?? 0),
      pending_google_drive_sources: Number(
        result?.pending_google_drive_sources ?? 0,
      ),
      pending_github_sources: Number(
        result?.pending_github_sources ?? 0,
      ),
      code: result?.code ?? "source_crawl_partial_failure",
      message: "Some source links could not be fully crawled.",
    } satisfies CommunityLaunchKnowledgeSourceIngestionResult;
  }, [
    assertContextCurrent,
    refreshProjectionBestEffort,
    requireOperationContext,
  ]);

  const loadGoogleDriveConnection = useCallback(async () => {
    const context = requireOperationContext();
    const result = await loadCloudCommunityGoogleDriveSourceConnection({
      session: context.session,
      communityId: context.communityId,
    });
    return isContextCurrent(context) ? result : null;
  }, [isContextCurrent, requireOperationContext]);

  const connectGoogleDrive = useCallback(async () => {
    const context = requireOperationContext();
    const result = await beginCloudCommunityGoogleDriveSourceOAuth({
      session: context.session,
      communityId: context.communityId,
      returnToPath: buildCommunityLaunchKnowledgeSourceOAuthReturnToPath({
        communityId: context.communityId,
        communitySlug: context.communitySlug,
      }),
    });
    if (result.ok && result.authorize_url && isContextCurrent(context)) {
      externalActionsRef.current.onAuthorizeSourceIntegration({
        provider: "google_drive",
        authorizeUrl: result.authorize_url,
        communityId: context.communityId,
        communitySlug: context.communitySlug,
      });
    }
    return isContextCurrent(context) ? result : null;
  }, [isContextCurrent, requireOperationContext]);

  const listGoogleDriveFiles = useCallback(
    async (
      request?: CommunityLaunchGoogleDriveFileListRequest | null,
    ): Promise<CommunityLaunchGoogleDriveFileListResult | null> => {
      const context = requireOperationContext();
      const result = await listCloudCommunityGoogleDriveSourceFiles({
        session: context.session,
        communityId: context.communityId,
        folderId: request?.folderId,
        pageToken: request?.pageToken,
        query: request?.query,
      });
      return isContextCurrent(context) ? result : null;
    },
    [isContextCurrent, requireOperationContext],
  );

  const importGoogleDriveFiles = useCallback(
    async (
      fileIds: string[],
    ): Promise<CommunityLaunchGoogleDriveImportResult | null> => {
      const context = requireOperationContext();
      const result = await importCloudCommunityGoogleDriveSourceFiles({
        session: context.session,
        communityId: context.communityId,
        fileIds,
      });
      await refreshProjectionBestEffort(context);
      return isContextCurrent(context) ? result : null;
    },
    [
      isContextCurrent,
      refreshProjectionBestEffort,
      requireOperationContext,
    ],
  );

  const removeSource = useCallback(
    async (resourceId: string): Promise<boolean> => {
      const context = requireOperationContext();
      await deleteCloudCommunityResource({
        session: context.session,
        resourceId,
      });
      await refreshProjection(context);
      assertContextCurrent(context);
      return true;
    },
    [assertContextCurrent, refreshProjection, requireOperationContext],
  );

  const disconnectGoogleDrive = useCallback(async () => {
    const context = requireOperationContext();
    const connection =
      await disconnectCloudCommunityGoogleDriveSourceConnection({
        session: context.session,
        communityId: context.communityId,
      });
    await refreshProjection(context);
    if (isContextCurrent(context)) {
      externalActionsRef.current.reloadKnowledgeIntegrations();
    }
    return isContextCurrent(context) ? connection : null;
  }, [
    isContextCurrent,
    refreshProjection,
    requireOperationContext,
  ]);

  const loadGitHubConnection = useCallback(async () => {
    const context = requireOperationContext();
    const result = await loadCloudCommunityGitHubSourceConnection({
      session: context.session,
      communityId: context.communityId,
    });
    return isContextCurrent(context) ? result : null;
  }, [isContextCurrent, requireOperationContext]);

  const connectGitHub = useCallback(async () => {
    const context = requireOperationContext();
    const result = await beginCloudCommunityGitHubSourceOAuth({
      session: context.session,
      communityId: context.communityId,
      returnToPath: buildCommunityLaunchKnowledgeSourceOAuthReturnToPath({
        communityId: context.communityId,
        communitySlug: context.communitySlug,
      }),
    });
    if (result.ok && result.authorize_url && isContextCurrent(context)) {
      externalActionsRef.current.onAuthorizeSourceIntegration({
        provider: "github",
        authorizeUrl: result.authorize_url,
        communityId: context.communityId,
        communitySlug: context.communitySlug,
      });
    }
    return isContextCurrent(context) ? result : null;
  }, [isContextCurrent, requireOperationContext]);

  const listGitHubRepositories = useCallback(
    async (
      query?: string | null,
    ): Promise<CommunityLaunchGitHubRepositoryListResult | null> => {
      const context = requireOperationContext();
      const result = await listCloudCommunityGitHubSourceRepositories({
        session: context.session,
        communityId: context.communityId,
        query,
      });
      return isContextCurrent(context) ? result : null;
    },
    [isContextCurrent, requireOperationContext],
  );

  const listGitHubFiles = useCallback(
    async (
      repoFullName: string,
      ref?: string | null,
      query?: string | null,
    ): Promise<CommunityLaunchGitHubFileListResult | null> => {
      const context = requireOperationContext();
      const result = await listCloudCommunityGitHubSourceFiles({
        session: context.session,
        communityId: context.communityId,
        repoFullName,
        ref,
        query,
      });
      return isContextCurrent(context) ? result : null;
    },
    [isContextCurrent, requireOperationContext],
  );

  const importGitHubFiles = useCallback(
    async (
      fileIds: string[],
    ): Promise<CommunityLaunchGitHubImportResult | null> => {
      const context = requireOperationContext();
      const result = await importCloudCommunityGitHubSourceFiles({
        session: context.session,
        communityId: context.communityId,
        fileIds,
      });
      await refreshProjectionBestEffort(context);
      return isContextCurrent(context) ? result : null;
    },
    [
      isContextCurrent,
      refreshProjectionBestEffort,
      requireOperationContext,
    ],
  );

  const disconnectGitHub = useCallback(async () => {
    const context = requireOperationContext();
    const connection =
      await disconnectCloudCommunityGitHubSourceConnection({
        session: context.session,
        communityId: context.communityId,
      });
    await refreshProjection(context);
    if (isContextCurrent(context)) {
      externalActionsRef.current.reloadKnowledgeIntegrations();
    }
    return isContextCurrent(context) ? connection : null;
  }, [
    isContextCurrent,
    refreshProjection,
    requireOperationContext,
  ]);

  const generatePlan = useCallback(
    async (draft: {
      builderIntent: string;
    }): Promise<CommunityLaunchKnowledgePlanResult | null> => {
      const context = requireOperationContext();
      const result = await runCloudCommunityWikiArchitectProposal<
        TSession,
        CommunityLaunchKnowledgePlanResult
      >({
        session: context.session,
        communityId: context.communityId,
        builderIntent: draft.builderIntent,
      });
      return isContextCurrent(context) ? result : null;
    },
    [isContextCurrent, requireOperationContext],
  );

  const applyPlan = useCallback(
    async (draft: {
      proposal: unknown;
    }): Promise<CommunityLaunchKnowledgePlanApplyResult | null> => {
      const context = requireOperationContext();
      const result = await applyCloudCommunityWikiArchitectProposal<
        TSession,
        CommunityLaunchKnowledgePlanApplyResult
      >({
        session: context.session,
        communityId: context.communityId,
        proposal: draft.proposal,
      });
      await refreshProjection(context, {
        includeResources: true,
        includeSources: false,
      });
      return isContextCurrent(context) ? result : null;
    },
    [
      isContextCurrent,
      refreshProjection,
      requireOperationContext,
    ],
  );

  const draftResources = useCallback(
    async (): Promise<CommunityLaunchKnowledgeContentDraftResult | null> => {
      const context = requireOperationContext();
      const result = await draftCloudCommunityResourceContentFromSources<
        TSession,
        CommunityLaunchKnowledgeContentDraftResult
      >({
        session: context.session,
        communityId: context.communityId,
        limit: 8,
      });
      await refreshProjection(context, {
        includeResources: true,
        includeSources: false,
      });
      return isContextCurrent(context) ? result : null;
    },
    [
      isContextCurrent,
      refreshProjection,
      requireOperationContext,
    ],
  );

  useEffect(() => {
    sourceRequestIdRef.current += 1;
    setSources(EMPTY_SOURCE_GROUPS);
  }, [
    params.activeCommunity?.id,
    params.canManageCommunitySettings,
    params.sessionKey,
  ]);

  return useMemo(
    () => ({
      sources,
      sourceActions: {
        addLinks,
        addFiles,
        load: loadSources,
        remove: removeSource,
        ingest,
      },
      googleDrive: {
        loadConnection: loadGoogleDriveConnection,
        connect: connectGoogleDrive,
        listFiles: listGoogleDriveFiles,
        importFiles: importGoogleDriveFiles,
        disconnect: disconnectGoogleDrive,
      },
      github: {
        loadConnection: loadGitHubConnection,
        connect: connectGitHub,
        listRepositories: listGitHubRepositories,
        listFiles: listGitHubFiles,
        importFiles: importGitHubFiles,
        disconnect: disconnectGitHub,
      },
      assembly: {
        generatePlan,
        applyPlan,
        draftResources,
      },
    }),
    [
      addFiles,
      addLinks,
      applyPlan,
      connectGitHub,
      connectGoogleDrive,
      disconnectGitHub,
      disconnectGoogleDrive,
      draftResources,
      generatePlan,
      importGitHubFiles,
      importGoogleDriveFiles,
      ingest,
      listGitHubFiles,
      listGitHubRepositories,
      listGoogleDriveFiles,
      loadGitHubConnection,
      loadGoogleDriveConnection,
      loadSources,
      removeSource,
      sources,
    ],
  );
}
