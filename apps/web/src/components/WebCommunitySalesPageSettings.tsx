import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Monitor, RotateCcw, Smartphone } from "lucide-react";

import {
  discardCloudCommunityLayoutDraft,
  fetchCloudCommunityLayoutDraft,
  publishCloudCommunityLayoutDraft,
  saveCloudCommunityLayoutDraft,
  type CommunityLayoutDraftState,
} from "../../../../shared/cloudCommunityLayoutGateway";
import { uploadCloudCommunityResourceImage } from "../../../../shared/cloudCommunityAdminGateway";
import { DEFAULT_COMMUNITY_LAYOUT, type CommunityLayoutAboutMedia, type CommunityLayoutV1 } from "../../../../shared/communityLayout";
import { buildCommunityFunnelPath, buildCommunityFunnelPreviewPath } from "../../../../shared/webAppRouteState";
import { COMMUNITY_LAYOUT_PUBLISHED_EVENT } from "../controllers/useWebCommunityLayout";
import { WebCommunitySalesGalleryEditor } from "./WebCommunitySalesGalleryEditor";
import { SALES_PREVIEW_MESSAGE } from "./WebCommunitySalesPage";
import "./WebCommunitySalesPageSettings.css";

type Presentation = CommunityLayoutV1["pages"]["about"]["presentation"];

const STYLES: { id: Presentation; name: string; description: string }[] = [
  {
    id: "page",
    name: "Polynet page",
    description: "One centred column: your video, the pitch and a join button under it.",
  },
  {
    id: "funnel",
    name: "Side card page",
    description: "Video and pitch on the left; a card with the price, members and join button stays beside it.",
  },
];

function styleName(id: Presentation): string {
  return STYLES.find((style) => style.id === id)?.name ?? "Polynet page";
}

// Small drawings of each style, so the choice reads at a glance.
function StyleSketch(props: { id: Presentation }) {
  return props.id === "funnel" ? (
    <svg viewBox="0 0 120 72" aria-hidden="true" className="pn-sales-sketch">
      <rect x="6" y="8" width="70" height="34" rx="3" className="is-media" />
      <rect x="6" y="48" width="56" height="4" rx="2" />
      <rect x="6" y="56" width="66" height="4" rx="2" />
      <rect x="84" y="8" width="30" height="52" rx="3" className="is-card" />
      <rect x="89" y="46" width="20" height="8" rx="2" className="is-button" />
    </svg>
  ) : (
    <svg viewBox="0 0 120 72" aria-hidden="true" className="pn-sales-sketch">
      <rect x="34" y="6" width="52" height="5" rx="2" />
      <rect x="26" y="16" width="68" height="30" rx="3" className="is-media" />
      <rect x="32" y="52" width="56" height="4" rx="2" />
      <rect x="46" y="60" width="28" height="8" rx="2" className="is-button" />
    </svg>
  );
}

function layoutWithPresentation(layout: CommunityLayoutV1, presentation: Presentation): CommunityLayoutV1 {
  return { ...layout, pages: { ...layout.pages, about: { ...layout.pages.about, presentation } } };
}

// The page is laid out at a real screen width and shrunk to fit the pane, as
// Substack's editor does: a desktop page in a 700px frame would otherwise
// switch to its narrow, stacked layout.
const FRAME_WIDTH = { desktop: 1280, phone: 390 } as const;
const FRAME_HEIGHT = { desktop: 800, phone: 844 } as const;

