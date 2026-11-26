// Sign in with Polynet (/oauth/authorize): OAuth 2.1 + PKCE S256 consent screen
// for connected apps. Never redirects to an unverified redirect_uri; if signed
// out, bounces through /login?returnTo=... so the user returns right here.
import { useEffect, useMemo, useState } from "react";
import { bootstrapSessionDetailed, type AuthSession } from "../auth";
import {
  approveConnectedAppAuthorization,
  fetchConnectedAppAuthorizeContext,
  type ConnectedAppAuthorizeContext,
} from "../../../../shared/cloudConnectedAppsGateway";
import {
  OAUTH_JOIN_RETURN_STORAGE_KEY,
  SETUP_RETURN_TARGET_STORAGE_KEY,
  sanitizeOAuthAuthorizeReturnPath,
  stripShellVariantFromPathname,
} from "../../../../shared/webAppRouteState";
import "./WebCommunityLandingPage.css";

export function isConnectedAppAuthorizePathname(pathname: string): boolean {
  const stripped = stripShellVariantFromPathname(pathname || "/").replace(/\/+$/, "") || "/";
  return stripped === "/oauth/authorize";
}

export function buildOAuthRedirectUrl(
  redirectUri: string,
  params: { code?: string; error?: string; state?: string | null },
): string {
  const target = new URL(redirectUri);
  if (params.code) target.searchParams.set("code", params.code);
  if (params.error) target.searchParams.set("error", params.error);
  if (params.state) target.searchParams.set("state", params.state);
  return target.toString();
}

function errorMessageForCode(code: string): string {
  switch (code) {
    case "invalid_client":
      return "This app isn't connected to an active Polynet community.";
    case "invalid_redirect_uri":
      return "This sign-in callback address isn't registered for this app in Polynet Settings.";
    case "invalid_pkce":
      return "This app's sign-in request is missing a valid PKCE S256 challenge.";
    case "invalid_response_type":
      return "This app requested an unsupported sign-in response type.";
    default:
      return "This sign-in link isn't valid. Go back to the app and try again.";
  }
}

export function WebConnectedAppAuthorizePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [context, setContext] = useState<ConnectedAppAuthorizeContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      responseType: String(params.get("response_type") ?? "").trim(),
      clientId: String(params.get("client_id") ?? "").trim(),
      redirectUri: String(params.get("redirect_uri") ?? "").trim(),
      codeChallenge: String(params.get("code_challenge") ?? "").trim(),
      codeChallengeMethod: String(params.get("code_challenge_method") ?? "").trim(),
      state: params.get("state"),
      authError: params.get("error"),
      authErrorDescription: params.get("error_description"),
    };
  }, []);

  const cleanRetryHref = useMemo(() => {
    const clean = new URLSearchParams(window.location.search);
    clean.delete("error");
    clean.delete("error_description");
    const search = clean.toString();
    const returnTo = `${window.location.pathname}${search ? `?${search}` : ""}`;
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const paramError = useMemo(() => {
    if (query.responseType !== "code") return "invalid_response_type";
    if (!query.clientId) return "invalid_client";
    if (!query.redirectUri) return "invalid_redirect_uri";
    if (query.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(query.codeChallenge)) {
      return "invalid_pkce";
    }
    return null;
  }, [query]);

  useEffect(() => {
    if (paramError) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    void bootstrapSessionDetailed()
      .then((result) => {
        if (cancelled) return;
        if (!result.session) {
          // Never auto-redirect in a loop if the upstream login returned an error.
          if (query.authError) {
            setError(query.authErrorDescription || "Sign-in didn't complete. Try signing in again.");
            setCheckingSession(false);
            return;
          }
          window.location.replace(cleanRetryHref);
          return;
        }
        setLoadingContext(true);
        setSession(result.session);
        setCheckingSession(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't verify your Polynet session. Refresh and try again.");
        setCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, [paramError, query.authError, query.authErrorDescription, cleanRetryHref]);

  useEffect(() => {
    if (!session || paramError) return;
    let cancelled = false;
    setLoadingContext(true);
    void fetchConnectedAppAuthorizeContext({
      session,
      clientId: query.clientId,
      redirectUri: query.redirectUri,
      codeChallenge: query.codeChallenge,
      codeChallengeMethod: query.codeChallengeMethod,
    })
      .then((next) => {
        if (cancelled) return;
        setContext(next);
        if (next.ok) document.title = `Sign in to ${next.app.name} · Polynet`;
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load sign-in details. Refresh and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => { cancelled = true; };
  }, [session, paramError, query]);

  const handleApprove = async () => {
    if (!session || !context || !context.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const approved = await approveConnectedAppAuthorization({
        session,
        clientId: query.clientId,
        redirectUri: context.redirect_uri,
        codeChallenge: query.codeChallenge,
        codeChallengeMethod: query.codeChallengeMethod,
      });
      window.location.assign(
        buildOAuthRedirectUrl(approved.redirect_uri, {
          code: approved.code,
          state: query.state,
        }),
      );
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : String(failure ?? "");
      setError(
        code.includes("verified_email_required")
          ? "Verify your email in Polynet before signing in to connected apps."
          : code.includes("account_setup_required")
            ? "Finish setting up your Polynet account before signing in to connected apps."
            : code.includes("community_user_blocked")
              ? "You can't sign in to this community's connected app."
              : code.includes("rate_limited")
                ? "Too many sign-in attempts. Wait a minute and try again."
                : "Couldn't finish signing in. Try again.",
      );
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (!context || !context.ok || busy) return;
    window.location.assign(
      buildOAuthRedirectUrl(context.redirect_uri, {
        error: "access_denied",
        state: query.state,
      }),
    );
  };

  const renderCard = () => {
    if (paramError) {
      return (
        <div className="cl-card">
          <h1 className="cl-card-title">Sign-in link isn&apos;t valid</h1>
          <p className="cl-card-note">{errorMessageForCode(paramError)}</p>
          <a className="cl-secondary" href="/">Go to Polynet</a>
        </div>
      );
    }
    if (checkingSession || loadingContext || (session && !context && !error)) {
      return (
        <div className="cl-card">
          <h1 className="cl-card-title"><span className="cl-spin" aria-hidden="true" />Checking sign-in…</h1>
          <p className="cl-card-note">Preparing your Polynet connection.</p>
        </div>
      );
    }
    if (context && !context.ok) {
      return (
        <div className="cl-card">
          <h1 className="cl-card-title">Can&apos;t sign in to this app</h1>
          <p className="cl-card-note">{errorMessageForCode(context.error)}</p>
          <a className="cl-secondary" href="/">Go to Polynet</a>
        </div>
      );
    }
    if (!context || !context.ok) {
      return (
        <div className="cl-card">
          <h1 className="cl-card-title">{!session && query.authError ? "Sign-in didn't finish" : "Couldn't load sign-in"}</h1>
          <p className="cl-card-note">{error ?? "Refresh and try again."}</p>
          {!session ? (
            <a className="cl-primary" href={cleanRetryHref}>Try signing in again</a>
          ) : (
            <button type="button" className="cl-primary" onClick={() => window.location.reload()}>Try again</button>
          )}
        </div>
      );
    }

    const { app, community, user, access } = context;
    const setupRequired = Boolean(user.setup_required);
    const cannotApprove = !user.email_verified || user.is_blocked || setupRequired;
    const joinUrl = `/c/${encodeURIComponent(community.slug)}?app=${encodeURIComponent(app.app_id)}`;
    const currentAuthorizePath = sanitizeOAuthAuthorizeReturnPath(
      `${window.location.pathname}${window.location.search}`,
      app.app_id,
    );
    const rememberAuthorizeForJoin = () => {
      if (!currentAuthorizePath) return;
      try {
        window.sessionStorage.setItem(
          OAUTH_JOIN_RETURN_STORAGE_KEY,
          JSON.stringify({ appId: app.app_id, path: currentAuthorizePath, savedAt: Date.now() }),
        );
      } catch {
        // Storage blocked: fall back to direct /c/:slug?app=...
      }
    };
    const handleFinishSetup = () => {
      if (currentAuthorizePath) {
        try {
          window.sessionStorage.setItem(
            SETUP_RETURN_TARGET_STORAGE_KEY,
            JSON.stringify({ kind: "oauth", path: currentAuthorizePath }),
          );
        } catch {
          // Ignore storage error and proceed to onboarding.
        }
      }
      window.location.assign("/onboarding?oauth=1");
    };

    return (
      <div className="cl-card">
        <h1 className="cl-card-title">Sign in to {app.name}</h1>
        <p className="cl-card-note">
          Connected to <strong>{community.name}</strong>. Continuing shares your Polynet account ID, verified email
          {user.email ? ` (${user.email})` : ""}, display name, and membership access in {community.name}.
        </p>
        <div className="cl-tile">
          <div className="cl-tile-label">Your status in {community.name}</div>
          <div className="cl-row">
            <span>{user.display_name || user.email || "Your account"}</span>
            <span className="cl-dim">
              {user.is_blocked
                ? "Blocked"
                : access.allowed
                  ? access.tier?.name ?? "Member"
                  : "Not a member yet"}
            </span>
          </div>
        </div>
        {user.is_blocked ? (
          <p className="cl-error" role="alert">You don&apos;t have access to {community.name}.</p>
        ) : !user.email_verified ? (
          <p className="cl-error" role="alert">A verified email address is required to sign in to connected apps.</p>
        ) : setupRequired ? (
          <p className="cl-card-note">
            Finish setting up your Polynet profile and terms before signing in to {app.name}.
          </p>
        ) : !access.allowed ? (
          <p className="cl-fine">
            You aren&apos;t a member of {community.name} yet. You can still sign in now, or{" "}
            <a href={joinUrl} onClick={rememberAuthorizeForJoin}>join {community.name} first</a>.
          </p>
        ) : null}
        {error ? <p className="cl-error" role="alert">{error}</p> : null}
        {setupRequired && !user.is_blocked && user.email_verified ? (
          <button
            type="button"
            className="cl-primary"
            disabled={busy}
            onClick={handleFinishSetup}
          >
            Finish setup
          </button>
        ) : (
          <button
            type="button"
            className="cl-primary"
            disabled={busy || cannotApprove}
            onClick={() => void handleApprove()}
          >
            {busy ? `Signing in to ${app.name}…` : `Continue to ${app.name}`}
          </button>
        )}
        <button
          type="button"
          className="cl-secondary"
          disabled={busy}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    );
  };

  return (
    <div className="cl-page">
      <header className="cl-top">
        <a href="/" className="cl-brand">Polynet</a>
      </header>
      <main style={{ maxWidth: 440, margin: "64px auto 48px", padding: "0 20px" }}>
        {renderCard()}
      </main>
    </div>
  );
}
