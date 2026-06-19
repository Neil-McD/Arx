import { useState } from "react";

import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import type {
  BeginUserPlatformAppOAuthOptions,
  BeginUserPlatformAppOAuthResult,
  ConnectUserPlatformAppInput,
  ConnectUserPlatformAppResult,
} from "../../../../shared/userPlatformAppMountTypes";
import {
  buildDiscoverAppPersonalConnectInput,
  isDiscoverAppPersonallyConnectable,
  type DiscoverAppCatalogEntry,
} from "../lib/discoverCatalog";

type PersonalAppSetupCatalogEntry = DiscoverAppCatalogEntry & {
  personalConnect: Extract<
    DiscoverAppCatalogEntry["personalConnect"],
    { availability: "ready" }
  >;
};

type SetupImportedCommunityMcpFromModalInput = {
  community_app_mount_id: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  secret?: string;
};

type PersonalAppSetupTarget = {
  id?: string | null;
  app: {
    name?: string | null;
    slug?: string | null;
    catalog_app_id?: string | null;
    endpoint_url?: string | null;
    auth_type?: string | null;
    setup_status?: string | null;
    setup_reason?: string | null;
    mcp_registry_id?: string | null;
  };
  personal_mount?: {
    source_mount_id?: string | null;
    app: {
      endpoint_url?: string | null;
      auth_type?: string | null;
    };
  } | null;
};

type UsePersonalAppSetupControllerArgs = {
  hasSession: boolean;
  requireSignIn: () => void;
  onUnavailable: () => void;
  isConnecting: boolean;
  refreshingPersonalMountId: string | null;
  reconnectingPersonalMountId: string | null;
  refreshingCommunityMountId?: string | null;
  onConnectApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<ConnectUserPlatformAppResult>;
  onBeginOAuth: (
    catalogAppId: string,
    options?: BeginUserPlatformAppOAuthOptions,
  ) => Promise<BeginUserPlatformAppOAuthResult>;
  onRefreshApp: (
    userPlatformAppMountId: string,
  ) => Promise<boolean> | Promise<void> | boolean | void;
  onReconnectApp: (
    userPlatformAppMountId: string,
    secret: string,
  ) => Promise<boolean> | Promise<void> | boolean | void;
  onSetupImportedCommunityMcpApp?: (
    input: SetupImportedCommunityMcpFromModalInput,
  ) => Promise<boolean> | Promise<void> | boolean | void;
};

type OpenPersonalAppSetupArgs = {
  source: PersonalAppSetupTarget;
  effectiveSource?: PersonalAppSetupTarget | null;
  catalogEntry: DiscoverAppCatalogEntry | null;
};

type OpenPersonalAppSetupResult =
  | {
      opened: true;
    }
  | {
      opened: false;
      reason: "auth_required" | "not_connectable";
    };

type PersonalAppSetupState = {
  mode: "catalog" | "imported_community";
  source: PersonalAppSetupTarget;
  effectiveSource: PersonalAppSetupTarget | null;
  catalogEntry: PersonalAppSetupCatalogEntry;
} | null;

function isDeveloperAppAuthType(value: string): value is DeveloperAppAuthType {
  return (
    value === "none" ||
    value === "api_key" ||
    value === "bearer" ||
    value === "oauth"
  );
}

function resolveInitialPersonalAppSetupAuthType(
  source: PersonalAppSetupTarget,
  catalogEntry: PersonalAppSetupCatalogEntry,
): DeveloperAppAuthType {
  if (catalogEntry.personalConnect.connectionKind === "custom") {
    const currentAuthType = source.app.auth_type;
    if (
      currentAuthType &&
      isDeveloperAppAuthType(currentAuthType) &&
      catalogEntry.personalConnect.supportedAuthTypes.some(
        (option) => option.value === currentAuthType,
      )
    ) {
      return currentAuthType;
    }
    return catalogEntry.personalConnect.supportedAuthTypes[0]?.value ?? "none";
  }
  return catalogEntry.personalConnect.authType;
}

function personalAppSetupRequiresSecret(
  catalogEntry: PersonalAppSetupCatalogEntry,
  authType: DeveloperAppAuthType,
): boolean {
  if (catalogEntry.personalConnect.connectionKind === "custom") {
    return authType !== "none";
  }
  return catalogEntry.personalConnect.authMethod === "token";
}