function SalesPreviewFrame(props: { device: "desktop" | "phone"; src: string; title: string; frameRef?: (frame: HTMLIFrameElement | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      // Inside the padding, less the frame box's 1px border on each side.
      setAvailable(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = FRAME_WIDTH[props.device];
  const height = FRAME_HEIGHT[props.device];
  const scale = available ? Math.min(1, available / width) : 1;
  return (
    <div ref={wrap} className={`pn-sales-frame-wrap is-${props.device}`}>
      <div className="pn-sales-frame-box" style={{ width: width * scale, height: height * scale }}>
        <iframe
          ref={props.frameRef}
          className="pn-sales-frame"
          src={props.src}
          title={props.title}
          style={{ width, height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

type Props = {
  communityId: string;
  communitySlug: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
};

// Settings > Sales page: what a visitor sees at /c/<slug> before joining (the
// community's About page, which members see in the About tab), as a site
// editor: the style, gallery and text beside a live preview. They are fields
// of the layout record (pages.about), kept as a draft until Publish like the
// rest of the layout.
export function WebCommunitySalesPageSettings(props: Props) {
  const [state, setState] = useState<CommunityLayoutDraftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const alive = useRef(true);
  // Set on every mount: React's dev double-mount runs the cleanup once first.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const withSession = async <T,>(operation: (session: unknown) => Promise<T>) => {
    const session = await props.ensureSession(props.session);
    if (!session) throw new Error("auth_session_required");
    return operation(session);
  };

  useEffect(() => {
    let active = true;
    setError(null);
    withSession((session) => fetchCloudCommunityLayoutDraft({ session, communityId: props.communityId }))
      .then((loaded) => { if (active) setState(loaded); })
      .catch(() => { if (active) setError("Could not load the sales page settings."); });
    return () => { active = false; };
  }, [props.communityId, reload]);

  const run = async (operation: (session: unknown, current: CommunityLayoutDraftState) => Promise<CommunityLayoutDraftState>, after?: (next: CommunityLayoutDraftState) => void): Promise<boolean> => {
    if (!state || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const next = await withSession((session) => operation(session, state));
      if (!alive.current) return false;
      setState(next);
      after?.(next);
      return true;
    } catch (caught) {
      if (!alive.current) return false;
      const message = String((caught as { data?: { code?: string } })?.data?.code ?? caught ?? "");
      setError(message.includes("conflict")
        ? "The layout changed in another session. Reload to continue."
        : "Could not save. Try again.");
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // The preview frame shows the unpublished gallery and text: they're sent to
  // it whenever they change and whenever it (re)loads and says it's ready.
  const previewFrame = useRef<HTMLIFrameElement | null>(null);
  const draftAbout = state
    ? { media: state.draft.pages.about.media, text: state.draft.pages.about.text, showMembers: state.draft.pages.about.show_members }
    : null;
  const draftAboutKey = JSON.stringify(draftAbout);
  useEffect(() => {
    if (!draftAbout) return;
    const send = () => previewFrame.current?.contentWindow?.postMessage(
      { type: SALES_PREVIEW_MESSAGE, ...draftAbout },
      window.location.origin,
    );
    send();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== previewFrame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === `${SALES_PREVIEW_MESSAGE}:ready`) send();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [draftAboutKey]);

  if (!state) {
    return (
      <section className="settings-section pn-settings-card" aria-busy={!error || undefined}>
        {error ? (
          <p role="alert" className="pn-settings-inline-error">
            {error}{" "}
            <button className="pn-settings-button" type="button" onClick={() => setReload((n) => n + 1)}>Retry</button>
          </p>
        ) : (
          <div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading…</div>
        )}
      </section>
    );
  }

  const draftStyle = state.draft.pages.about.presentation;
  const liveStyle = (state.published ?? DEFAULT_COMMUNITY_LAYOUT).pages.about.presentation;
  const styleChanged = draftStyle !== liveStyle;
  // Publishing sends the whole layout draft live, so say when it holds more
  // than this page's style (tabs or navigation edited elsewhere).
  const otherLayoutChanges = state.hasUnpublishedChanges && JSON.stringify(
    layoutWithPresentation(state.draft, liveStyle),
  ) !== JSON.stringify(state.published ?? DEFAULT_COMMUNITY_LAYOUT);

  const chooseStyle = (presentation: Presentation) => {
    if (presentation === draftStyle) return;
    void run((session, current) => saveCloudCommunityLayoutDraft({
      session,
      communityId: props.communityId,
      expectedDraftRevision: current.draftRevision,
      layout: layoutWithPresentation(current.draft, presentation),
    }), () => setFrameKey((n) => n + 1));
  };
  const publish = () => void run((session, current) => publishCloudCommunityLayoutDraft({
    session,
    communityId: props.communityId,
    expectedDraftRevision: current.draftRevision,
  }), () => window.dispatchEvent(new CustomEvent(COMMUNITY_LAYOUT_PUBLISHED_EVENT, { detail: { communityId: props.communityId } })));
  const discard = () => void run((session, current) => discardCloudCommunityLayoutDraft({
    session,
    communityId: props.communityId,
    expectedDraftRevision: current.draftRevision,
  }), () => setFrameKey((n) => n + 1));

  const saveAbout = (about: { media: CommunityLayoutAboutMedia[]; text: string; show_members: boolean }) => run((session, current) => saveCloudCommunityLayoutDraft({
    session,
    communityId: props.communityId,
    expectedDraftRevision: current.draftRevision,
    layout: { ...current.draft, pages: { ...current.draft.pages, about: { ...current.draft.pages.about, ...about } } },
  }));
  const uploadImage = async (file: File) => {
    const session = await props.ensureSession(props.session);
    if (!session) throw new Error("Sign in again to upload.");
    return uploadCloudCommunityResourceImage({ session, communityId: props.communityId, file });
  };

  const previewBase = buildCommunityFunnelPreviewPath(props.communitySlug);
  // Phone loads the phone app (/m/), as a real phone gets it, not the desktop
  // layout squeezed to 390px.
  const previewSrc = previewBase ? `${device === "phone" ? "/m" : ""}${previewBase}?presentation=${draftStyle}&embed=1` : null;
  const livePath = buildCommunityFunnelPath(props.communitySlug);

  return (
    <div className="pn-sales-editor">
      <div className="pn-sales-controls">
      <section className="settings-section pn-settings-card" id="sales-style" aria-labelledby="sales-style-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="sales-style-title">Page style</h2>
          <p className="settings-section-desc">
            How your public page is laid out. Members see it in the About tab too. A new style stays a draft until you publish it.
          </p>
        </header>
        <div className="pn-sales-styles" role="radiogroup" aria-label="Page style">
          {STYLES.map((style) => {
            const selected = style.id === draftStyle;
            return (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`pn-sales-style${selected ? " is-selected" : ""}`}
                disabled={busy}
                onClick={() => chooseStyle(style.id)}
              >
                <StyleSketch id={style.id} />
                <span className="pn-sales-style-text">
                  <strong>
                    {style.name}
                    {style.id === liveStyle ? <span className="pn-settings-badge">Live</span> : null}
                  </strong>
                  <small>{style.description}</small>
                </span>
                {selected ? <Check className="pn-sales-style-check" size={16} strokeWidth={2.5} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        <footer className="pn-settings-card-footer">
          <span className="pn-settings-status" role="status">
            {busy
              ? "Saving…"
              : styleChanged
                ? `Draft: ${styleName(draftStyle)}. Visitors still see the ${styleName(liveStyle)}.`
                : state.hasUnpublishedChanges
                  ? "Your layout has other unpublished changes."
                  : `Live: ${styleName(liveStyle)}`}
          </span>
          {error ? <span className="pn-settings-inline-error" role="alert">{error} <button className="pn-settings-link" type="button" onClick={() => setReload((n) => n + 1)}>Reload</button></span> : null}
          {state.hasUnpublishedChanges ? (
            <div className="pn-settings-actions">
              <button className="pn-settings-button" type="button" disabled={busy} onClick={discard}>
                <RotateCcw size={14} strokeWidth={2} aria-hidden="true" /> Discard draft
              </button>
              <button className="pn-settings-button is-primary" type="button" disabled={busy} onClick={publish}>
                Publish
              </button>
            </div>
          ) : null}
        </footer>
        {otherLayoutChanges ? (
          <p className="pn-settings-help">Publish also puts live the other layout changes in your draft (tabs and navigation from Appearance or the CLI).</p>
        ) : null}
      </section>

      <WebCommunitySalesGalleryEditor
        media={state.draft.pages.about.media}
        text={state.draft.pages.about.text}
        showMembers={state.draft.pages.about.show_members}
        classroom={draftStyle === "funnel"}
        fallbackText=""
        busy={busy}
        onSave={saveAbout}
        uploadImage={uploadImage}
      />

      </div>
      <div className="pn-sales-preview">
        <section className="settings-section pn-settings-card pn-sales-preview-card" aria-labelledby="sales-preview-title">
          <header className="pn-settings-card-header is-row">
            <div>
              <h2 className="settings-section-title" id="sales-preview-title">Preview</h2>
              <p className="settings-section-desc">The {styleName(draftStyle)} as a visitor sees it, with your current copy.</p>
            </div>
            <div className="pn-settings-actions">
              <div className="pn-settings-segmented" role="group" aria-label="Preview size">
                <button type="button" aria-pressed={device === "desktop"} className={`pn-settings-seg${device === "desktop" ? " is-active" : ""}`} onClick={() => setDevice("desktop")}>
                  <Monitor size={16} strokeWidth={2} aria-hidden="true" /> Desktop
                </button>
                <button type="button" aria-pressed={device === "phone"} className={`pn-settings-seg${device === "phone" ? " is-active" : ""}`} onClick={() => setDevice("phone")}>
                  <Smartphone size={16} strokeWidth={2} aria-hidden="true" /> Phone
                </button>
              </div>
              {livePath ? (
                <a className="pn-settings-button" href={livePath} target="_blank" rel="noreferrer">
                  View live <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </header>
          {previewSrc ? (
            <SalesPreviewFrame
              key={`${frameKey}-${draftStyle}-${device}`}
              device={device}
              src={previewSrc}
              title={`Preview of the ${styleName(draftStyle)}`}
              frameRef={(frame) => { previewFrame.current = frame; }}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
