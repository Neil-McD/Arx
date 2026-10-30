import { useCallback, useEffect, useState } from "react";
import { useWebCommunityFrame } from "./useWebCommunityFrame";
import {
  DEFAULT_COMMUNITY_LAYOUT,
  layoutForMemberChoice,
  type CommunityLayoutPosition,
  type CommunityLayoutV1,
} from "../../../../shared/communityLayout";
import {
  fetchCloudCommunityLayoutDraft,
  fetchCloudMyCommunityLayoutChoice,
  fetchCloudPublishedCommunityLayout,
  setCloudMyCommunityLayoutChoice,
} from "../../../../shared/cloudCommunityLayoutGateway";

/** Fired after a manager publishes, so the open community picks up its new layout. */
export const COMMUNITY_LAYOUT_PUBLISHED_EVENT = "polynet:community-layout-published";

// Same preview rule as the theme (useWebCommunityThemeStyle): `polynet dev`
// opens the community with ?design=draft and the preview re-reads the draft.
const DRAFT_PREVIEW_POLL_MS = 1500;

function draftPreviewRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("design") === "draft";
  } catch {
    return false;
  }
}

/**
 * Loads the active community's published layout. Until it loads, and when a
 * community has none or the read fails, Polynet's own layout is used: layouts
 * are never required. With ?design=draft and a manager's session it shows the
 * draft instead and keeps re-reading it; anyone else sees the published layout.
 */
export function useWebCommunityLayout(
  communityId: string | null,
  options: { draftSession?: unknown } = {},
): { layout: CommunityLayoutV1; ready: boolean } {
  const [loaded, setLoaded] = useState<{ communityId: string; layout: CommunityLayoutV1 | null } | null>(null);
  const draftSession = options.draftSession ?? null;
  const wantsDraft = Boolean(draftSession) && draftPreviewRequested();

  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRevision: number | null = null;
    const loadPublished = () => {
      fetchCloudPublishedCommunityLayout({ communityId })
        .then((layout) => {
          if (!cancelled) setLoaded({ communityId, layout });
        })
        .catch(() => {
          if (!cancelled) setLoaded({ communityId, layout: null });
        });
    };
    const loadDraft = () => {
      fetchCloudCommunityLayoutDraft({ session: draftSession, communityId })
        .then((state) => {
          if (cancelled) return;
          if (state.draftRevision !== lastRevision) {
            lastRevision = state.draftRevision;
            setLoaded({ communityId, layout: state.draft });
          }
          timer = setTimeout(loadDraft, DRAFT_PREVIEW_POLL_MS);
        })
        .catch(() => {
          // Not a manager after all, or offline: fall back to what members see.
          if (!cancelled && lastRevision === null) loadPublished();
          else if (!cancelled) timer = setTimeout(loadDraft, DRAFT_PREVIEW_POLL_MS * 4);
        });
    };
    (wantsDraft ? loadDraft : loadPublished)();
    const onPublished = (event: Event) => {
      if ((event as CustomEvent<{ communityId?: string }>).detail?.communityId === communityId && !wantsDraft) loadPublished();
    };
    window.addEventListener(COMMUNITY_LAYOUT_PUBLISHED_EVENT, onPublished);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(COMMUNITY_LAYOUT_PUBLISHED_EVENT, onPublished);
    };
  }, [communityId, draftSession, wantsDraft]);

  // `ready` once this community's layout (or its absence) is known, so a page
  // can tell "hidden by the layout" apart from "not loaded yet".
  const ready = Boolean(loaded && loaded.communityId === communityId);
  return { layout: (ready ? loaded!.layout : null) ?? DEFAULT_COMMUNITY_LAYOUT, ready };
}

// The active community's layout for components below the shell.
export function useActiveCommunityLayout(): CommunityLayoutV1 {
  return useWebCommunityFrame().layout;
}

export type WebCommunityLayoutChoice = {
  allowed: CommunityLayoutPosition[];
  // The owner's layout, which a member gets back by clearing their pick.
  standard: CommunityLayoutPosition;
  current: CommunityLayoutPosition;
  preference: CommunityLayoutPosition | null;
  onChoose: (position: CommunityLayoutPosition | null) => void;
};

/**
 * The member's own arrangement, where the owner's layout offers a choice
 * (navigation.member_choice). Returns the layout to render and the choice for
 * the Display menu, or a null choice when there is nothing to pick. A pick
 * shows at once and is saved in the background; a failed save goes back.
 */
// For screenshots and reviews: ?layout=classroom or ?layout=channels shows that
// layout in this tab only, like ?feel= for the looks. Nothing is saved, and only
// a layout the owner offers members can be shown this way.
const LAYOUT_URL_OVERRIDE: CommunityLayoutPosition | null = (() => {
  try {
    const value = new URLSearchParams(window.location.search).get("layout");
    return value === "classroom" ? "top" : value === "channels" ? "side" : null;
  } catch {
    return null;
  }
})();

export function useWebCommunityLayoutChoice(
  communityId: string | null,
  session: unknown | null,
  layout: CommunityLayoutV1,
): { layout: CommunityLayoutV1; choice: WebCommunityLayoutChoice | null } {
  const [state, setState] = useState<{ communityId: string; preference: CommunityLayoutPosition | null } | null>(null);
  const offered = layout.navigation.member_choice;
  const canChoose = Boolean(communityId && session && offered.length > 1);

  useEffect(() => {
    if (!canChoose || !communityId) return;
    let cancelled = false;
    fetchCloudMyCommunityLayoutChoice({ session, communityId })
      .then((result) => {
        if (!cancelled) setState({ communityId, preference: result.position });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canChoose, communityId, session]);

  const onChoose = useCallback(
    (position: CommunityLayoutPosition | null) => {
      if (!communityId || !session) return;
      const previous = state && state.communityId === communityId ? state.preference : null;
      setState({ communityId, preference: position });
      setCloudMyCommunityLayoutChoice({ session, communityId, position })
        .then((result) => setState({ communityId, preference: result.position }))
        .catch(() => setState({ communityId, preference: previous }));
    },
    [communityId, session, state],
  );

  if (!canChoose) return { layout, choice: null };
  const saved = state && state.communityId === communityId ? state.preference : null;
  const preference = LAYOUT_URL_OVERRIDE && offered.includes(LAYOUT_URL_OVERRIDE) ? LAYOUT_URL_OVERRIDE : saved;
  const effective = layoutForMemberChoice(layout, preference);
  return {
    layout: effective,
    choice: { allowed: offered, standard: layout.navigation.position, current: effective.navigation.position, preference, onChoose },
  };
}
