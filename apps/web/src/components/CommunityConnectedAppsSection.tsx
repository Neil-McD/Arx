// Your app (one door, slice 2a): connect the builder's own app to this
// community. The app asks Polynet what someone has here, server to server
// with its secret, and hears when that changes. Secrets are shown once.
import { useCallback, useEffect, useState } from "react";
import {
  fetchCloudConnectedApps,
  registerCloudConnectedApp,
  revokeCloudConnectedApp,
  rotateCloudConnectedAppSecret,
  updateCloudConnectedApp,
  type CloudConnectedApp,
} from "../../../../shared/cloudConnectedAppsGateway";

type Shown = { appId: string; secret: string; signingSecret?: string };

function apiOrigin(): string {
  // The access check lives on Polynet's backend (the Convex site URL).
  const convex = String((import.meta as any).env?.VITE_CONVEX_URL ?? "");
  return convex ? convex.replace(".convex.cloud", ".convex.site") : "";
}

export function CommunityConnectedAppsSection(props: { communityId: string; session: unknown; ensureSession: (session: any) => Promise<any | null> }) {
  const [apps, setApps] = useState<CloudConnectedApp[] | null>(null);
  const [adding, setAdding] = useState<{ name: string; webhookUrl: string } | null>(null);
  const [editingHook, setEditingHook] = useState<{ appId: string; url: string } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withSession = async <T,>(work: (session: any) => Promise<T>): Promise<T | null> => {
    const session = await props.ensureSession(props.session);
    return session ? await work(session) : null;
  };
  const load = useCallback(async () => {
    try { setApps(await withSession((session) => fetchCloudConnectedApps({ session, communityId: props.communityId })) ?? []); } catch { setApps(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await work(); await load(); }
    catch (failure) {
      const code = String((failure as Error)?.message ?? "");
      setError(code.includes("webhook_url_invalid") ? "Use your app's public https address for webhooks."
        : code.includes("apps_full") ? "A community can connect up to three apps."
          : code.includes("name_required") ? "Give your app a name." : "Couldn't save. Try again.");
    } finally { setBusy(false); }
  };

  if (!apps) return null;
  const origin = apiOrigin();
  return (
    <div className="settings-section community-apps-section">
      <div className="settings-section-title">Your app</div>
      <div className="settings-section-desc">
        Connect your own product. Your app asks Polynet what someone has in this community (their plan and grants), and hears when that changes. Sales through Polynet pay Polynet's fee; sales your app makes itself don't.
      </div>
      {shown ? (
        <div className="community-app-secret" role="status">
          <strong>Copy these now. They won't be shown again.</strong>
          <div className="settings-section-desc">App secret (keep it on your server)</div>
          <code>{shown.secret}</code>
          {shown.signingSecret ? (
            <>
              <div className="settings-section-desc">Webhook signing secret</div>
              <code>{shown.signingSecret}</code>
            </>
          ) : null}
          <button type="button" className="secondary" onClick={() => setShown(null)}>I've saved them</button>
        </div>
      ) : null}
      {apps.map((app) => (
        <div key={app.app_id} className="community-plan-row">
          <div>
            <strong>{app.name}</strong>
            <span className="settings-section-desc">{app.app_id} · secret ends {app.secret_hint}</span>
            {editingHook?.appId === app.app_id ? (
              <span className="community-plan-actions">
                <input value={editingHook.url} onChange={(event) => setEditingHook({ ...editingHook, url: event.target.value })} placeholder="https://your-app.com/polynet/webhook" aria-label="Webhook address" />
                <button type="button" disabled={busy} onClick={() => void run(async () => { await withSession((session) => updateCloudConnectedApp({ session, communityId: props.communityId, appId: app.app_id, webhookUrl: editingHook.url })); setEditingHook(null); })}>Save</button>
                <button type="button" className="secondary" onClick={() => setEditingHook(null)}>Cancel</button>
              </span>
            ) : (
              <span className="settings-section-desc">Webhooks: {app.webhook_url ?? "not set"}</span>
            )}
          </div>
          <div className="community-plan-actions">
            {confirmRevoke === app.app_id ? (
              <>
                <button type="button" disabled={busy} onClick={() => void run(async () => { await withSession((session) => revokeCloudConnectedApp({ session, communityId: props.communityId, appId: app.app_id })); setConfirmRevoke(null); })}>Disconnect</button>
                <button type="button" className="secondary" onClick={() => setConfirmRevoke(null)}>Keep</button>
              </>
            ) : (
              <>
                <button type="button" className="secondary" disabled={busy} onClick={() => setEditingHook({ appId: app.app_id, url: app.webhook_url ?? "" })}>Webhook</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => void run(async () => {
                  const result = await withSession((session) => rotateCloudConnectedAppSecret({ session, communityId: props.communityId, appId: app.app_id }));
                  if (result) setShown({ appId: app.app_id, secret: result.secret });
                })}>New secret</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmRevoke(app.app_id)}>Disconnect</button>
              </>
            )}
          </div>
        </div>
      ))}
      {adding ? (
        <div className="community-plan-form">
          <label className="create-community-field">
            <span>App name</span>
            <input value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} maxLength={60} placeholder="e.g. Distribution Engineer" autoFocus />
          </label>
          <label className="create-community-field">
            <span>Webhook address (optional)</span>
            <input value={adding.webhookUrl} onChange={(event) => setAdding({ ...adding, webhookUrl: event.target.value })} placeholder="https://your-app.com/polynet/webhook" inputMode="url" />
          </label>
          <div className="community-plan-actions">
            <button type="button" disabled={busy || !adding.name.trim()} onClick={() => void run(async () => {
              const result = await withSession((session) => registerCloudConnectedApp({ session, communityId: props.communityId, name: adding.name, webhookUrl: adding.webhookUrl.trim() || undefined }));
              if (result) { setShown({ appId: result.app_id, secret: result.secret, signingSecret: result.webhook_signing_secret }); setAdding(null); }
            })}>{busy ? "Connecting…" : "Connect app"}</button>
            <button type="button" className="secondary" onClick={() => { setAdding(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      ) : apps.length < 3 ? (
        <button type="button" className="secondary" style={{ marginTop: 10 }} onClick={() => { setError(null); setAdding({ name: "", webhookUrl: "" }); }}>Connect an app</button>
      ) : null}
      {error ? <div className="settings-section-desc" role="alert">{error}</div> : null}
      {apps.length && origin ? (
        <div className="settings-section-desc community-app-howto">
          From your server: <code>GET {origin}/apps/v1/access?email=…</code> with <code>Authorization: Bearer &lt;app secret&gt;</code> returns <code>{"{ allowed, tier, grants }"}</code>. Webhooks are signed (Standard Webhooks): on <code>access.changed</code>, ask again.
        </div>
      ) : null}
    </div>
  );
}
