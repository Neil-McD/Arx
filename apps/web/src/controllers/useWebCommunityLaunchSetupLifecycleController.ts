import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { loadCloudCommunityLaunchSetupStatus } from "../../../../shared/cloudCommunityLaunchSetupGateway";
import type {
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../../shared/communityLaunchSetup";
import type {
  CommunityLaunchKnowledgeProvider,
  WebCommunityLaunchSetupLifecycleModel,
} from "../components/webCommunityLaunchSetupLifecycleModel";
import {
  normalizeLaunchOAuthContextParam,
  type CommunityLaunchKnowledgeOAuthContext,
} from "../communityLaunchKnowledgeSourceOAuth";
import {
  parseCommunityLaunchSetupRouteStep,
  readCurrentCommunityLaunchSetupRouteContext,
} from "../communityLaunchSetupRoute";

type CommunityLaunchTarget = {
  communityId: string | null;
  communitySlug: string | null;
};

type CommunityLaunchRestoreIntent =
  | (CommunityLaunchTarget & {
      kind: "route";
      step: CommunityLaunchSetupStep;
    })
  | (CommunityLaunchTarget & {
      kind: "knowledge_oauth";
    });

type ActiveCommunityLaunchTarget = {
  id: string;
  slug: string | null;
  updatedAt: string | null;
};

type UseWebCommunityLaunchSetupLifecycleControllerParams<TSession> = {
  session: TSession | null;
  sessionKey: string | null;
  activePage: string;
  activeCommunity: ActiveCommunityLaunchTarget | null;
  selectedCommunitySlug: string | null;
  canManageCommunitySettings: boolean;
  isAccountSetupComplete: boolean;
  onRequestCommunityTarget: (target: CommunityLaunchTarget) => void;
};

type StatusRequestResult = {
  applied: boolean;
  status: CommunityLaunchSetupStatus | null;
  error: string | null;
};

export type UseWebCommunityLaunchSetupLifecycleControllerResult<TSession> = {
  model: WebCommunityLaunchSetupLifecycleModel;
  close: () => void;
  openCreate: () => void;
  loadAndOpenCommunity: (args: {
    session: TSession;
    communityId: string;
    step?: CommunityLaunchSetupStep | string | null;
  }) => Promise<CommunityLaunchSetupStep | null>;
  queueKnowledgeOAuthRestore: (
    context: CommunityLaunchKnowledgeOAuthContext,
  ) => void;
  noteKnowledgeIntegrationConnected: (
    provider: CommunityLaunchKnowledgeProvider,
  ) => void;
  reloadKnowledgeIntegrations: () => void;
  markKnowledgeAutoOpenHandled: (
    provider: CommunityLaunchKnowledgeProvider,
  ) => void;
  refreshActiveStatus: () => Promise<CommunityLaunchSetupStatus | null>;
  resolveStep: (
    step?: CommunityLaunchSetupStep | string | null,
  ) => CommunityLaunchSetupStep;
};

function formatCommunityLaunchSetupError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Failed to load community launch setup.";
}

function initialRestoreIntent(): CommunityLaunchRestoreIntent | null {
  const context = readCurrentCommunityLaunchSetupRouteContext();
  if (!context.shouldRestore || !context.step) return null;
  return {
    kind: "route",
    step: context.step,
    communityId: normalizeLaunchOAuthContextParam(context.communityId),
    communitySlug: normalizeLaunchOAuthContextParam(context.communitySlug),
  };
}

export function resolveCommunityLaunchSetupLifecycleStep(
  step: CommunityLaunchSetupStep | string | null | undefined,
  status: CommunityLaunchSetupStatus | null,
): CommunityLaunchSetupStep {
  return (
    parseCommunityLaunchSetupRouteStep(step) ??
    parseCommunityLaunchSetupRouteStep(status?.current_step) ??
    "profile"
  );
}

export function isCommunityLaunchSetupStatusRequestCurrent(args: {
  requestId: number;
  activeRequestId: number;
  requestSessionKey: string | null;
  activeSessionKey: string | null;
  requestCommunityId: string;
  activeCommunityId: string | null;
  allowTargetTransition?: boolean;
}): boolean {
  return (
    args.requestId === args.activeRequestId &&
    args.requestSessionKey === args.activeSessionKey &&
    (
      args.allowTargetTransition === true ||
      args.requestCommunityId === args.activeCommunityId
    )
  );
}

