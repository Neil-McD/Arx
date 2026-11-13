// Your app (one door, slice 2a): connect the builder's own app to this
// community. The app asks Polynet what someone has here, server to server
// with its secret, and hears when that changes. Secrets are shown once.
import { useCallback, useEffect, useState } from "react";
import { announceCommunityAppLinksChanged, COMMUNITY_PLANS_CHANGED_EVENT } from "../controllers/communityAppLinks";
import connectYourAppGuide from "../../../../docs/product/guides/connect-your-app.md?raw";
import { buildConnectedAppSetupPrompt } from "../../../../shared/connectedAppSetupPrompt";
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

export function CommunityConnectedAppsSection(props: { communityId: string; communityName?: string; communitySlug?: string; session: unknown; ensureSession: (session: any) => Promise<any | null> }) {
  const [apps, setApps] = useState<CloudConnectedApp[] | null>(null);
  const [adding, setAdding] = useState<{ name: string; appUrl: string; webhookUrl: string } | null>(null);
  // One address at a time: where members open the app, or where webhooks go.
  const [editing, setEditing] = useState<{ appId: string; field: "appUrl" | "webhookUrl"; url: string } | null>(null);
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
        : code.includes("connected_app_url_invalid") ? "Use your app's public https address."
        : code.includes("apps_full") ? "A community can connect up to three apps."
          : code.includes("name_required") ? "Give your app a name." : "Couldn't save. Try again.");
    } finally { setBusy(false); }
  };

  if (!apps) return null;
  const origin = apiOrigin();
  const communityUrl = props.communitySlug ? `${window.location.origin}/c/${encodeURIComponent(props.communitySlug)}` : null;
  const copyPrompt = (app: CloudConnectedApp) => {
    const prompt = buildConnectedAppSetupPrompt({
      communityName: props.communityName ?? "your community", appName: app.name, appId: app.app_id, apiOrigin: origin,
      hasWebhook: Boolean(app.webhook_url), guide: connectYourAppGuide, communityUrl, hasAppLink: Boolean(app.app_url),
      tiers: tiers.filter((tier) => !tier.archived).map((tier) => ({ key: tier.key, name: tier.name, grants: tier.grants })),
    });
    void navigator.clipboard?.writeText(prompt).then(() => { setCopied(app.app_id); window.setTimeout(() => setCopied(null), 2000); }, () => setError("Couldn't copy. Open the guide instead."));
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
            <SettingsRow key={app.app_id} label={apps.length > 1 ? `Setup prompt for ${app.name}` : "Setup prompt"}
              help="Paste it into Claude Code, Cursor or Codex in your app's code. It has the guide and this community's values, never your secret.">
              <SettingsButton onClick={() => copyPrompt(app)}>{copied === app.app_id ? "Copied" : "Copy prompt"}</SettingsButton>
            </SettingsRow>
          ))}
          <SettingsRow label="API address"><span className="settings-v1-value is-mono">{origin}</span></SettingsRow>
          {communityUrl ? <SettingsRow label="Link to your community" help="Put it in your app; the prompt suggests where."><span className="settings-v1-value is-mono">{communityUrl}</span></SettingsRow> : null}
          <SettingsRow label="The guide" help="How connected apps work, step by step.">
            <a className={settingsButtonClass()} href="/docs/guides/connect-your-app" target="_blank" rel="noreferrer">Read the guide</a>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
    </>
  );
}
