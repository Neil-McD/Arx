import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  buildCommunityOnboardingOrientationSeed,
  COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS,
  COMMUNITY_ONBOARDING_VIDEO_URL_MAX_CHARS,
  COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS,
  createCommunityOnboardingPreviewSession,
  DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS,
  DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
  normalizeCommunityOnboardingVideoUrl,
  type CommunityOnboardingConfig,
} from "../../../../shared/communityOnboarding";
import {
  fetchCloudCommunityOnboardingConfig,
  saveCloudCommunityOnboardingConfig,
} from "../../../../shared/cloudCommunityOnboardingGateway";
import { WebCommunityOnboardingOrientationSurface } from "./WebCommunityOnboardingOrientationSurface";

const preventInlinePreviewSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
};
const ignoreInlinePreviewAction = () => undefined;

export function WebCommunityOnboardingWorkflowSection(props: {
  session: unknown;
  communityId: string;
  communityName: string;
  onPreview: () => void;
}) {
  const [config, setConfig] = useState<CommunityOnboardingConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_COMMUNITY_ONBOARDING_WELCOME);
  const [instructions, setInstructions] = useState(DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS);
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setIsLoading(true);
    setError(null);
    void fetchCloudCommunityOnboardingConfig({
      session: props.session,
      communityId: props.communityId,
    }).then((next) => {
      if (canceled) return;
      setConfig(next);
      setEnabled(next.enabled);
      setWelcomeMessage(next.welcome_message);
      setInstructions(next.agent_instructions);
      setIntroVideoUrl(next.intro_video_url ?? "");
    }).catch(() => {
      if (!canceled) setError("Couldn’t load the onboarding workflow.");
    }).finally(() => {
      if (!canceled) setIsLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [props.communityId, props.session]);

  const isDirty = useMemo(() => Boolean(config) && (
    enabled !== config?.enabled ||
    welcomeMessage.trim() !== config?.welcome_message ||
    instructions.trim() !== config?.agent_instructions ||
    introVideoUrl.trim() !== (config?.intro_video_url ?? "")
  ), [config, enabled, instructions, introVideoUrl, welcomeMessage]);

  const inlinePreviewSession = useMemo(() => createCommunityOnboardingPreviewSession({
    communityId: props.communityId,
    config: {
      enabled,
      welcome_message: welcomeMessage,
      agent_instructions: instructions,
      intro_video_url: normalizeCommunityOnboardingVideoUrl(introVideoUrl),
      version: config?.version ?? 0,
      updated_at: config?.updated_at ?? null,
    },
    nowIso: config?.updated_at ?? "1970-01-01T00:00:00.000Z",
    previewId: "settings-inline",
  }), [config?.updated_at, config?.version, enabled, instructions, introVideoUrl, props.communityId, welcomeMessage]);

  const inlinePreviewMessages = useMemo(() => [{
    id: "settings-inline-welcome",
    role: "assistant" as const,
    text: buildCommunityOnboardingOrientationSeed({
      communityName: props.communityName,
      welcomeMessage,
    }),
  }], [props.communityName, welcomeMessage]);

  const reset = () => {
    if (!config) return;
    setEnabled(config.enabled);
    setWelcomeMessage(config.welcome_message);
    setInstructions(config.agent_instructions);
    setIntroVideoUrl(config.intro_video_url ?? "");
    setError(null);
  };

  const save = async () => {
    if (!welcomeMessage.trim() || !instructions.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const next = await saveCloudCommunityOnboardingConfig({
        session: props.session,
        communityId: props.communityId,
        enabled,
        welcomeMessage,
        agentInstructions: instructions,
        introVideoUrl: introVideoUrl.trim() || null,
      });
      setConfig(next);
      setEnabled(next.enabled);
      setWelcomeMessage(next.welcome_message);
      setInstructions(next.agent_instructions);
      setIntroVideoUrl(next.intro_video_url ?? "");
    } catch {
      setError("Couldn’t save the onboarding workflow.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="settings-section community-onboarding-workflow" aria-busy={isLoading}>
      <header className="community-onboarding-header">
        <div className="community-onboarding-heading-copy">
          <div className="settings-section-title">Member onboarding</div>
          <div className="settings-section-desc community-onboarding-description">
            Shape the welcome new members see before they enter the community.
          </div>
        </div>
        {!isLoading && config ? (
          <div className="agent-preview-actions community-onboarding-actions">
            {isDirty ? (
              <button type="button" onClick={reset} disabled={isSaving}>
                Cancel changes
              </button>
            ) : null}
            <button
              type="button"
              onClick={props.onPreview}
              disabled={isSaving || isDirty}
              title={isDirty ? "Save changes before previewing the full flow" : undefined}
            >
              Preview full flow
            </button>
            <button
              className={`platform-save-button${isDirty ? " is-dirty" : " is-saved"}`}
              type="button"
              disabled={!isDirty || isSaving || !welcomeMessage.trim() || !instructions.trim()}
              onClick={() => void save()}
            >
              {isSaving ? "Saving…" : isDirty ? "Save changes" : "Saved"}
            </button>
          </div>
        ) : null}
      </header>

      {isLoading ? <div className="model-note">Loading onboarding…</div> : (
        <>
          <label className="community-onboarding-toggle-row">
            <span className="community-onboarding-toggle-copy">
              <strong>Run for new members</strong>
              <small>Starts once when access activates. Existing members are not backfilled.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Run onboarding for new members"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span className="community-onboarding-switch" aria-hidden="true" />
          </label>

          <ol className="community-onboarding-journey" aria-label="Member onboarding journey">
            <li className="is-current">
              <span>1</span>
              <div>
                <strong>Welcome</strong>
                <small>You configure this step</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>First post</strong>
                <small>Built-in guidance</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Personal agent</strong>
                <small>Built-in next action</small>
              </div>
            </li>
          </ol>

          <div className="community-onboarding-builder">
            <div className="community-onboarding-editor">
              <div className="community-onboarding-editor-heading">
                <span>Step 1 of 3</span>
                <h2>Welcome new members</h2>
                <p>Add a founder video and set the opening message from the member’s personal agent.</p>
              </div>

              <label className="create-community-field community-onboarding-field">
                <span>Founder orientation video</span>
                <span className="community-onboarding-field-note">
                  Optional. Shown only here and kept separate from the public funnel.
                </span>
                <input
                  className="community-onboarding-video-input"
                  type="url"
                  inputMode="url"
                  value={introVideoUrl}
                  maxLength={COMMUNITY_ONBOARDING_VIDEO_URL_MAX_CHARS}
                  placeholder="https://youtube.com/watch?v=…"
                  onChange={(event) => setIntroVideoUrl(event.target.value)}
                />
              </label>

              <label className="create-community-field community-onboarding-field">
                <span>Welcome message</span>
                <span className="community-onboarding-field-note">
                  The first thing their personal agent says.
                </span>
                <textarea
                  className="community-onboarding-textarea"
                  value={welcomeMessage}
                  maxLength={COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS}
                  rows={5}
                  onChange={(event) => setWelcomeMessage(event.target.value)}
                />
              </label>

              <details className="community-onboarding-advanced">
                <summary>
                  <span>
                    <strong>Advanced agent instructions</strong>
                    <small>Control how the personal agent guides this orientation.</small>
                  </span>
                  <span aria-hidden="true">+</span>
                </summary>
                <label className="create-community-field community-onboarding-field community-onboarding-field-instructions">
                  <span>Personal agent guidance</span>
                  <textarea
                    className="community-onboarding-textarea"
                    value={instructions}
                    maxLength={COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS}
                    rows={7}
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                </label>
              </details>
            </div>

            <aside className="community-onboarding-live-preview" aria-label="Live member welcome preview">
              <div className="community-onboarding-live-preview-heading">
                <span>Member view</span>
                <small>Live draft · no inference</small>
              </div>
              <div className="community-onboarding-inline-preview-frame">
                <div className={`community-onboarding-orientation-modal community-onboarding-orientation-inline${inlinePreviewSession.intro_video_url ? " has-video" : ""}`}>
                  <WebCommunityOnboardingOrientationSurface
                    communityName={props.communityName}
                    session={inlinePreviewSession}
                    messages={inlinePreviewMessages}
                    input=""
                    isPreview
                    isPreparing={false}
                    isWorking={false}
                    streamedText=""
                    isPending={false}
                    isInline
                    error={null}
                    onInputChange={ignoreInlinePreviewAction}
                    onSubmit={preventInlinePreviewSubmit}
                    onStop={ignoreInlinePreviewAction}
                    onContinue={ignoreInlinePreviewAction}
                    onDismiss={ignoreInlinePreviewAction}
                  />
                </div>
              </div>
            </aside>
          </div>

          {error ? <div className="auth-error">{error}</div> : null}
        </>
      )}
      {!isLoading && !error && !config ? <div className="auth-error">Onboarding is unavailable.</div> : null}
    </section>
  );
}
