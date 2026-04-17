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

type WorkOsSessionReadOptions = {
  forceRefresh?: boolean;
};

type WorkOsRuntimeContextValue = {
  isEnabled: boolean;
  isLoading: boolean;
  user: User | null;
  authenticationMethod: AuthenticationMethod | null;
  readSession: (options?: WorkOsSessionReadOptions) => Promise<AuthSession | null>;
  signIn: () => Promise<void>;
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
  signIn: async () => {
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

function coerceAuthSessionUser(user: User): AuthSession["user"] {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: user.id,
    email: user.email || undefined,
    displayName: displayName || undefined,
    avatarUrl: user.profilePictureUrl || undefined,
  };
}

async function buildAuthSessionFromAccessToken(args: {
  user: User | null;
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string>;
  forceRefresh?: boolean;
}): Promise<AuthSession | null> {
  if (!args.user) return null;
  const accessToken = await args.getAccessToken({ forceRefresh: args.forceRefresh });
  const claims = getClaims(accessToken);
  const expiresAt = Number(claims.exp ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new Error("workos_access_token_missing_exp");
  }
  return {
    access_token: accessToken,
    expires_at: Math.floor(expiresAt),
    user: coerceAuthSessionUser(args.user),
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

  const signIn = useCallback(async (): Promise<void> => {
    await auth.signIn();
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
