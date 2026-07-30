import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import {
  COMMUNITY_ONBOARDING_VIDEO_URL_MAX_CHARS,
  createCommunityOnboardingPreviewSession,
  normalizeCommunityOnboardingVideoUrl,
  type CommunityOnboardingCopyCue,
  type CommunityOnboardingConfig,
} from "../../../../shared/communityOnboarding";
import { buildCommunityOnboardingCopy } from "../../../../shared/communityOnboardingCopy";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  fetchCloudCommunityOnboardingConfig,
  saveCloudCommunityOnboardingConfig,
} from "../../../../shared/cloudCommunityOnboardingGateway";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";
import { WebCommunityOnboardingMcpCompatibility } from "./WebCommunityOnboardingMcpCompatibility";
import { WebCommunityOnboardingOrientationSurface } from "./WebCommunityOnboardingOrientationSurface";

const ignoreInlinePreviewAction = () => undefined;
const INLINE_PREVIEW_STEPS: Array<{
  cue: CommunityOnboardingCopyCue;
  label: string;
  stepLabel: string;
}> = [
  { cue: "orientation", label: "Welcome", stepLabel: "Step 1 of 4" },
  { cue: "community_composer", label: "First post", stepLabel: "Step 2 of 4" },
  { cue: "personal_agent_intro", label: "Personal agent", stepLabel: "Step 3 of 4" },
  { cue: "mcp_handoff", label: "Polynet MCP", stepLabel: "Step 4 of 4" },
];

