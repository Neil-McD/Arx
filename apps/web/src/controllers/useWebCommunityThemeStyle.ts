import { useEffect, useState } from "react";
import { communityThemeWithBothSchemes } from "../../../../shared/communityThemePalettes";
import { useMemberPickEverywhere } from "./communityLookPreference";
import { clearCommunityBootLook, forgetCommunityBootLook, rememberCommunityBootLook } from "./communityBootLook";
import {
  compileCommunityThemeCss,
  communityThemeFontStylesheetUrl,
  type CommunityThemeV1,
} from "../../../../shared/communityTheme";
import {
  fetchCloudCommunityThemeDraft,
  fetchCloudPublishedCommunityTheme,
} from "../../../../shared/cloudCommunityThemeGateway";

const STYLE_ELEMENT_ID = "polynet-community-theme";
const FONT_ELEMENT_ID = "polynet-community-theme-font";

/** Fired after a manager publishes, so the open community picks up its new look. */
export const COMMUNITY_THEME_PUBLISHED_EVENT = "polynet:community-theme-published";

// Settings → Appearance → Customize shows the real community in a same-origin
// frame opened with this query flag. The editor posts its unsaved draft to the
// frame, which wears it in place of the published look. Read once at load, so
// the frame stays a preview while the owner clicks around inside it.
export const APPEARANCE_PREVIEW_PARAM = "appearance_preview";
export const APPEARANCE_PREVIEW_THEME_MESSAGE = "polynet:appearance-preview-theme";
export const APPEARANCE_PREVIEW_READY_MESSAGE = "polynet:appearance-preview-ready";
export const IS_APPEARANCE_PREVIEW_FRAME = (() => {
  try {
    return window.parent !== window && new URLSearchParams(window.location.search).has(APPEARANCE_PREVIEW_PARAM);
  } catch {
    return false;
  }
})();
// `polynet dev` opens the community with ?design=draft and saves each edit to
// the draft; the preview re-reads it this often, so changes show within seconds.
const DRAFT_PREVIEW_POLL_MS = 1500;

function draftPreviewRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("design") === "draft";
  } catch {
    return false;
  }
}

function upsertHeadElement<T extends HTMLElement>(id: string, tag: string): T {
  const existing = document.getElementById(id);
  if (existing) return existing as T;
  const element = document.createElement(tag) as T;
  element.id = id;
  document.head.appendChild(element);
  return element;
}

function removeHeadElement(id: string) {
  document.getElementById(id)?.remove();
}

/**
 * Loads the active community's published theme and installs it as one style
 * element scoped to `[data-community-theme="<community id>"]`. Returns the
 * attribute value for the community's own area, or null for Polynet's look.
 * A failed read leaves Polynet's look in place: themes are never required.
 *
 * With ?design=draft and a manager's session, it shows the draft instead and
 * keeps re-reading it, so edits saved by `polynet dev` or an agent appear live.
 * Only managers can read a draft; anyone else sees the published look.
 */
