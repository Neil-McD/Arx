import { useEffect, useMemo, useState } from "react";
import { beginOAuthSignIn } from "../auth";
import { WaitScreen } from "../components/WaitScreen";
import {
  applyShellVariantToAppPath,
  DEFAULT_POST_SIGN_IN_PATH,
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

  // The shared in-between screen (WaitScreen.tsx): "Taking you to sign in…"
  // while the redirect runs; if it stalls, one button to carry on; if sign-in
  // couldn't start, one plain line and Try again.
  if (error) {
    return <WaitScreen line="We couldn't start sign-in. Try again." action={{ label: "Try again", onClick: () => window.location.reload() }} />;
  }
  if (signInUrl && showManualContinue) {
    return <WaitScreen line="Taking you to sign in…" action={{ label: "Continue to sign in", onClick: () => window.location.replace(signInUrl) }} />;
  }
  return <WaitScreen line="Taking you to sign in…" />;
}