export const WebCommunityOnboardingWorkflowSection = memo(function WebCommunityOnboardingWorkflowSection(props: {
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  communityId: string;
  communityName: string;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  onPreview: () => void;
}) {
  const [config, setConfig] = useState<CommunityOnboardingConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreviewCue, setSelectedPreviewCue] =
    useState<CommunityOnboardingCopyCue>("orientation");
  const configRef = useRef<CommunityOnboardingConfig | null>(null);
  const configCommunityIdRef = useRef<string | null>(null);
  const sessionRef = useRef(props.session);
  sessionRef.current = props.session;

  useEffect(() => {
    if (
      configRef.current &&
      configCommunityIdRef.current === props.communityId
    ) {
      return;
    }
    let canceled = false;
    setError(null);
    void (async () => {
      try {
        const usableSession = await props.ensureSession(props.session);
        if (!usableSession) {
          throw new Error("community_onboarding_session_required");
        }
        if (canceled) return;
        const next = await fetchCloudCommunityOnboardingConfig({
          session: usableSession,
          communityId: props.communityId,
        });
        if (canceled) return;
        configRef.current = next;
        configCommunityIdRef.current = props.communityId;
        setConfig(next);
        setEnabled(next.enabled);
        setIntroVideoUrl(next.intro_video_url ?? "");
      } catch {
        if (!canceled) setError("Couldn’t load the onboarding workflow.");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [props.communityId, props.ensureSession, props.session]);

  const hasCurrentConfig = Boolean(
    config && configCommunityIdRef.current === props.communityId,
  );
  const isLoading = !hasCurrentConfig && error === null;
  const isDirty = useMemo(() => hasCurrentConfig && (
    enabled !== config?.enabled ||
    introVideoUrl.trim() !== (config?.intro_video_url ?? "")
  ), [config, enabled, hasCurrentConfig, introVideoUrl]);

  const inlinePreviewSession = useMemo(() => createCommunityOnboardingPreviewSession({
    communityId: props.communityId,
    config: {
      enabled,
      intro_video_url: normalizeCommunityOnboardingVideoUrl(introVideoUrl),
      updated_at: config?.updated_at ?? null,
    },
    nowIso: config?.updated_at ?? "1970-01-01T00:00:00.000Z",
    previewId: "settings-inline",
  }), [config?.updated_at, enabled, introVideoUrl, props.communityId]);
  const selectedPreviewIndex = Math.max(
    0,
    INLINE_PREVIEW_STEPS.findIndex((step) => step.cue === selectedPreviewCue),
  );
  const selectedPreviewStep = INLINE_PREVIEW_STEPS[selectedPreviewIndex] ?? INLINE_PREVIEW_STEPS[0];
  const previewSwitcherStyle = buildPlatformSwitcherStyle(
    INLINE_PREVIEW_STEPS.length,
    selectedPreviewIndex,
  );
  const inlinePreviewTranscript = useMemo(
    () => buildCommunityOnboardingCopy({
      cue: selectedPreviewCue,
      communityName: props.communityName,
      hasVideo:
        selectedPreviewCue === "orientation" &&
        Boolean(inlinePreviewSession.intro_video_url),
    }),
    [
      inlinePreviewSession.intro_video_url,
      props.communityName,
      selectedPreviewCue,
    ],
  );

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const usableSession = await props.ensureSession(sessionRef.current);
      if (!usableSession) {
        throw new Error("community_onboarding_session_required");
      }
      const next = await saveCloudCommunityOnboardingConfig({
        session: usableSession,
        communityId: props.communityId,
        enabled,
        introVideoUrl: introVideoUrl.trim() || null,
      });
      configRef.current = next;
      configCommunityIdRef.current = props.communityId;
      setConfig(next);
      setEnabled(next.enabled);
      setIntroVideoUrl(next.intro_video_url ?? "");
    } catch {
      setError("Couldn’t save the onboarding workflow.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="settings-section community-onboarding-workflow" aria-busy={isLoading}>
      {hasCurrentConfig ? (
        <>
          <header className="community-onboarding-header">
            <div className="community-onboarding-heading-copy">
              <div className="settings-section-title">New member onboarding</div>
              <div className="settings-section-desc community-onboarding-description">
                Guide each new member through their first useful actions.
              </div>
            </div>
            <div className="community-onboarding-controls">
              {isDirty ? (
                <button
                  className="platform-save-button is-dirty"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void save()}
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              ) : null}
              <button
                className="community-onboarding-preview-button"
                type="button"
                onClick={props.onPreview}
                disabled={!enabled || isSaving || isDirty}
                title={
                  !enabled
                    ? "Turn onboarding on to preview the full flow"
                    : isDirty
                      ? "Save changes before previewing the full flow"
                      : undefined
                }
              >
                Preview full flow
              </button>
              <label className="community-onboarding-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="New member onboarding"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                <span className="community-onboarding-switch" aria-hidden="true" />
              </label>
            </div>
          </header>

          {enabled ? (
            <div className="community-onboarding-builder">
              <div className="community-onboarding-editor">
                <label className="create-community-field community-onboarding-field">
                  <span>Founder welcome video</span>
                  <span className="community-onboarding-field-note">
                    Paste a YouTube link to show during member onboarding.
                  </span>
                  <input
                    className="community-onboarding-video-input"
                    type="url"
                    inputMode="url"
                    value={introVideoUrl}
                    maxLength={COMMUNITY_ONBOARDING_VIDEO_URL_MAX_CHARS}
                    placeholder="Paste a YouTube link"
                    onChange={(event) => setIntroVideoUrl(event.target.value)}
                  />
                </label>
              </div>

              <aside className="community-onboarding-live-preview" aria-label="Onboarding pop-up preview">
                <div
                  className="platform-switcher platform-switcher-compact community-onboarding-preview-steps"
                  role="tablist"
                  aria-label="Preview onboarding step"
                  style={previewSwitcherStyle}
                >
                  {INLINE_PREVIEW_STEPS.map((step) => (
                    <button
                      key={step.cue}
                      type="button"
                      role="tab"
                      aria-selected={selectedPreviewCue === step.cue}
                      className={`platform-switcher-btn${selectedPreviewCue === step.cue ? " is-active" : ""}`}
                      onClick={() => setSelectedPreviewCue(step.cue)}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>

                <div className="community-onboarding-inline-preview-frame">
                  {selectedPreviewCue === "orientation" ? (
                    <div
                      key={selectedPreviewCue}
                      className={`community-onboarding-orientation-modal community-onboarding-orientation-inline${inlinePreviewSession.intro_video_url ? " has-video" : ""}`}
                    >
                      <WebCommunityOnboardingOrientationSurface
                        communityName={props.communityName}
                        communityAvatarUrl={props.communityAvatarUrl}
                        communityAvatarFocusX={props.communityAvatarFocusX}
                        communityAvatarFocusY={props.communityAvatarFocusY}
                        communityAvatarZoom={props.communityAvatarZoom}
                        session={inlinePreviewSession}
                        isPending={false}
                        isInline
                        error={null}
                        onContinue={ignoreInlinePreviewAction}
                        onDismiss={ignoreInlinePreviewAction}
                      />
                    </div>
                  ) : (
                    <div
                      key={selectedPreviewCue}
                      className="community-onboarding-inline-popup"
                    >
                      <WebCommunityOnboardingConciergeSurface
                        communityName={props.communityName}
                        communityAvatarUrl={props.communityAvatarUrl}
                        communityAvatarFocusX={props.communityAvatarFocusX}
                        communityAvatarFocusY={props.communityAvatarFocusY}
                        communityAvatarZoom={props.communityAvatarZoom}
                        stepLabel={selectedPreviewStep.stepLabel}
                        transcript={inlinePreviewTranscript}
                        isPending={false}
                        controlsDisabled
                        error={null}
                        primaryLabel="Next"
                        showPrimary={false}
                        onPrimary={ignoreInlinePreviewAction}
                        onSecondary={ignoreInlinePreviewAction}
                      >
                        {selectedPreviewCue === "mcp_handoff" ? (
                          <>
                            <WebCommunityOnboardingMcpCompatibility />
                            <div className="community-onboarding-mcp-product-card">
                              <div className="community-onboarding-mcp-product-identity">
                                <DiscoverCatalogLogo
                                  name="Polynet MCP"
                                  logoUrl="/landing-polynet/logo.png"
                                />
                                <div className="community-onboarding-mcp-product-copy">
                                  <strong>Polynet MCP</strong>
                                  <span>
                                    Access your authorized Polynet communities from compatible AI harnesses.
                                  </span>
                                  <small>OAuth protected</small>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="community-onboarding-mcp-copy-action"
                                disabled
                                tabIndex={-1}
                              >
                                <Copy aria-hidden="true" />
                                Copy MCP setup
                              </button>
                            </div>
                          </>
                        ) : null}
                      </WebCommunityOnboardingConciergeSurface>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}
        </>
      ) : error ? (
        <div className="auth-error">{error}</div>
      ) : (
        <div className="model-note">Loading onboarding…</div>
      )}
    </section>
  );
});
