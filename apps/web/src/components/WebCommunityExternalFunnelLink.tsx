import { useEffect, useState, type FormEvent } from "react";

import type { AuthSession } from "../auth";
import {
  normalizeCommunityExternalFunnelUrl,
} from "../../../../shared/communityExternalFunnel";
import {
  fetchCloudCommunityFunnelConfig,
  setCloudCommunityExternalFunnelUrl,
} from "../../../../shared/cloudCommunityFunnelGateway";
import { normalizeCommunityFunnelManagerConfig } from "../../../../shared/communityFunnel";
import type { CommunityFunnelManagerConfig } from "../../../../shared/communityTypes";

type Props = {
  communityId: string;
  communitySlug: string;
  session: AuthSession | null;
  ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;
  config: CommunityFunnelManagerConfig;
  hydrate: (config: CommunityFunnelManagerConfig | null) => void;
};

export function WebCommunityExternalFunnelLink(props: Props) {
  const [input, setInput] = useState(props.config.external_funnel_url ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setInput(props.config.external_funnel_url ?? "");
    setError(null);
  }, [props.communityId, props.config.external_funnel_url]);

  useEffect(() => {
    setCopyState("idle");
  }, [props.communitySlug]);

  const savedUrl = props.config.external_funnel_url;
  const isDirty = input.trim() !== (savedUrl ?? "");
  const joinPath = `/c/${encodeURIComponent(props.communitySlug)}`;
  const joinUrl = typeof window === "undefined" ? joinPath : new URL(joinPath, window.location.origin).href;

  const copyJoinUrl = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const save = async (raw: string | null) => {
    if (isSaving) return;
    let url: string | null;
    try {
      url = normalizeCommunityExternalFunnelUrl(raw);
    } catch {
      setError("Enter a public HTTPS website URL.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session, "community_external_funnel_save");
      if (!session) throw new Error("auth_session_required");
      const result = await setCloudCommunityExternalFunnelUrl<AuthSession, CommunityFunnelManagerConfig>({
        session,
        communityId: props.communityId,
        expectedSettingsRevision: props.config.settings_revision,
        url,
      });
      if (!result) throw new Error("community_external_funnel_save_failed");
      props.hydrate(normalizeCommunityFunnelManagerConfig(result));
    } catch (cause) {
      if (String(cause).includes("community_settings_conflict")) {
        try {
          const session = await props.ensureSession(props.session, "community_external_funnel_refresh");
          if (session) {
            const latest = await fetchCloudCommunityFunnelConfig<AuthSession, CommunityFunnelManagerConfig>({
              session,
              communityId: props.communityId,
            });
            if (latest) props.hydrate(normalizeCommunityFunnelManagerConfig(latest));
          }
        } catch {
          // The next panel load can refresh the snapshot.
        }
        setError("Community settings changed elsewhere. Review the latest link and try again.");
      } else {
        setError("The website link could not be saved. Try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(input);
  };

  return (
    <section className="settings-section external-funnel-settings" aria-labelledby="external-funnel-settings-title">
      <div className="settings-section-title" id="external-funnel-settings-title">Your website</div>
      <p>Visitors from Discover can open your website. Link its join button back to Polynet so customers can sign in, request access, or check out.</p>
      <div className="external-funnel-join-link">
        <a href={joinUrl} target="_blank" rel="noopener noreferrer">{joinUrl}</a>
        <button type="button" className="secondary" onClick={() => void copyJoinUrl}>Copy join link</button>
      </div>
      {copyState !== "idle" ? <span className="create-community-hint" role="status">{copyState === "copied" ? "Join link copied." : "Could not copy. Select the link above to copy it."}</span> : null}
      <form onSubmit={submit} className="external-funnel-settings-form">
        <label htmlFor="external-funnel-url">Website URL</label>
        <div className="external-funnel-settings-controls">
          <input
            id="external-funnel-url"
            type="url"
            inputMode="url"
            value={input}
            placeholder="https://your-community.com"
            onChange={(event) => setInput(event.target.value)}
            disabled={isSaving}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "external-funnel-url-error" : undefined}
          />
          <button type="submit" disabled={isSaving || !isDirty}>{isSaving ? "Saving…" : "Save website"}</button>
          {savedUrl ? <button type="button" className="secondary" onClick={() => void save(null)} disabled={isSaving}>Remove</button> : null}
        </div>
      </form>
      {error ? <div id="external-funnel-url-error" role="alert" className="auth-error">{error}</div> : null}
    </section>
  );
}
