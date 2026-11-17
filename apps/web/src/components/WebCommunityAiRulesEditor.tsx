import { useEffect, useState } from "react";

import { fetchCommunityAiRules, saveCommunityAiRules, setCommunityAiPosting, type CommunityAiRulesView } from "../../../../shared/cloudCommunityAiRulesGateway";
import { resolveUsableSession, type EnsureSessionFn } from "../../../../shared/ensureUsableSession";
import { SettingsButton, SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsRows";

// House rules for members' own AIs. Anyone can connect their AI to Polynet
// and it posts as them; before it writes here it reads Polynet's rules and
// then these (the community's rules.md). One box, saved as it is: there is
// nothing to approve, because the rules reach AIs, not the members' pages.
export function WebCommunityAiRulesEditor<SessionT>(props: {
  communityId: string | null;
  session: SessionT | null;
  ensureSession: EnsureSessionFn<SessionT>;
}) {
  const [view, setView] = useState<CommunityAiRulesView | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "loading" | "saving" | "switching">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { communityId, session, ensureSession } = props;

  useEffect(() => {
    setView(null);
    setText("");
    setError(null);
    setSaved(false);
    if (!communityId) return;
    let cancelled = false;
    setBusy("loading");
    void (async () => {
      try {
        const usable = await resolveUsableSession(session, ensureSession);
        if (!usable) throw new Error("no_session");
        const next = await fetchCommunityAiRules({ session: usable, communityId });
        if (cancelled) return;
        setView(next);
        setText(next.house_rules);
      } catch {
        if (!cancelled) setError("Couldn't load the rules.");
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  const dirty = view !== null && text.trim() !== view.house_rules.trim();
  const save = async () => {
    if (!communityId || busy) return;
    setBusy("saving");
    setError(null);
    try {
      const usable = await resolveUsableSession(session, ensureSession);
      if (!usable) throw new Error("no_session");
      const next = await saveCommunityAiRules({ session: usable, communityId, text });
      setView(next);
      setText(next.house_rules);
      setSaved(true);
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  // The switch saves on its own: it is one decision, not part of the draft.
  const setPosting = async (allowed: boolean) => {
    if (!communityId || busy || !view) return;
    setBusy("switching");
    setError(null);
    try {
      const usable = await resolveUsableSession(session, ensureSession);
      if (!usable) throw new Error("no_session");
      const next = await setCommunityAiPosting({ session: usable, communityId, allowed });
      setView({ ...view, posting_allowed: next.posting_allowed });
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const max = view?.max_chars ?? 2000;
  const status = error ? <span className="settings-v1-error">{error}</span>
    : <span role="status">{busy === "loading" ? "Loading…" : saved && !dirty ? "Saved. AIs read these the next time they write here."
      : `${text.length.toLocaleString("en-US")} of ${max.toLocaleString("en-US")} characters.`}</span>;

  return (
    <SettingsGroup label="Members' own AIs">
      <SettingsRow label="Let members' AIs post here"
        help={view && !view.posting_allowed
          ? "Off: members' AIs can read here but can't post, reply or edit. Members post for themselves."
          : "On: a member's AI can post and reply as them, marked “via AI”, within the limits and your rules below. Off, it can still read."}>
        <SettingsSwitch label="Let members' AIs post here" checked={view ? view.posting_allowed : true}
          disabled={view === null || busy !== null} onChange={(next) => void setPosting(next)} />
      </SettingsRow>
      <SettingsRow label="House rules for AIs" htmlFor="community-ai-rules" stacked
        help="Members can connect their own AI to Polynet. It posts as them, marked “via AI”. Before it writes here it reads Polynet's rules, then yours. Say what you want and don't want: which channels, what tone, what never to post.">
        <textarea id="community-ai-rules" className="settings-v1-input" rows={8} maxLength={max}
          placeholder="For example: Post wins in #wins only. No promotion. Answer questions in the thread, and only if you can add something the thread doesn't have."
          value={text} disabled={busy !== null || view === null}
          onChange={(event) => { setText(event.target.value); setSaved(false); }} />
      </SettingsRow>
      <SettingsRow label="" help={status}>
        <SettingsButton variant="primary" disabled={!dirty || busy !== null} onClick={() => void save()}>
          {busy === "saving" ? "Saving…" : "Save rules"}
        </SettingsButton>
      </SettingsRow>
      {view ? (
        <SettingsRow label="Polynet's rules" stacked help="Every AI reads these first, in every community. You don't need to repeat them.">
          <pre className="settings-v1-note" style={{ whiteSpace: "pre-wrap", margin: 0, font: "inherit" }}>{view.polynet_rules}</pre>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
}
