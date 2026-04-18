import {
  AuthKitProvider,
  LoginRequiredError,
  getClaims,
  useAuth,
  type AuthenticationMethod,
  type User,
} from "@workos-inc/authkit-react";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { AuthSession } from "../../../../shared/authCore";
import { DEFAULT_POST_SIGN_IN_PATH } from "../../../../shared/webAppRouteState";

type WorkOsSessionReadOptions = {
  forceRefresh?: boolean;
};

type WorkOsSignInOptions = {
  state?: Record<string, unknown> | null;
};

type WorkOsRuntimeContextValue = {
  isEnabled: boolean;
  isLoading: boolean;
  user: User | null;
  authenticationMethod: AuthenticationMethod | null;
  readSession: (options?: WorkOsSessionReadOptions) => Promise<AuthSession | null>;
  signIn: (options?: WorkOsSignInOptions) => Promise<void>;
  signOut: (options?: { returnTo?: string }) => Promise<void>;
};

type WorkOsConfig = {
  clientId: string | null;
  apiHostname: string | null;
  redirectUri: string | null;
  devMode: boolean;
};

const DISABLED_RUNTIME: WorkOsRuntimeContextValue = {
  isEnabled: false,
  isLoading: false,
  user: null,
  authenticationMethod: null,
  readSession: async () => null,
  signIn: async (_options?: WorkOsSignInOptions) => {
    throw new Error("workos_auth_not_configured");
  },
  signOut: async () => {},
};

const WorkOsRuntimeContext = createContext<WorkOsRuntimeContextValue>(DISABLED_RUNTIME);

function readStringEnv(key: string): string | null {
  const value = String(import.meta.env[key as keyof ImportMetaEnv] ?? "").trim();
  return value || null;
}