function normalizeSetupIdentityPart(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function personalAppSetupTargetsExistingPersonalMount(
  source: PersonalAppSetupTarget | null,
  connectInput: ConnectUserPlatformAppInput,
): boolean {
  const personalMount = source?.personal_mount;
  if (!personalMount) return false;
  return (
    normalizeSetupIdentityPart(personalMount.app.endpoint_url) ===
      normalizeSetupIdentityPart(connectInput.endpoint_url) &&
    normalizeSetupIdentityPart(personalMount.app.auth_type) ===
      normalizeSetupIdentityPart(connectInput.auth_type)
  );
}

function booleanActionSucceeded(value: boolean | void): boolean {
  return value !== false;
}

function isImportedCommunityMcpSetupTarget(
  source: PersonalAppSetupTarget,
): boolean {
  const setupStatus = source.app.setup_status ?? null;
  return Boolean(
    source.id &&
      source.app.mcp_registry_id &&
      (setupStatus === "needs_auth" || setupStatus === "needs_config"),
  );
}

function isPendingImportedMcpEndpoint(value: string | null | undefined): boolean {
  return /pending-mcp\.polynet\.ai/i.test(String(value ?? ""));
}

function buildImportedCommunityMcpSetupCatalogEntry(
  source: PersonalAppSetupTarget,
): PersonalAppSetupCatalogEntry {
  const name =
    source.app.name?.trim() ||
    source.app.slug?.trim() ||
    source.app.mcp_registry_id?.trim() ||
    "Imported MCP";
  const endpointUrl = isPendingImportedMcpEndpoint(source.app.endpoint_url)
    ? ""
    : (source.app.endpoint_url?.trim() ?? "");
  const common = {
    id: `imported-${source.app.mcp_registry_id?.trim() || source.id || "mcp"}`,
    name,
    tagline: "Imported community MCP",
    description:
      source.app.setup_reason?.trim() ||
      "Review the remote MCP endpoint and auth details to make this imported community app live.",
    supportLabel: "Imported MCP",
    supportNote:
      "This app was added by the selected community and is not listed in Discover.",
    heroNote: "Community-provided app",
    capabilities: [
      "Remote MCP endpoint",
      "Community-provided setup",
      "Personal harness setup",
    ] as [string, string, string],
    websiteUrl: "",
    docsUrl: "",
    logoUrl: null,
    logoUrlDark: null,
  };
  if (source.app.auth_type === "oauth") {
    return {
      ...common,
      personalConnect: {
        connectionKind: "known",
        availability: "ready",
        authMethod: "oauth",
        connectionStrategy: {
          defaultMode: "oauth",
          supportedModes: ["oauth"],
        },
        endpointUrl,
        authType: "oauth",
        authLabel: "OAuth",
        note:
          "Connect this imported MCP with OAuth. Polynet will attach it to your personal harness for this community.",
      },
    };
  }
  return {
    ...common,
    personalConnect: {
      connectionKind: "custom",
      availability: "ready",
      authMethod: "custom",
      connectionStrategy: {
        defaultMode:
          source.app.auth_type === "none" ? "none" : "token",
        supportedModes: ["custom", "token", "none"],
      },
      endpointUrl: null,
      authType: null,
      authLabel: "Auth",
      note:
        "Imported MCPs must use a vetted remote HTTPS endpoint before Polynet can make them live.",
      endpointPlaceholder: "https://mcp.example.com",
      supportedAuthTypes: [
        { value: "bearer", label: "Bearer token", secretLabel: "Bearer token" },
        { value: "api_key", label: "API key", secretLabel: "API key" },
        { value: "none", label: "No auth" },
      ],
    },
  };
}

export function usePersonalAppSetupController(
  args: UsePersonalAppSetupControllerArgs,
) {
  const [setupState, setSetupState] = useState<PersonalAppSetupState>(null);
  const [endpoint, setEndpoint] = useState("");
  const [authType, setAuthType] = useState<DeveloperAppAuthType>("bearer");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const catalogEntry = setupState?.catalogEntry ?? null;
  const effectiveSource = setupState?.effectiveSource ?? setupState?.source ?? null;
  const isOauth =
    catalogEntry?.personalConnect.connectionKind === "known" &&
    catalogEntry.personalConnect.authMethod === "oauth";
  const existingMountId =
    effectiveSource?.personal_mount?.source_mount_id ?? null;
  const isImportedCommunitySetup =
    setupState?.mode === "imported_community" &&
    Boolean(setupState.source.id);
  const isSubmitting =
    args.isConnecting ||
    Boolean(
      isImportedCommunitySetup &&
        setupState?.source.id &&
        args.refreshingCommunityMountId === setupState.source.id,
    ) ||
    Boolean(
      existingMountId &&
        (args.refreshingPersonalMountId === existingMountId ||
          args.reconnectingPersonalMountId === existingMountId),
    );

  const close = () => {
    setSetupState(null);
    setEndpoint("");
    setAuthType("bearer");
    setSecret("");
    setError(null);
  };

  const open = (
    openArgs: OpenPersonalAppSetupArgs,
  ): OpenPersonalAppSetupResult => {
    if (!args.hasSession) {
      args.requireSignIn();
      return { opened: false, reason: "auth_required" };
    }
    if (
      openArgs.catalogEntry &&
      isDiscoverAppPersonallyConnectable(openArgs.catalogEntry)
    ) {
      const readyCatalogEntry = openArgs.catalogEntry;
      const initialEndpoint =
        readyCatalogEntry.personalConnect.connectionKind === "custom"
          ? (openArgs.source.app.endpoint_url ?? "")
          : readyCatalogEntry.personalConnect.endpointUrl;
      setSetupState({
        mode: "catalog",
        source: openArgs.source,
        effectiveSource: openArgs.effectiveSource ?? openArgs.source,
        catalogEntry: readyCatalogEntry,
      });
      setEndpoint(initialEndpoint);
      setAuthType(
        resolveInitialPersonalAppSetupAuthType(openArgs.source, readyCatalogEntry),
      );
      setSecret("");
      setError(null);
      return { opened: true };
    }
    if (!isImportedCommunityMcpSetupTarget(openArgs.source)) {
      args.onUnavailable();
      return { opened: false, reason: "not_connectable" };
    }
    const readyCatalogEntry =
      buildImportedCommunityMcpSetupCatalogEntry(openArgs.source);
    const initialEndpoint =
      isPendingImportedMcpEndpoint(openArgs.source.app.endpoint_url)
        ? ""
        : (openArgs.source.app.endpoint_url ?? "");
    setSetupState({
      mode: "imported_community",
      source: openArgs.source,
      effectiveSource: openArgs.effectiveSource ?? openArgs.source,
      catalogEntry: readyCatalogEntry,
    });
    setEndpoint(initialEndpoint);
    setAuthType(resolveInitialPersonalAppSetupAuthType(openArgs.source, readyCatalogEntry));
    setSecret("");
    setError(null);
    return { opened: true };
  };

  const confirm = async () => {
    if (!setupState || !catalogEntry) return;
    setError(null);
    if (!isDiscoverAppPersonallyConnectable(catalogEntry)) {
      setError("This app is not ready for setup yet.");
      return;
    }
    if (isOauth) {
      const communityAppMountId =
        setupState.mode === "imported_community"
          ? (setupState.source.id?.trim() ?? "")
          : "";
      const result = await args.onBeginOAuth(
        catalogEntry.id,
        communityAppMountId
          ? {
              community_app_mount_id: communityAppMountId,
              endpoint_url: endpoint.trim() || undefined,
            }
          : undefined,
      );
      if (!result.ok) {
        setError(
          result.error_message ??
            `Couldn't start ${catalogEntry.name} authentication.`,
        );
      }
      return;
    }

    const trimmedSecret = secret.trim();
    if (personalAppSetupRequiresSecret(catalogEntry, authType) && !trimmedSecret) {
      setError(`Paste your ${catalogEntry.name} token to continue.`);
      return;
    }

    if (setupState.mode === "imported_community") {
      const communityAppMountId = setupState.source.id?.trim() ?? "";
      const endpointUrl = endpoint.trim();
      if (!communityAppMountId || !args.onSetupImportedCommunityMcpApp) {
        setError("This imported app is not ready for setup yet.");
        return;
      }
      if (!endpointUrl) {
        setError("Paste the remote MCP endpoint to continue.");
        return;
      }
      const ok = await args.onSetupImportedCommunityMcpApp({
        community_app_mount_id: communityAppMountId,
        endpoint_url: endpointUrl,
        auth_type: authType,
        secret: trimmedSecret || undefined,
      });
      if (!booleanActionSucceeded(ok)) {
        setError(
          `Couldn't finish setting up ${catalogEntry.name}. Check the endpoint and credentials, then try again.`,
        );
        return;
      }
      close();
      return;
    }

    const connectInput = buildDiscoverAppPersonalConnectInput(catalogEntry, {
      endpointUrl: endpoint,
      authType,
      description: catalogEntry.description,
      secret: trimmedSecret || undefined,
    });
    if (!connectInput) {
      setError("This app is not ready for this setup path.");
      return;
    }

    const targetsExistingPersonalMount =
      existingMountId !== null &&
      personalAppSetupTargetsExistingPersonalMount(effectiveSource, connectInput);
    if (
      existingMountId &&
      targetsExistingPersonalMount &&
      connectInput.auth_type !== "none" &&
      connectInput.auth_type !== "oauth"
    ) {
      const ok = await args.onReconnectApp(existingMountId, trimmedSecret);
      if (!booleanActionSucceeded(ok)) {
        setError(
          `Couldn't finish setting up ${catalogEntry.name}. Check the token and try again.`,
        );
        return;
      }
      close();
      return;
    }

    if (
      existingMountId &&
      targetsExistingPersonalMount &&
      connectInput.auth_type === "none"
    ) {
      const ok = await args.onRefreshApp(existingMountId);
      if (!booleanActionSucceeded(ok)) {
        setError(
          `Couldn't refresh ${catalogEntry.name}. Try again from this setup modal.`,
        );
        return;
      }
      close();
      return;
    }

    const result = await args.onConnectApp(connectInput);
    if (!result.ok && !result.mount) {
      setError(
        result.error_message ??
          `Couldn't set up ${catalogEntry.name}. Check the requirements and try again.`,
      );
      return;
    }
    close();
  };

  const modalProps = catalogEntry
    ? {
        catalogEntry,
        endpoint,
        authType,
        secret,
        error,
        isSubmitting,
        isOauth: Boolean(isOauth),
        onEndpointChange: setEndpoint,
        onAuthTypeChange: (value: DeveloperAppAuthType) => {
          setAuthType(value);
          setSecret("");
        },
        onSecretChange: setSecret,
        onClearError: () => {
          setError(null);
        },
        onCancel: close,
        onConfirm: confirm,
      }
    : null;

  return {
    open,
    modalProps,
  };
}
