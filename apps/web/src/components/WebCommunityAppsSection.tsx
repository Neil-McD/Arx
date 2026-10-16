import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CommunityAppsGateway } from "../controllers/useWebCommunityAppsGateway";
import { COMMUNITY_APP_TOOLS, type CommunityAppTool } from "../../../../shared/communityAppSession";
import type { CloudCommunityAppDetail, CloudCommunityAppSummary } from "../../../../shared/cloudCommunityAppsGateway";
import { WebCommunityAppFrame } from "./WebCommunityAppFrame";

const TOOL_LABELS: Record<CommunityAppTool, string> = {
  polynet_list: "List",
  polynet_read: "Read",
  polynet_search: "Search",
  polynet_write: "Post",
  polynet_call: "Run actions",
};

function appErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("community_app_origin_invalid")) return "Use the app's exact HTTPS origin, like https://portal.example.com.";
  if (message.includes("community_app_slug_taken")) return "That app slug is already used in this community.";
  if (message.includes("community_app_slug_invalid")) return "Use lowercase letters, numbers and dashes for the slug.";
  if (message.includes("community_app_tools_required")) return "Choose at least one permission.";
  return "Something went wrong. Try again.";
}

export function WebCommunityAppsSection(props: { gateway?: CommunityAppsGateway; communitySlug: string | null }) {
  const { gateway, communitySlug } = props;
  const [apps, setApps] = useState<CloudCommunityAppSummary[] | null>(null);
  const [managed, setManaged] = useState<CloudCommunityAppDetail[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", origin: "", tools: ["polynet_list", "polynet_read", "polynet_search"] as CommunityAppTool[] });
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!gateway) return;
    try {
      setApps(await gateway.listForMember());
      if (gateway.canManage) setManaged(await gateway.listForManager());
      setError(null);
    } catch (loadError) {
      if (String(loadError).includes("community_app_scope_changed")) return;
      setError("Apps couldn't be loaded.");
    }
  }, [gateway]);

  useEffect(() => {
    setApps(null);
    setManaged([]);
    setOpenSlug(null);
    void load();
  }, [gateway?.scopeKey, load]);

  const openApp = apps?.find((app) => app.slug === openSlug) ?? null;

  const register = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || isSaving) return;
    setIsSaving(true);
    try {
      await gateway.register({ name: form.name, slug: form.slug, origin: form.origin, allowedTools: form.tools });
      setForm({ ...form, name: "", slug: "", origin: "" });
      await load();
    } catch (registerError) {
      setError(appErrorMessage(registerError));
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = async (app: CloudCommunityAppDetail) => {
    if (!gateway) return;
    try {
      await gateway.setStatus(app.slug, app.status === "active" ? "disabled" : "active");
      await load();
    } catch (toggleError) {
      setError(appErrorMessage(toggleError));
    }
  };

  if (openApp && gateway && communitySlug) {
    return (
      <div className="community-panel community-apps-panel">
        <div className="feed-header-row">
          <div className="feed-header-copy">
            <div className="resources-header">{openApp.name}</div>
            <div className="feed-header-subtitle">{openApp.origin}</div>
          </div>
          <button type="button" className="secondary" onClick={() => setOpenSlug(null)}>All apps</button>
        </div>
        <WebCommunityAppFrame app={openApp} communitySlug={communitySlug} mint={gateway.mint} />
      </div>
    );
  }

  return (
    <div className="community-panel community-apps-panel">
      <div className="feed-header-row">
        <div className="feed-header-copy">
          <div className="resources-header">Apps</div>
          <div className="feed-header-subtitle">Experiences built for this community. They act for you, only inside this community.</div>
        </div>
      </div>
      {error ? <div className="community-event-error" role="alert">{error}</div> : null}
      {apps === null ? (
        <div className="community-events-state" role="status">Loading apps…</div>
      ) : apps.length === 0 ? (
        <div className="community-events-state">No apps yet.</div>
      ) : (
        <ul className="community-apps-list">
          {apps.map((app) => (
            <li key={app.slug}>
              <button type="button" className="secondary" onClick={() => setOpenSlug(app.slug)}>
                Open {app.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {gateway?.canManage ? (
        <div className="community-apps-manage">
          <div className="resources-header">Manage apps</div>
          {managed.length > 0 ? (
            <ul className="community-apps-list">
              {managed.map((app) => (
                <li key={app.slug}>
                  <span>{app.name} · {app.origin} · {app.status === "active" ? "Active" : "Disabled"}</span>{" "}
                  <button type="button" className="secondary" onClick={() => void toggle(app)}>
                    {app.status === "active" ? "Disable" : "Enable"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form className="community-event-form" onSubmit={register}>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} /></label>
            <label>Slug<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required maxLength={40} placeholder="coaching-portal" /></label>
            <label>Origin<input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} required placeholder="https://portal.example.com" /></label>
            <fieldset>
              <legend>Permissions</legend>
              {COMMUNITY_APP_TOOLS.map((tool) => (
                <label key={tool}>
                  <input
                    type="checkbox"
                    checked={form.tools.includes(tool)}
                    onChange={(e) => setForm({
                      ...form,
                      tools: e.target.checked ? [...form.tools, tool] : form.tools.filter((value) => value !== tool),
                    })}
                  />{" "}
                  {TOOL_LABELS[tool]}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="primary" disabled={isSaving}>Register app</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