export function useWebCommunityLaunchSetupLifecycleController<TSession>(
  params: UseWebCommunityLaunchSetupLifecycleControllerParams<TSession>,
): UseWebCommunityLaunchSetupLifecycleControllerResult<TSession> {
  const [status, setStatus] = useState<CommunityLaunchSetupStatus | null>(null);
  const [loadedCommunityId, setLoadedCommunityId] = useState<string | null>(null);
  const [loadedCommunityUpdatedAt, setLoadedCommunityUpdatedAt] =
    useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"setup" | "create">("setup");
  const [initialStep, setInitialStep] =
    useState<CommunityLaunchSetupStep | null>(null);
  const [knowledgeIntegrationReloadKey, setKnowledgeIntegrationReloadKey] =
    useState(0);
  const [knowledgeAutoOpenProvider, setKnowledgeAutoOpenProvider] =
    useState<CommunityLaunchKnowledgeProvider | null>(null);
  const [restoreIntent, setRestoreIntent] =
    useState<CommunityLaunchRestoreIntent | null>(initialRestoreIntent);
  const statusRequestIdRef = useRef(0);
  const statusRequestCommunityIdRef = useRef<string | null>(null);
  const latestTargetRef = useRef({
    sessionKey: params.sessionKey,
    activeCommunityId: params.activeCommunity?.id ?? null,
  });
  latestTargetRef.current = {
    sessionKey: params.sessionKey,
    activeCommunityId: params.activeCommunity?.id ?? null,
  };

  const invalidateStatusRequest = useCallback(() => {
    statusRequestIdRef.current += 1;
    statusRequestCommunityIdRef.current = null;
  }, []);

  const loadStatus = useCallback(async (args: {
    session: TSession;
    communityId: string;
    communityUpdatedAt?: string | null;
    allowTargetTransition?: boolean;
  }): Promise<StatusRequestResult> => {
    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;
    statusRequestCommunityIdRef.current = args.communityId;
    const requestSessionKey = params.sessionKey;
    setIsLoading(true);
    setError(null);
    try {
      const nextStatus = await loadCloudCommunityLaunchSetupStatus({
        session: args.session,
        communityId: args.communityId,
      });
      const latestTarget = latestTargetRef.current;
      const isCurrent = isCommunityLaunchSetupStatusRequestCurrent({
        requestId,
        activeRequestId: statusRequestIdRef.current,
        requestSessionKey,
        activeSessionKey: latestTarget.sessionKey,
        requestCommunityId: args.communityId,
        activeCommunityId: latestTarget.activeCommunityId,
        allowTargetTransition: args.allowTargetTransition,
      });
      if (!isCurrent) return { applied: false, status: null, error: null };
      setLoadedCommunityId(args.communityId);
      setLoadedCommunityUpdatedAt(args.communityUpdatedAt ?? null);
      setStatus(nextStatus);
      return { applied: true, status: nextStatus, error: null };
    } catch (requestError) {
      const latestTarget = latestTargetRef.current;
      const isCurrent = isCommunityLaunchSetupStatusRequestCurrent({
        requestId,
        activeRequestId: statusRequestIdRef.current,
        requestSessionKey,
        activeSessionKey: latestTarget.sessionKey,
        requestCommunityId: args.communityId,
        activeCommunityId: latestTarget.activeCommunityId,
        allowTargetTransition: args.allowTargetTransition,
      });
      if (!isCurrent) return { applied: false, status: null, error: null };
      const message = formatCommunityLaunchSetupError(requestError);
      setStatus(null);
      setLoadedCommunityId(null);
      setLoadedCommunityUpdatedAt(null);
      setError(message);
      return { applied: true, status: null, error: message };
    } finally {
      if (statusRequestIdRef.current === requestId) {
        statusRequestCommunityIdRef.current = null;
        setIsLoading(false);
      }
    }
  }, [params.sessionKey]);

  const resolveStep = useCallback((
    step?: CommunityLaunchSetupStep | string | null,
  ) => resolveCommunityLaunchSetupLifecycleStep(step, status), [status]);

  const close = useCallback(() => {
    setIsOpen(false);
    setMode("setup");
    setInitialStep(null);
    setKnowledgeAutoOpenProvider(null);
    setRestoreIntent(null);
  }, []);

  const openCreate = useCallback(() => {
    invalidateStatusRequest();
    setStatus(null);
    setLoadedCommunityId(null);
    setLoadedCommunityUpdatedAt(null);
    setIsLoading(false);
    setError(null);
    setInitialStep(null);
    setKnowledgeAutoOpenProvider(null);
    setRestoreIntent(null);
    setMode("create");
    setIsOpen(true);
  }, [invalidateStatusRequest]);

  const loadAndOpenCommunity = useCallback(async (args: {
    session: TSession;
    communityId: string;
    step?: CommunityLaunchSetupStep | string | null;
  }): Promise<CommunityLaunchSetupStep | null> => {
    setMode("setup");
    setIsOpen(true);
    setInitialStep(null);
    setRestoreIntent(null);
    const result = await loadStatus({
      session: args.session,
      communityId: args.communityId,
      allowTargetTransition: true,
    });
    if (!result.applied) return null;
    if (result.error) throw new Error(result.error);
    const nextStep = resolveCommunityLaunchSetupLifecycleStep(
      args.step,
      result.status,
    );
    setInitialStep(nextStep);
    return nextStep;
  }, [loadStatus]);

  const queueKnowledgeOAuthRestore = useCallback((
    context: CommunityLaunchKnowledgeOAuthContext,
  ) => {
    if (!context.shouldRestore) return;
    setMode("setup");
    setRestoreIntent({
      kind: "knowledge_oauth",
      communityId: normalizeLaunchOAuthContextParam(context.communityId),
      communitySlug: normalizeLaunchOAuthContextParam(context.communitySlug),
    });
  }, []);

  const noteKnowledgeIntegrationConnected = useCallback((
    provider: CommunityLaunchKnowledgeProvider,
  ) => {
    setKnowledgeIntegrationReloadKey((key) => key + 1);
    setKnowledgeAutoOpenProvider(provider);
  }, []);

  const reloadKnowledgeIntegrations = useCallback(() => {
    setKnowledgeIntegrationReloadKey((key) => key + 1);
  }, []);

  const markKnowledgeAutoOpenHandled = useCallback((
    provider: CommunityLaunchKnowledgeProvider,
  ) => {
    setKnowledgeAutoOpenProvider((current) =>
      current === provider ? null : current,
    );
  }, []);

  const refreshActiveStatus = useCallback(async () => {
    const activeCommunityId = params.activeCommunity?.id ?? null;
    if (!params.session || !activeCommunityId) return null;
    const result = await loadStatus({
      session: params.session,
      communityId: activeCommunityId,
      communityUpdatedAt: params.activeCommunity?.updatedAt ?? null,
    });
    return result.applied ? result.status : null;
  }, [
    loadStatus,
    params.activeCommunity?.id,
    params.activeCommunity?.updatedAt,
    params.session,
  ]);

  useEffect(() => {
    if (mode === "create") {
      invalidateStatusRequest();
      setStatus(null);
      setLoadedCommunityId(null);
      setLoadedCommunityUpdatedAt(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const activeCommunityId = params.activeCommunity?.id ?? null;
    const activeCommunityUpdatedAt = params.activeCommunity?.updatedAt ?? null;
    const shouldLoad =
      Boolean(params.session) &&
      Boolean(activeCommunityId) &&
      params.canManageCommunitySettings &&
      params.isAccountSetupComplete &&
      params.activePage === "community" &&
      Boolean(isOpen || restoreIntent);

    if (!shouldLoad || !params.session || !activeCommunityId) {
      invalidateStatusRequest();
      setStatus(null);
      setLoadedCommunityId(null);
      setLoadedCommunityUpdatedAt(null);
      setError(null);
      setIsLoading(false);
      if (!restoreIntent) {
        setIsOpen(false);
        setInitialStep(null);
      }
      return;
    }

    if (
      loadedCommunityId === activeCommunityId &&
      loadedCommunityUpdatedAt === activeCommunityUpdatedAt
    ) {
      return;
    }
    if (statusRequestCommunityIdRef.current === activeCommunityId) return;

    void loadStatus({
      session: params.session,
      communityId: activeCommunityId,
      communityUpdatedAt: activeCommunityUpdatedAt,
    });
  }, [
    invalidateStatusRequest,
    isOpen,
    loadStatus,
    loadedCommunityId,
    loadedCommunityUpdatedAt,
    mode,
    params.activeCommunity?.id,
    params.activeCommunity?.updatedAt,
    params.activePage,
    params.canManageCommunitySettings,
    params.isAccountSetupComplete,
    params.session,
    restoreIntent,
  ]);

  useEffect(() => {
    if (!restoreIntent) return;
    const targetCommunityId = normalizeLaunchOAuthContextParam(
      restoreIntent.communityId,
    );
    const targetCommunitySlug = normalizeLaunchOAuthContextParam(
      restoreIntent.communitySlug,
    );
    const activeCommunityId = normalizeLaunchOAuthContextParam(
      params.activeCommunity?.id,
    );
    const activeCommunitySlug = normalizeLaunchOAuthContextParam(
      params.selectedCommunitySlug ?? params.activeCommunity?.slug,
    );
    const hasTarget = Boolean(targetCommunityId || targetCommunitySlug);
    const activeMatchesTarget =
      !hasTarget ||
      (targetCommunityId ? activeCommunityId === targetCommunityId : false) ||
      (targetCommunitySlug ? activeCommunitySlug === targetCommunitySlug : false);

    if (hasTarget && !activeMatchesTarget) {
      params.onRequestCommunityTarget({
        communityId: targetCommunityId,
        communitySlug: targetCommunitySlug,
      });
      return;
    }

    if (
      !params.session ||
      !params.activeCommunity ||
      !status ||
      loadedCommunityId !== activeCommunityId ||
      isLoading ||
      error
    ) {
      return;
    }

    setMode("setup");
    setInitialStep(
      restoreIntent.kind === "knowledge_oauth"
        ? "knowledge"
        : restoreIntent.step,
    );
    setIsOpen(true);
    setRestoreIntent(null);
  }, [
    error,
    isLoading,
    loadedCommunityId,
    params.activeCommunity,
    params.onRequestCommunityTarget,
    params.selectedCommunitySlug,
    params.session,
    restoreIntent,
    status,
  ]);

  return {
    model: {
      isOpen,
      mode,
      status,
      initialStep,
      knowledgeIntegrationReloadKey,
      knowledgeAutoOpenProvider,
    },
    close,
    openCreate,
    loadAndOpenCommunity,
    queueKnowledgeOAuthRestore,
    noteKnowledgeIntegrationConnected,
    reloadKnowledgeIntegrations,
    markKnowledgeAutoOpenHandled,
    refreshActiveStatus,
    resolveStep,
  };
}
