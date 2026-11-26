// Your app (one door, slice 2a): connect the builder's own app to this
// community. The app asks Polynet what someone has here, server to server
// with its secret, and hears when that changes. Secrets are shown once.
import { useCallback, useEffect, useState } from "react";
import { announceCommunityAppLinksChanged, COMMUNITY_PLANS_CHANGED_EVENT } from "../controllers/communityAppLinks";
import connectYourAppGuide from "../../../../docs/product/guides/connect-your-app.md?raw";
import {
  buildCommunityPlanCheckoutUrl,
  buildConnectedAppSetupPrompt,
  buildCustomLandingPagePrompt,
  buildUnifiedGateAppPrompt,
} from "../../../../shared/connectedAppSetupPrompt";
import { fetchCloudCommunityTiers, type CloudCommunityTier } from "../../../../shared/cloudCommunityTiersGateway";
import {
  fetchCloudConnectedApps,
  registerCloudConnectedApp,
  revokeCloudConnectedApp,
  rotateCloudConnectedAppSecret,
  updateCloudConnectedApp,
  type CloudConnectedApp,
} from "../../../../shared/cloudConnectedAppsGateway";
import { SettingsButton, SettingsGroup, SettingsNote, SettingsRow, settingsButtonClass } from "./SettingsRows";

type Shown = { appId: string; secret: string; signingSecret?: string };

function apiOrigin(): string {
  // The access check lives on Polynet's backend (the Convex site URL).
  const convex = String((import.meta as any).env?.VITE_CONVEX_URL ?? "");
  return convex ? convex.replace(".convex.cloud", ".convex.site") : "";
}

