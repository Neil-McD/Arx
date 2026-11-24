// Design system v1: what the place knows, as the panels show it (mock:
// "Right panels, second pass"). The community brain in a panel: how much the
// guide answers from and what is new this week, a small map of it with no
// words (KitBrainMap), and the latest things learned by name. It all comes
// from the one map read (convex/communityBrain.ts getBrainMap): anyone in
// the community reads it, and a member is sent only the names of what was
// learned from posts they can read. With fewer than five learned things
// there is no map, only the names.
import { useEffect, type ReactNode } from "react";
import { brainCanDrawMap, brainFact, brainHasContent, latestLearned, type BrainMap } from "../../../../shared/communityBrain";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { refreshBrainLessonMentions } from "../../../../shared/cloudCommunityBrainGateway";
import { cx } from "./kit";
import { KitBrainMap } from "./KitBrainMap";
import { PanelAction, PanelLearned, PanelPart } from "./KitPanel";

// The design lab draws panels from examples: it puts one here to be found
// (pass labSession as the session).
const LAB_SESSION = {};
const labMaps = new Map<string, BrainMap>();
// When each community's lesson links were last asked for, so a stale map
// asks once, not on every render or from every panel.
const linkRefreshAsked = new Map<string, number>();
const LINK_REFRESH_EVERY_MS = 60_000;
export const labSession: unknown = LAB_SESSION;
export function rememberBrainMap(communityId: string, podChannelId: string | null, map: BrainMap): void {
  labMaps.set(`${communityId}:${podChannelId ?? ""}`, map);
}

// The map of a community, or of one pod, live (shared/liveQuery.ts): it
// updates when a builder adds, corrects or removes a note, and stays on
// screen across pages. A map is one person's view (a builder's holds names a
// member's doesn't); answers are kept per signed-in person, never shared.
// map null: not read yet, or it could not be read; a panel never fails for
// want of it.
export function useBrainMap(session: unknown, communityId: string | null, podChannelId?: string | null): { map: BrainMap | null; failed: boolean; settled: boolean } {
  const lab = session === LAB_SESSION;
  const subject = session && !lab ? resolveAuthSubject(session as AuthSessionLike) : null;
  const { data, error } = useLiveQuery<BrainMap>(session, "communityBrain:getBrainMap",
    subject && communityId ? { authSubject: subject, communityId, ...(podChannelId ? { podChannelId } : {}) } : null);
  // Its lesson links are behind the lessons: ask once for them to be worked
  // out again; the map updates by itself when they are.
  const stale = !lab && !podChannelId && Boolean(data?.mentions_stale);
  useEffect(() => {
    if (!stale || !communityId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ask = () => {
      const wait = (linkRefreshAsked.get(communityId) ?? 0) + LINK_REFRESH_EVERY_MS - Date.now();
      // Asked a moment ago (here or from another panel): try again once the
      // minute is up, for as long as the map stays stale.
      if (wait > 0) { timer = setTimeout(ask, wait); return; }
      linkRefreshAsked.set(communityId, Date.now());
      void refreshBrainLessonMentions({ session, communityId }).catch(() => undefined);
      timer = setTimeout(ask, LINK_REFRESH_EVERY_MS);
    };
    ask();
    return () => { if (timer) clearTimeout(timer); };
  }, [stale, communityId, session]);
  if (lab) return { map: labMaps.get(`${communityId ?? ""}:${podChannelId ?? ""}`) ?? null, failed: false, settled: true };
  // settled: it has answered (a map, or the news that it can't be read).
  return { map: data ?? null, failed: Boolean(error) && !data, settled: data !== undefined || Boolean(error) };
}

// When something was learned, in a word: "today", "Tue", "Nov 3".
export function learnedWhen(iso: string, now: number): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.floor((now - at.getTime()) / 86_400_000);
  if (days <= 0 && at.getDate() === new Date(now).getDate()) return "today";
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: "short" });
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The small map: no words, nothing in it to pick. With somewhere to open,
// the whole map is the way there.
export function PanelBrainMap(props: { map: BrainMap; now: number; onOpen?: () => void; label?: string }) {
  if (!brainCanDrawMap(props.map)) return null;
  const drawing = <KitBrainMap map={props.map} size="panel" now={props.now} />;
  return props.onOpen
    ? <button type="button" className={cx("brainmini")} onClick={props.onOpen} aria-label={props.label ?? "Open the community brain"}>{drawing}</button>
    : <div className={cx("brainmini")}>{drawing}</div>;
}

// The panels' "community brain" part: the count, the small map, the latest
// names, and Open. Nothing in the brain and nothing more to say: no part.
export function PanelBrain(props: { map: BrainMap | null; now: number; max?: number; onOpen?: () => void; children?: ReactNode }) {
  const { map } = props;
  if (!map || (!brainHasContent(map) && !props.children)) return null;
  return (
    <PanelPart label="The community brain" action={props.onOpen ? <PanelAction onClick={props.onOpen}>Open</PanelAction> : null}>
      <PanelBrainMap map={map} now={props.now} onOpen={props.onOpen} />
      {/* The count sits under the map, where it has room at any panel width. */}
      {brainFact(map) ? <span className={cx("braincap")}>{brainFact(map)}</span> : null}
      {latestLearned(map, props.max ?? 3).map((note) => <PanelLearned key={note.id} title={note.title} when={learnedWhen(note.at, props.now)} />)}
      {props.children}
    </PanelPart>
  );
}
