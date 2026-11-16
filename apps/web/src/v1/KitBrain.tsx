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
// (and doesn't jump when the read lands) while it reads again.
const lastMaps = new Map<string, BrainMap>();

// The design lab draws panels from examples: it puts one here to be found.
export function rememberBrainMap(communityId: string, podChannelId: string | null, map: BrainMap): void {
  lastMaps.set(`${communityId}:${podChannelId ?? ""}`, map);
}

// The map of a community, or of one pod. map null: not read yet, or it could
// not be read; a panel never fails for want of it.
// version: anything that changes when what is known does (a builder adding,
// correcting or removing a note), so it is read again.
export function useBrainMap(session: unknown, communityId: string | null, podChannelId?: string | null, version?: string): { map: BrainMap | null; failed: boolean } {
  const key = `${communityId ?? ""}:${podChannelId ?? ""}`;
  const [state, setState] = useState<{ key: string; map: BrainMap | null; failed: boolean }>(() => ({ key, map: lastMaps.get(key) ?? null, failed: false }));
  useEffect(() => {
    // Another place: what was shown belongs to the last one.
    setState((last) => last.key === key ? last : { key, map: lastMaps.get(key) ?? null, failed: false });
    if (!session || !communityId) return;
    let live = true;
    fetchBrainMap({ session, communityId, podChannelId })
      .then((map) => { lastMaps.set(key, map); if (live) setState({ key, map, failed: false }); })
      .catch(() => { if (live) setState((last) => ({ key, map: last.key === key ? last.map : null, failed: true })); });
    return () => { live = false; };
  }, [session, communityId, podChannelId, key, version]);
  return state.key === key ? state : { map: lastMaps.get(key) ?? null, failed: false };
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
    <PanelPart label="The community brain" fact={brainFact(map)} action={props.onOpen ? <PanelAction onClick={props.onOpen}>Open</PanelAction> : null}>
      <PanelBrainMap map={map} now={props.now} onOpen={props.onOpen} />
      {latestLearned(map, props.max ?? 3).map((note) => <PanelLearned key={note.id} title={note.title} when={learnedWhen(note.at, props.now)} />)}
      {props.children}
    </PanelPart>
  );
}