function readBoolEnv(key: string): boolean | null {
  const normalized = String(import.meta.env[key as keyof ImportMetaEnv] ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return null;
}

function readWorkOsConfig(): WorkOsConfig {
  const clientId = readStringEnv("VITE_WORKOS_CLIENT_ID");
  const apiHostname = readStringEnv("VITE_WORKOS_API_HOSTNAME");
  const redirectUri = readStringEnv("VITE_WORKOS_REDIRECT_URI");
  const explicitDevMode = readBoolEnv("VITE_WORKOS_DEV_MODE");
  return {
    clientId,
    apiHostname,
    redirectUri,
    devMode: explicitDevMode ?? !apiHostname,
  };
}

function sanitizeRedirectReturnTo(raw: unknown): string {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return DEFAULT_POST_SIGN_IN_PATH;
  try {
    const parsed = new URL(normalized, window.location.origin);
    if (parsed.origin !== window.location.origin) return DEFAULT_POST_SIGN_IN_PATH;
    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}` || DEFAULT_POST_SIGN_IN_PATH;
  } catch {
    return DEFAULT_POST_SIGN_IN_PATH;
  }
}

function coerceAuthSessionUser(user: User): AuthSession["user"] {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: user.id,
    email: user.email || undefined,
    displayName: displayName || undefined,
    avatarUrl: user.profilePictureUrl || undefined,
  };
}

function readClaimString(claims: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function coerceAuthSessionUserFromClaims(claims: Record<string, unknown>): AuthSession["user"] | null {
  const id = readClaimString(claims, ["sub"]);
  if (!id) return null;
  const fullNameFromParts = [readClaimString(claims, ["given_name", "givenName"]), readClaimString(claims, ["family_name", "familyName"])]
    .filter(Boolean)
    .join(" ")
    .trim();
  const directDisplayName = readClaimString(claims, ["name", "display_name", "displayName"]);
  const displayName = directDisplayName ?? (fullNameFromParts || undefined);
  return {
    id,
    email: readClaimString(claims, ["email"]) ?? undefined,
    displayName: displayName || undefined,
    avatarUrl:
      readClaimString(claims, ["picture", "picture_url", "pictureUrl", "profile_picture_url", "profilePictureUrl"]) ??
      undefined,
  };
}

async function buildAuthSessionFromAccessToken(args: {
  user: User | null;
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string>;
  forceRefresh?: boolean;
}): Promise<AuthSession | null> {
  const accessToken = await args.getAccessToken({ forceRefresh: args.forceRefresh });
  const claims = getClaims(accessToken) as Record<string, unknown>;
  const expiresAt = Number(claims.exp ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new Error("workos_access_token_missing_exp");
  }
  const fallbackUser = coerceAuthSessionUserFromClaims(claims);
  const sessionUser = args.user ? coerceAuthSessionUser(args.user) : fallbackUser;
  if (!sessionUser?.id) {
    throw new Error("workos_access_token_missing_sub");
  }
  return {
    access_token: accessToken,
    expires_at: Math.floor(expiresAt),
    user: sessionUser,
  };
}

function WorkOsRuntimeBridge({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const readSession = useCallback(async (options?: WorkOsSessionReadOptions): Promise<AuthSession | null> => {
    return await buildAuthSessionFromAccessToken({
      user: auth.user,
      getAccessToken: auth.getAccessToken,
      forceRefresh: options?.forceRefresh,
    });
  }, [auth.getAccessToken, auth.user]);

  const signIn = useCallback(async (options?: WorkOsSignInOptions): Promise<void> => {
    await auth.signIn({
      ...(options?.state ? { state: options.state } : {}),
    });
  }, [auth]);

  const signOut = useCallback(async (options?: { returnTo?: string }): Promise<void> => {
    await auth.signOut({
      navigate: false,
      ...(options?.returnTo ? { returnTo: options.returnTo } : {}),
    });
  }, [auth]);

  const value = useMemo<WorkOsRuntimeContextValue>(() => ({
    isEnabled: true,
    isLoading: auth.isLoading,
    user: auth.user,
    authenticationMethod: auth.authenticationMethod,
    readSession,
    signIn,
    signOut,
  }), [
    auth.authenticationMethod,
    auth.isLoading,
    auth.user,
    readSession,
    signIn,
    signOut,
  ]);

  return (
    <WorkOsRuntimeContext.Provider value={value}>
      {children}
    </WorkOsRuntimeContext.Provider>
  );
}

export function WorkOsRuntimeProvider({ children }: { children: ReactNode }) {
  const config = readWorkOsConfig();
  if (!config.clientId) {
    return (
      <WorkOsRuntimeContext.Provider value={DISABLED_RUNTIME}>
        {children}
      </WorkOsRuntimeContext.Provider>
    );
  }

  return (
    <AuthKitProvider
      clientId={config.clientId}
      {...(config.apiHostname ? { apiHostname: config.apiHostname } : {})}
      {...(config.redirectUri ? { redirectUri: config.redirectUri } : {})}
      {...(config.devMode ? { devMode: true } : {})}
      onRedirectCallback={(response) => {
        const returnTo = sanitizeRedirectReturnTo(response.state?.returnTo);
        console.info("[auth][workos] redirect_callback", {
          authenticationMethod: response.authenticationMethod,
          userId: response.user.id,
          organizationId: response.organizationId ?? null,
          returnTo,
        });
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (returnTo !== currentPath) {
          window.location.replace(returnTo);
        }
      }}
      onRefresh={(response) => {
        console.info("[auth][workos] refresh_success", {
          authenticationMethod: response.authenticationMethod,
          userId: response.user.id,
          organizationId: response.organizationId ?? null,
        });
      }}
      onRefreshFailure={() => {
        console.warn("[auth][workos] refresh_failure");
      }}
    >
      <WorkOsRuntimeBridge>{children}</WorkOsRuntimeBridge>
    </AuthKitProvider>
  );
}

export function useWorkOsRuntime(): WorkOsRuntimeContextValue {
  return useContext(WorkOsRuntimeContext);
}

export function isWorkOsLoginRequiredError(error: unknown): boolean {
  return error instanceof LoginRequiredError;
}
