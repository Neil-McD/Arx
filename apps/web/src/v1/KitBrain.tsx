// Design system v1: what the place knows, as the panels show it (mock:
// "Right panels, second pass"). The community brain in a panel: how much the
// guide answers from and what is new this week, a small map of it with no
// words (KitBrainMap), and the latest things learned by name. It all comes
// from the one map read (convex/communityBrain.ts getBrainMap): anyone in
// the community reads it, and a member is sent only the names of what was
// learned from posts they can read. With fewer than five learned things
// there is no map, only the names.
import { useEffect, useState, type ReactNode } from "react";
import { brainFact, latestLearned, type BrainMap } from "../../../../shared/communityBrain";
import { fetchBrainMap } from "../../../../shared/cloudCommunityBrainGateway";
import { cx } from "./kit";
import { BRAIN_MAP_MIN_POINTS, KitBrainMap } from "./KitBrainMap";
import { PanelAction, PanelLearned, PanelPart } from "./KitPanel";

// The last map read for each place, so a panel coming back draws at once
// (and doesn't jump when the read lands) while it reads again. A map is one
// person's view (a builder's holds names a member's doesn't), so what is
// kept is kept per signed-in session and never shown to another.
const lastMaps = new WeakMap<object, Map<string, BrainMap>>();
const LAB_SESSION = {};
function kept(session: unknown, key: string): BrainMap | null {
  return typeof session === "object" && session ? lastMaps.get(session)?.get(key) ?? null : null;
}
function keep(session: unknown, key: string, map: BrainMap): void {
  if (typeof session !== "object" || !session) return;
  if (!lastMaps.has(session)) lastMaps.set(session, new Map());
  lastMaps.get(session)!.set(key, map);
}

// The design lab draws panels from examples: it puts one here to be found
// (pass labSession as the session).
export const labSession: unknown = LAB_SESSION;
export function rememberBrainMap(communityId: string, podChannelId: string | null, map: BrainMap): void {
  keep(LAB_SESSION, `${communityId}:${podChannelId ?? ""}`, map);
}

// The map of a community, or of one pod. map null: not read yet, or it could
// not be read; a panel never fails for want of it.
// version: anything that changes when what is known does (a builder adding,
// correcting or removing a note), so it is read again.
export function useBrainMap(session: unknown, communityId: string | null, podChannelId?: string | null, version?: string): { map: BrainMap | null; failed: boolean } {
  const key = `${communityId ?? ""}:${podChannelId ?? ""}`;
  const [state, setState] = useState<{ session: unknown; key: string; map: BrainMap | null; failed: boolean }>(() => ({ session, key, map: kept(session, key), failed: false }));
  const same = (last: { session: unknown; key: string }) => last.session === session && last.key === key;
  useEffect(() => {
    // Another place or another person: what was shown belongs to the last one.
    setState((last) => same(last) ? last : { session, key, map: kept(session, key), failed: false });
    if (!session || !communityId || session === LAB_SESSION) return;
    let live = true;
    fetchBrainMap({ session, communityId, podChannelId })
      .then((map) => { keep(session, key, map); if (live) setState({ session, key, map, failed: false }); })
      .catch(() => { if (live) setState((last) => ({ session, key, map: same(last) ? last.map : null, failed: true })); });
    return () => { live = false; };
  }, [session, communityId, podChannelId, key, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return same(state) ? state : { map: kept(session, key), failed: false };
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
  if (props.map.points.length < BRAIN_MAP_MIN_POINTS) return null;
  const drawing = <KitBrainMap map={props.map} size="panel" now={props.now} />;
  return props.onOpen
    ? <button type="button" className={cx("brainmini")} onClick={props.onOpen} aria-label={props.label ?? "Open the community brain"}>{drawing}</button>
    : <div className={cx("brainmini")}>{drawing}</div>;
}

// The panels' "community brain" part: the count, the small map, the latest
// names, and Open. Nothing learned and nothing more to say: no part.
export function PanelBrain(props: { map: BrainMap | null; now: number; max?: number; onOpen?: () => void; children?: ReactNode }) {
  const { map } = props;
  if (!map || (!map.counts.learned && !props.children)) return null;
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
