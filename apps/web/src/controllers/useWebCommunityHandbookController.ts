import { useCallback, useEffect, useRef, useState } from "react";

import {
  approveCommunityHandbook,
  fetchCommunityHandbook,
  requestCommunityHandbookDraft,
  saveCommunityHandbookDraft,
} from "../../../../shared/cloudCommunityHandbookGateway";
import { handbookEditorText, type CommunityHandbookManagerView } from "../../../../shared/communityHandbookEditorState";
import { resolveUsableSession, type EnsureSessionFn } from "../../../../shared/ensureUsableSession";

const DRAFT_POLL_MS = 3_000;

// Studio's handbook editor state: loads when the agent pane opens for a
// community, keeps the founder's unsaved text, and follows a running draft.
export function useWebCommunityHandbookController<SessionT>(params: {
  communityId: string | null;
  session: SessionT | null;
  ensureSession: EnsureSessionFn<SessionT>;
  enabled: boolean;
}) {
  const [view, setView] = useState<CommunityHandbookManagerView | null>(null);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "loading" | "saving" | "approving" | "drafting">(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const run = useCallback(async (
    kind: NonNullable<typeof busy>,
    action: (session: SessionT, communityId: string) => Promise<CommunityHandbookManagerView>,
    options: { replaceText: boolean },
  ): Promise<boolean> => {
    if (!params.communityId) return false;
    const session = await resolveUsableSession(params.session, params.ensureSession);
    if (!session) {
      setError("Sign in again to edit the handbook.");
      return false;
    }
    setBusy(kind);
    setError(null);
    try {
      const next = await action(session, params.communityId);
      setView(next);
      if (options.replaceText) {
        setText(handbookEditorText(next));
        setDirty(false);
      }
      return true;
    } catch {
      setError(kind === "loading" ? "Couldn't load the handbook." : "That didn't save. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [params.communityId, params.session, params.ensureSession]);

  // Load on open and when the community changes.
  useEffect(() => {
    setView(null);
    setText("");
    setDirty(false);
    if (!params.enabled || !params.communityId) return;
    void run("loading", (session, communityId) => fetchCommunityHandbook({ session, communityId }), { replaceText: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.enabled, params.communityId]);

  // While the agent drafts, check back until it finishes; the new draft
  // replaces the text only if the founder hasn't started editing.
  useEffect(() => {
    if (!params.enabled || !params.communityId || view?.draft_status !== "drafting") return;
    const timer = setTimeout(async () => {
      const session = await resolveUsableSession(params.session, params.ensureSession);
      if (!session || !params.communityId) return;
      try {
        const next = await fetchCommunityHandbook({ session, communityId: params.communityId });
        setView(next);
        if (next.draft_status !== "drafting" && !dirtyRef.current) setText(handbookEditorText(next));
      } catch {
        // Try again on the next tick.
        setView((current) => (current ? { ...current } : current));
      }
    }, DRAFT_POLL_MS);
    return () => clearTimeout(timer);
  }, [params.enabled, params.communityId, params.session, params.ensureSession, view]);

  return {
    view,
    text,
    dirty,
    busy,
    error,
    setText: (next: string) => {
      setText(next);
      setDirty(true);
    },
    save: () => run("saving", (session, communityId) => saveCommunityHandbookDraft({ session, communityId, text }), { replaceText: true }),
    approve: () => run("approving", (session, communityId) => approveCommunityHandbook({ session, communityId, text }), { replaceText: true }),
    // The founder chose a draft over their edits; keep them only if the request fails.
    requestDraft: () => run("drafting", (session, communityId) => requestCommunityHandbookDraft({ session, communityId }), { replaceText: false })
      .then((ok) => { if (ok) setDirty(false); }),
  };
}