export function CommunityConnectedAppsSection(props: { communityId: string; communityName?: string; communitySlug?: string; communityOneLiner?: string | null; session: unknown; ensureSession: (session: any) => Promise<any | null> }) {
  const [apps, setApps] = useState<CloudConnectedApp[] | null>(null);
  const [adding, setAdding] = useState<{ name: string; appUrl: string; webhookUrl: string } | null>(null);
  // One address at a time: where members open the app, where webhooks go, or adding a Sign in with Polynet callback.
  const [editing, setEditing] = useState<{ appId: string; field: "appUrl" | "webhookUrl" | "addRedirect"; url: string } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<CloudCommunityTier[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const withSession = async <T,>(work: (session: any) => Promise<T>): Promise<T | null> => {
    const session = await props.ensureSession(props.session);
    return session ? await work(session) : null;
  };
  const load = useCallback(async () => {
    try { setApps(await withSession((session) => fetchCloudConnectedApps({ session, communityId: props.communityId })) ?? []); } catch { setApps(null); }
    try { setTiers((await withSession((session) => fetchCloudCommunityTiers({ session, communityId: props.communityId }))) ?? []); } catch { setTiers([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId]);
  useEffect(() => { void load(); }, [load]);
  // Plans edited alongside: the setup prompt carries them as they are now.
  useEffect(() => {
    const reload = () => { void load(); };
    window.addEventListener(COMMUNITY_PLANS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(COMMUNITY_PLANS_CHANGED_EVENT, reload);
  }, [load]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await work(); await load(); announceCommunityAppLinksChanged(); }
    catch (failure) {
      const code = String((failure as Error)?.message ?? "");
      setError(code.includes("webhook_url_invalid") ? "Use your app's public https address for webhooks."
        : code.includes("redirect_url_invalid") ? "Use a public https callback URL (or http://localhost for local dev) with no # fragment."
        : code.includes("redirect_urls_full") ? "Each app can register up to five sign-in callback URLs."
        : code.includes("connected_app_url_invalid") ? "Use your app's public https address."
        : code.includes("apps_full") ? "A community can connect up to three apps."
          : code.includes("name_required") ? "Give your app a name." : "Couldn't save. Try again.");
    } finally { setBusy(false); }
  };

  if (!apps) return null;
  const origin = apiOrigin();
  const communityUrl = props.communitySlug ? `${window.location.origin}/c/${encodeURIComponent(props.communitySlug)}` : null;
  const activeTiers = tiers.filter((tier) => !tier.archived).map((tier) => ({ key: tier.key, name: tier.name, grants: tier.grants }));
  const copyText = (key: string, text: string, fallbackError = "Couldn't copy. Try again.") => {
    void navigator.clipboard?.writeText(text).then(
      () => { setCopied(key); window.setTimeout(() => setCopied(null), 2000); },
      () => setError(fallbackError),
    );
  };
  const copyPrompt = (app: CloudConnectedApp) => {
    const prompt = buildConnectedAppSetupPrompt({
      communityName: props.communityName ?? "your community", appName: app.name, appId: app.app_id, apiOrigin: origin,
      hasWebhook: Boolean(app.webhook_url), guide: connectYourAppGuide, communityUrl, hasAppLink: Boolean(app.app_url),
      tiers: activeTiers,
    });
    copyText(app.app_id, prompt, "Couldn't copy. Open the guide instead.");
  };
  const copyUnifiedGatePrompt = (app: CloudConnectedApp) => {
    if (!communityUrl) return;
    const prompt = buildUnifiedGateAppPrompt({
      communityName: props.communityName ?? "your community",
      appName: app.name,
      appId: app.app_id,
      appOrigin: window.location.origin,
      apiOrigin: origin,
      communityUrl,
      redirectUrls: app.redirect_urls ?? [],
      hasWebhook: Boolean(app.webhook_url),
      tiers: activeTiers,
    });
    copyText(`unified:${app.app_id}`, prompt);
  };
  const copyLandingPagePrompt = () => {
    if (!communityUrl || !props.communitySlug) return;
    const primaryApp = apps[0] ?? null;
    const prompt = buildCustomLandingPagePrompt({
      communityName: props.communityName ?? "your community",
      communitySlug: props.communitySlug,
      communityUrl,
      oneLiner: props.communityOneLiner ?? null,
      tiers: activeTiers,
      appName: primaryApp?.name ?? null,
      appUrl: primaryApp?.app_url ?? null,
      appId: primaryApp?.app_id ?? null,
    });
    copyText("landing-page", prompt, "Couldn't copy the landing page prompt. Try again.");
  };
  const addressRow = (app: CloudConnectedApp, field: "appUrl" | "webhookUrl") => {
    const isApp = field === "appUrl";
    const value = isApp ? app.app_url : app.webhook_url;
    const open = editing?.appId === app.app_id && editing.field === field;
    return (
      <SettingsRow label={isApp ? "App address" : "Webhook"}
        help={open ? undefined : value ?? (isApp ? "Not set: no link in your community yet." : "Not set.")}
        stacked={open}>
        {open ? (
          <span className="settings-v1-inline-edit">
            <input className="settings-v1-input" value={editing!.url} autoFocus inputMode="url"
              aria-label={isApp ? "App address" : "Webhook address"}
              placeholder={isApp ? "https://your-app.com" : "https://your-app.com/polynet/webhook"}
              onChange={(event) => setEditing({ ...editing!, url: event.target.value })} />
            <SettingsButton variant="quiet" onClick={() => setEditing(null)}>Cancel</SettingsButton>
            <SettingsButton variant="primary" disabled={busy} onClick={() => void run(async () => {
              await withSession((session) => updateCloudConnectedApp({ session, communityId: props.communityId, appId: app.app_id, [field]: editing!.url.trim() }));
              setEditing(null);
            })}>Save</SettingsButton>
          </span>
        ) : (
          <SettingsButton disabled={busy} onClick={() => setEditing({ appId: app.app_id, field, url: value ?? "" })}>{value ? "Change" : "Add"}</SettingsButton>
        )}
      </SettingsRow>
    );
  };
  // Design v1, rows: each connected app is a group; connecting one opens its
  // fields below; the setup prompt for your AI comes last.
  return (
    <>
      {shown ? (
        <SettingsGroup label="Copy these now. They won't be shown again.">
          <SettingsRow label="App secret" help="Keep it on your server." stacked><code className="settings-v1-code">{shown.secret}</code></SettingsRow>
          {shown.signingSecret ? <SettingsRow label="Webhook signing secret" stacked><code className="settings-v1-code">{shown.signingSecret}</code></SettingsRow> : null}
          <SettingsRow label="">
            <SettingsButton variant="primary" onClick={() => setShown(null)}>I've saved them</SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
      {apps.map((app) => (
        <SettingsGroup key={app.app_id} label={app.name}>
          <SettingsRow label="App ID" help={`Secret ends ${app.secret_hint}`}>
            <span className="settings-v1-value is-mono">{app.app_id}</span>
          </SettingsRow>
          {addressRow(app, "appUrl")}
          {addressRow(app, "webhookUrl")}
          <SettingsRow
            label="Sign-in callbacks"
            help={
              editing?.appId === app.app_id && editing.field === "addRedirect"
                ? undefined
                : (app.redirect_urls?.length ?? 0) > 0
                  ? `${app.redirect_urls.length} registered for Sign in with Polynet.`
                  : "Needed only if your app uses Sign in with Polynet."
            }
            stacked={(app.redirect_urls?.length ?? 0) > 0 || (editing?.appId === app.app_id && editing.field === "addRedirect")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              {(app.redirect_urls ?? []).map((url) => (
                <div key={url} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="settings-v1-value is-mono" style={{ overflowWrap: "anywhere" }}>{url}</span>
                  <SettingsButton
                    variant="quiet"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await withSession((session) => updateCloudConnectedApp({
                        session,
                        communityId: props.communityId,
                        appId: app.app_id,
                        redirectUrls: (app.redirect_urls ?? []).filter((item) => item !== url),
                      }));
                    })}
                  >
                    Remove
                  </SettingsButton>
                </div>
              ))}
              {editing?.appId === app.app_id && editing.field === "addRedirect" ? (
                <span className="settings-v1-inline-edit">
                  <input
                    className="settings-v1-input"
                    value={editing.url}
                    autoFocus
                    inputMode="url"
                    aria-label="Sign-in callback address"
                    placeholder="https://your-app.com/api/auth/polynet/callback"
                    onChange={(event) => setEditing({ ...editing, url: event.target.value })}
                  />
                  <SettingsButton variant="quiet" onClick={() => setEditing(null)}>Cancel</SettingsButton>
                  <SettingsButton
                    variant="primary"
                    disabled={busy || !editing.url.trim()}
                    onClick={() => void run(async () => {
                      await withSession((session) => updateCloudConnectedApp({
                        session,
                        communityId: props.communityId,
                        appId: app.app_id,
                        redirectUrls: [...(app.redirect_urls ?? []), editing.url.trim()],
                      }));
                      setEditing(null);
                    })}
                  >
                    Save
                  </SettingsButton>
                </span>
              ) : (app.redirect_urls?.length ?? 0) < 5 ? (
                <div>
                  <SettingsButton
                    disabled={busy}
                    onClick={() => { setError(null); setEditing({ appId: app.app_id, field: "addRedirect", url: "" }); }}
                  >
                    Add callback URL
                  </SettingsButton>
                </div>
              ) : null}
            </div>
          </SettingsRow>
          <SettingsRow label="Secret" help="Makes a new one. The old one stops working.">
            <SettingsButton disabled={busy} onClick={() => void run(async () => {
              const result = await withSession((session) => rotateCloudConnectedAppSecret({ session, communityId: props.communityId, appId: app.app_id }));
              if (result) setShown({ appId: app.app_id, secret: result.secret });
            })}>New secret</SettingsButton>
          </SettingsRow>
          <SettingsRow label="Disconnect" help="Members lose the link, and your app loses access.">
            {confirmRevoke === app.app_id ? (
              <>
                <SettingsButton variant="quiet" onClick={() => setConfirmRevoke(null)}>Keep</SettingsButton>
                <SettingsButton variant="danger" disabled={busy} onClick={() => void run(async () => {
                  await withSession((session) => revokeCloudConnectedApp({ session, communityId: props.communityId, appId: app.app_id }));
                  setConfirmRevoke(null);
                })}>Confirm disconnect</SettingsButton>
              </>
            ) : (
              <SettingsButton variant="danger" disabled={busy} onClick={() => setConfirmRevoke(app.app_id)}>Disconnect</SettingsButton>
            )}
          </SettingsRow>
        </SettingsGroup>
      ))}
      {adding ? (
        <SettingsGroup label="Connect an app">
          <SettingsRow label="Name" htmlFor="app-name">
            <input id="app-name" className="settings-v1-input" value={adding.name} maxLength={60} placeholder="e.g. Distribution Engineer" autoFocus
              onChange={(event) => setAdding({ ...adding, name: event.target.value })} />
          </SettingsRow>
          <SettingsRow label="App address" htmlFor="app-url" help="Members get a link to it in your left column.">
            <input id="app-url" className="settings-v1-input" value={adding.appUrl} placeholder="https://your-app.com" inputMode="url"
              onChange={(event) => setAdding({ ...adding, appUrl: event.target.value })} />
          </SettingsRow>
          <SettingsRow label="Webhook" htmlFor="app-webhook" help="Optional. Where Polynet tells your app about changes.">
            <input id="app-webhook" className="settings-v1-input" value={adding.webhookUrl} placeholder="https://your-app.com/polynet/webhook" inputMode="url"
              onChange={(event) => setAdding({ ...adding, webhookUrl: event.target.value })} />
          </SettingsRow>
          <SettingsRow label="" help={error ? <span className="settings-v1-error" role="alert">{error}</span> : undefined}>
            <SettingsButton variant="quiet" onClick={() => { setAdding(null); setError(null); }}>Cancel</SettingsButton>
            <SettingsButton variant="primary" disabled={busy || !adding.name.trim()} onClick={() => void run(async () => {
              const result = await withSession((session) => registerCloudConnectedApp({ session, communityId: props.communityId, name: adding.name, appUrl: adding.appUrl.trim() || undefined, webhookUrl: adding.webhookUrl.trim() || undefined }));
              if (result) { setShown({ appId: result.app_id, secret: result.secret, signingSecret: result.webhook_signing_secret }); setAdding(null); }
            })}>{busy ? "Connecting…" : "Connect app"}</SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      ) : apps.length < 3 ? (
        <SettingsGroup>
          <SettingsRow label={apps.length ? "Connect another app" : "Connect your app"}
            help="Your app asks Polynet what someone has here (their plan and grants) and hears when that changes. Sales your app makes itself pay no Polynet fee.">
            <SettingsButton variant={apps.length ? "secondary" : "primary"} onClick={() => { setError(null); setAdding({ name: "", appUrl: "", webhookUrl: "" }); }}>Connect an app</SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
      {!adding && error ? <SettingsNote tone="error">{error}</SettingsNote> : null}
      {apps.length && origin ? (
        <SettingsGroup label="Set up with your AI">
          {apps.map((app) => (
            <div key={app.app_id}>
              {communityUrl ? (
                <SettingsRow
                  label={apps.length > 1 ? `Unified gate prompt for ${app.name}` : "New app (Sign in with Polynet)"}
                  help="Building a new app with no separate login or Stripe? Paste this into your AI to wire up Sign in with Polynet, live grant checks, and direct checkout links."
                >
                  <SettingsButton variant="primary" onClick={() => copyUnifiedGatePrompt(app)}>
                    {copied === `unified:${app.app_id}` ? "Copied" : "Copy unified gate prompt"}
                  </SettingsButton>
                </SettingsRow>
              ) : null}
              <SettingsRow
                label={apps.length > 1 ? `Existing app prompt for ${app.name}` : "Existing app (keep your own login & billing)"}
                help="Already have login and Stripe? Paste this into Claude Code, Cursor or Codex to sync sales and read Polynet grants."
              >
                <SettingsButton onClick={() => copyPrompt(app)}>{copied === app.app_id ? "Copied" : "Copy prompt"}</SettingsButton>
              </SettingsRow>
            </div>
          ))}
          <SettingsRow label="API address"><span className="settings-v1-value is-mono">{origin}</span></SettingsRow>
          {communityUrl ? <SettingsRow label="Link to your community" help="Put it in your app; buyers return here or bounce straight back to your app after checkout."><span className="settings-v1-value is-mono">{communityUrl}</span></SettingsRow> : null}
          {communityUrl && activeTiers.length > 0 ? (
            <SettingsRow label="Direct plan checkout links" help="Pre-select a plan and return buyers to your app after checkout." stacked>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                {activeTiers.map((tier) => {
                  const returnAppId = apps.find((item) => Boolean(item.app_url))?.app_id ?? null;
                  const link = buildCommunityPlanCheckoutUrl({
                    communityUrl,
                    tierKey: tier.key,
                    appId: returnAppId,
                  });
                  const copyKey = `plan:${tier.key}`;
                  return (
                    <div key={tier.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span className="settings-v1-value is-mono" style={{ overflowWrap: "anywhere" }}>
                        {tier.name}: {link}
                      </span>
                      <SettingsButton onClick={() => copyText(copyKey, link)}>
                        {copied === copyKey ? "Copied" : "Copy link"}
                      </SettingsButton>
                    </div>
                  );
                })}
              </div>
            </SettingsRow>
          ) : null}
          <SettingsRow label="The guide" help="How connected apps work, step by step.">
            <a className={settingsButtonClass()} href="/docs/guides/connect-your-app" target="_blank" rel="noreferrer">Read the guide</a>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
      {communityUrl ? (
        <SettingsGroup label="Custom landing page">
          <SettingsRow
            label="Landing page prompt"
            help="Paste into your AI to build a custom site hosted anywhere (Vercel, Cloudflare). Every button sends visitors straight to your Polynet join and checkout page."
          >
            <SettingsButton onClick={copyLandingPagePrompt}>
              {copied === "landing-page" ? "Copied" : "Copy landing page prompt"}
            </SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
    </>
  );
}
