import { useEffect, useState } from "react";
import { bootstrapSession } from "../auth";
import { bootstrapConvexAuthenticatedClient } from "../../../../shared/convexAuthenticatedClient";
import { buildLoginTrampolinePath } from "./loginTrampoline";
import "./AccessSignInRoute.css";

// "Continue with Polynet": a service the community connected (a plugin's
// sign-in page, say) sends the member here. Once they allow it, Polynet
// sends their browser back with a one-time code the service redeems with its
// own key. Nothing is shared until they press Allow.
export const ACCESS_SIGN_IN_PATH = "/connect/polynet";

type Target = {
  found: boolean;
  community?: { id: string; slug: string; name: string };
  service?: { name: string } | null;
  member?: { email: string | null; is_member: boolean; entitled: boolean; status: string } | null;
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return { slug: params.get("community") ?? "", returnUrl: params.get("return_url") ?? "", state: params.get("state") ?? "" };
}

function backTo(returnUrl: string, values: Record<string, string>) {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(values)) if (value) url.searchParams.set(key, value);
  window.location.assign(url.toString());
}

export function AccessSignInRoute() {
  const [{ slug, returnUrl, state }] = useState(readParams);
  const [phase, setPhase] = useState<"loading" | "signin" | "ready" | "sending" | "failed">("loading");
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<{ run: (allow: boolean) => Promise<void> } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await bootstrapSession().catch(() => null);
      if (!alive) return;
      if (!session) { setPhase("signin"); return; }
      const { client: convex, authSubject } = await bootstrapConvexAuthenticatedClient(session);
      const read = await convex.query("communityAccess:getAccessSignInTarget" as any, { authSubject, slug, returnUrl }) as Target;
      if (!alive) return;
      setTarget(read);
      setClient({
        run: async (allow) => {
          if (!allow) { backTo(returnUrl, { error: "access_denied", state }); return; }
          const issued = await convex.mutation("communityAccess:createAccessSignInCode" as any, { authSubject, slug, returnUrl }) as { code: string; return_url: string };
          backTo(issued.return_url, { code: issued.code, state });
        },
      });
      setPhase("ready");
    })().catch(() => { if (alive) setPhase("failed"); });
    return () => { alive = false; };
  }, [slug, returnUrl, state]);

  const decide = async (allow: boolean) => {
    if (!client) return;
    setPhase("sending"); setError(null);
    try { await client.run(allow); }
    catch (cause) {
      const code = String((cause as Error)?.message ?? "");
      setError(code.includes("sign_in_not_a_member") ? "This Polynet account isn't a member of this community. Sign in with the account you joined with."
        : code.includes("sign_in_rate_limited") ? "Too many tries in a minute. Wait a moment and try again."
        : "That didn't work. Try again, or go back and use a key instead.");
      setPhase("ready");
    }
  };

  const service = target?.service?.name ?? "This app";
  const community = target?.community?.name ?? "your community";
  const member = target?.member ?? null;
  const unusable = phase === "ready" && (!target?.found || !target.service);

  return <main className="access-signin">
    <section className="access-signin-card" aria-labelledby="access-signin-title">
      <p className="access-signin-kicker">Continue with Polynet</p>
      {phase === "loading" ? <p role="status">Checking your account…</p>
        : phase === "signin" ? <>
          <h1 id="access-signin-title">Sign in to continue</h1>
          <p>Use the Polynet account you joined the community with.</p>
          <a className="platform-save-button access-signin-primary" href={buildLoginTrampolinePath(`${window.location.pathname}${window.location.search}`)}>Sign in to Polynet</a>
        </>
        : phase === "failed" ? <>
          <h1 id="access-signin-title">Something went wrong</h1>
          <p>Go back to the app and try connecting again.</p>
        </>
        : unusable ? <>
          <h1 id="access-signin-title">This app isn't connected here</h1>
          <p>{target?.found ? `${community} hasn't connected this app to Polynet sign-in.` : "This community wasn't found."} Go back and use a key instead.</p>
        </>
        : <>
          <h1 id="access-signin-title">{service} wants to check your {community} membership</h1>
          <ul className="access-signin-shares">
            <li>Your email{member?.email ? <> (<strong>{member.email}</strong>)</> : null}</li>
            <li>Whether your membership is active, and until when</li>
          </ul>
          <p className="access-signin-note">It can't see your messages, posts or payment details.</p>
          {member && !member.is_member ? <p className="access-signin-warn" role="alert">This account isn't a member of {community}. Sign in with the account you joined with.</p>
            : member && !member.entitled ? <p className="access-signin-warn">Your membership doesn't include {service} right now, so it will ask you to renew or upgrade.</p> : null}
          {error ? <p className="access-signin-warn" role="alert">{error}</p> : null}
          <div className="access-signin-actions">
            <button type="button" className="platform-save-button access-signin-primary" disabled={phase === "sending" || (member ? !member.is_member : false)} onClick={() => void decide(true)}>
              {phase === "sending" ? "Connecting…" : "Allow"}
            </button>
            <button type="button" className="access-signin-cancel" disabled={phase === "sending"} onClick={() => void decide(false)}>Cancel</button>
          </div>
        </>}
    </section>
  </main>;
}
