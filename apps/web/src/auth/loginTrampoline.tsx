import { useEffect, useMemo, useState } from "react";
import { beginOAuthSignIn } from "../auth";
import {
  applyShellVariantToAppPath,
  DEFAULT_POST_SIGN_IN_PATH,
  MOBILE_SHELL_PATH_PREFIX,
  readShellVariantFromPathname,
  stripShellVariantFromPathname,
} from "../../../../shared/webAppRouteState";

function defaultPostSignInPathForShell(shellVariant: "standard" | "mobile"): string {
  return applyShellVariantToAppPath(DEFAULT_POST_SIGN_IN_PATH, shellVariant);
}

function sanitizeReturnToPath(raw: string | null | undefined, shellVariant: "standard" | "mobile"): string {
  const fallback = defaultPostSignInPathForShell(shellVariant);
  const normalized = String(raw ?? "").trim();
  if (!normalized) return fallback;
  try {
    const parsed = new URL(normalized, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}` || fallback;
  } catch {
    return fallback;
  }
}

export function isLoginTrampolinePathname(pathname: string): boolean {
  return stripShellVariantFromPathname(pathname || "/") === "/login";
}

export function buildLoginTrampolinePath(returnTo: string): string {
  const shellVariant = readShellVariantFromPathname(window.location.pathname || "/");
  const basePath = shellVariant === "mobile" ? `${MOBILE_SHELL_PATH_PREFIX}/login` : "/login";
  const url = new URL(basePath, window.location.origin);
  url.searchParams.set("returnTo", sanitizeReturnToPath(returnTo, shellVariant));
  return `${url.pathname}${url.search}`;
}

function readLoginRouteReturnTo(): string {
  const shellVariant = readShellVariantFromPathname(window.location.pathname || "/");
  const params = new URLSearchParams(window.location.search);
  return sanitizeReturnToPath(params.get("returnTo"), shellVariant);
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Sign-in failed.";
}

export function LoginTrampolineRoute() {
  const [error, setError] = useState<string | null>(null);
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [showManualContinue, setShowManualContinue] = useState(false);
  const returnTo = useMemo(() => readLoginRouteReturnTo(), []);

  useEffect(() => {
    console.info("[auth][probe] login_trampoline_entered", { returnTo });
    void beginOAuthSignIn({
      returnTo,
    })
      .then((url) => {
        if (!url.ok) {
          setError(url.error);
          setSignInUrl(null);
          setShowManualContinue(true);
          return;
        }
        const normalized = String(url.authUrl ?? "").trim();
        if (!normalized) {
          setError("Sign-in URL could not be prepared.");
          setSignInUrl(null);
          setShowManualContinue(true);
          return;
        }
        setSignInUrl(normalized);
        setError(null);
        setShowManualContinue(false);
      })
      .catch((signInError) => {
        console.warn("[auth][probe] login_trampoline_signin_failed", signInError);
        setError(formatError(signInError));
        setSignInUrl(null);
        setShowManualContinue(true);
      });
  }, [returnTo]);

  useEffect(() => {
    if (!signInUrl) return;
    setShowManualContinue(false);
    console.info("[auth][probe] login_trampoline_redirect_dispatched", { returnTo });
    const fallbackTimer = window.setTimeout(() => {
      setShowManualContinue(true);
    }, 1200);
    const redirectTimer = window.setTimeout(() => {
      window.location.replace(signInUrl);
    }, 0);
    return () => {
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [returnTo, signInUrl]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#09090b",
        color: "#f5f7fb",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(100%, 420px)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(18,18,22,0.94)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Redirecting to sign in</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(245,247,251,0.78)" }}>
          {signInUrl && !showManualContinue
            ? "Polynet is redirecting you to sign in and will bring you back to your original page."
            : signInUrl
              ? "If the redirect does not continue automatically, use the button below."
              : "Polynet is preparing the sign-in handoff and will return you to your original page."}
        </div>
        {signInUrl && showManualContinue ? (
          <button
            type="button"
            onClick={() => window.location.replace(signInUrl)}
            style={{
              marginTop: 16,
              width: "100%",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "#f5f7fb",
              color: "#0b0c10",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
              padding: "13px 14px",
            }}
          >
            Continue to sign in
          </button>
        ) : null}
        {error ? (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,120,120,0.24)",
              background: "rgba(120,20,20,0.14)",
              color: "#ffb4b4",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