export function useWebCommunityThemeStyle(
  communityId: string | null,
  options: {
    draftSession?: unknown;
    /** Kept with the colours, so the next visit's loading screen names the community. */
    identity?: { slug: string; name: string; logoUrl: string | null } | null;
  } = {},
): { attribute: string | null; theme: CommunityThemeV1 | null; previewingDraft: boolean; followsMemberMode: boolean } {
  const [loaded, setLoaded] = useState<{ communityId: string; theme: CommunityThemeV1 | null; draft: boolean } | null>(null);
  const draftSession = options.draftSession ?? null;
  const wantsDraft = Boolean(draftSession) && draftPreviewRequested();

  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRevision: number | null = null;
    const loadPublished = () => {
      fetchCloudPublishedCommunityTheme({ communityId })
        .then((theme) => {
          if (!cancelled) setLoaded({ communityId, theme, draft: false });
        })
        .catch(() => {
          if (!cancelled) setLoaded({ communityId, theme: null, draft: false });
        });
    };
    const loadDraft = () => {
      fetchCloudCommunityThemeDraft({ session: draftSession, communityId })
        .then((state) => {
          if (cancelled) return;
          if (state.draftRevision !== lastRevision) {
            lastRevision = state.draftRevision;
            setLoaded({ communityId, theme: state.draft, draft: true });
          }
          timer = setTimeout(loadDraft, DRAFT_PREVIEW_POLL_MS);
        })
        .catch(() => {
          // Not a manager after all, or offline: fall back to what members see.
          if (!cancelled && lastRevision === null) loadPublished();
          else if (!cancelled) timer = setTimeout(loadDraft, DRAFT_PREVIEW_POLL_MS * 4);
        });
    };
    const load = wantsDraft ? loadDraft : loadPublished;
    load();
    const onPublished = (event: Event) => {
      if ((event as CustomEvent<{ communityId?: string }>).detail?.communityId === communityId && !wantsDraft) loadPublished();
    };
    window.addEventListener(COMMUNITY_THEME_PUBLISHED_EVENT, onPublished);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(COMMUNITY_THEME_PUBLISHED_EVENT, onPublished);
    };
  }, [communityId, draftSession, wantsDraft]);

  const [preview, setPreview] = useState<{ communityId: string; theme: CommunityThemeV1 } | null>(null);
  useEffect(() => {
    if (!IS_APPEARANCE_PREVIEW_FRAME || !communityId) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; communityId?: string; theme?: CommunityThemeV1 } | null;
      if (data?.type === APPEARANCE_PREVIEW_THEME_MESSAGE && data.communityId === communityId && data.theme) {
        setPreview({ communityId, theme: data.theme });
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: APPEARANCE_PREVIEW_READY_MESSAGE, communityId }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [communityId]);

  const current = loaded && loaded.communityId === communityId ? loaded : null;
  const theme = preview && preview.communityId === communityId ? preview.theme : current?.theme ?? null;

  const pickEverywhere = useMemberPickEverywhere();
  const identity = options.identity ?? null;
  const identitySlug = identity?.slug ?? null;
  const previewingDraft = Boolean(current?.draft);
  useEffect(() => {
    if (!communityId || !theme) return;
    const style = upsertHeadElement<HTMLStyleElement>(STYLE_ELEMENT_ID, "style");
    // Once a member picks Light or Dark themselves, it wins over a one-version
    // look: they see its twin. The Customize preview shows exactly the version
    // being edited.
    const shown = IS_APPEARANCE_PREVIEW_FRAME || !pickEverywhere ? theme : communityThemeWithBothSchemes(theme);
    const css = compileCommunityThemeCss(shown, `[data-community-theme="${CSS.escape(communityId)}"]`);
    style.textContent = css;
    const fontUrl = communityThemeFontStylesheetUrl(theme);
    if (fontUrl) {
      const link = upsertHeadElement<HTMLLinkElement>(FONT_ELEMENT_ID, "link");
      link.rel = "stylesheet";
      link.href = fontUrl;
    }
    // The real colours are on: the boot colours come off, and the look as
    // shown is kept for the next visit's loading screen (not for previews).
    let frame = 0;
    let tries = 0;
    const keep = () => {
      const surface = document.querySelector<HTMLElement>(`[data-community-theme="${CSS.escape(communityId)}"]`);
      if (!surface) {
        if (tries++ < 120) frame = window.requestAnimationFrame(keep);
        else clearCommunityBootLook();
        return;
      }
      clearCommunityBootLook();
      if (identity && !IS_APPEARANCE_PREVIEW_FRAME && !previewingDraft) {
        rememberCommunityBootLook({ ...identity, surface, compiledCss: css });
      }
    };
    keep();
    return () => {
      window.cancelAnimationFrame(frame);
      removeHeadElement(STYLE_ELEMENT_ID);
      removeHeadElement(FONT_ELEMENT_ID);
    };
  }, [communityId, theme, pickEverywhere, identitySlug]);
  // A community without a theme opens in Polynet's look next time.
  const loadedWithoutTheme = Boolean(communityId && current && !current.theme && !preview);
  useEffect(() => {
    if (!loadedWithoutTheme) return;
    clearCommunityBootLook();
    if (identitySlug) forgetCommunityBootLook(identitySlug);
  }, [loadedWithoutTheme, identitySlug]);

  return {
    attribute: communityId && theme ? communityId : null,
    // The look in force (published, draft or the editor's preview), for the
    // settings the shell applies itself, such as the Channels look and rail.
    theme: communityId ? theme : null,
    previewingDraft: Boolean(communityId && current?.draft),
    // Every look offers Light/Dark (choosing one in a one-version look shows
    // its twin). False until the theme is read, so the choice doesn't flash.
    followsMemberMode: Boolean(communityId && (current || theme)),
  };
}
