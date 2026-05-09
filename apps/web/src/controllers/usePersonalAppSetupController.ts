import { useState } from "react";

import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import type {
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

type PersonalAppSetupTarget = {
  app: {
    endpoint_url?: string | null;
    auth_type?: string | null;
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
  onConnectApp: (
    input: ConnectUserPlatformAppInput,
  ) => Promise<ConnectUserPlatformAppResult>;
  onBeginOAuth: (
    catalogAppId: string,
  ) => Promise<BeginUserPlatformAppOAuthResult>;
  onRefreshApp: (
    userPlatformAppMountId: string,
  ) => Promise<boolean> | Promise<void> | boolean | void;
  onReconnectApp: (
    userPlatformAppMountId: string,
    secret: string,
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
  const isSubmitting =
    args.isConnecting ||
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
      !openArgs.catalogEntry ||
      !isDiscoverAppPersonallyConnectable(openArgs.catalogEntry)
    ) {
      args.onUnavailable();
      return { opened: false, reason: "not_connectable" };
    }
    const readyCatalogEntry = openArgs.catalogEntry;
    const initialEndpoint =
      readyCatalogEntry.personalConnect.connectionKind === "custom"
        ? (openArgs.source.app.endpoint_url ?? "")
        : readyCatalogEntry.personalConnect.endpointUrl;
    setSetupState({
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
  };

  const confirm = async () => {
    if (!setupState || !catalogEntry) return;
    setError(null);
    if (!isDiscoverAppPersonallyConnectable(catalogEntry)) {
      setError("This app is not ready for setup yet.");
      return;
    }
    if (isOauth) {
      const result = await args.onBeginOAuth(catalogEntry.id);
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
