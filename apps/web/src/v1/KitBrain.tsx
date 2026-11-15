// Design system v1: what the place knows, as the panels show it (mock:
// "Right panels, second pass"). The community brain: how much the guide
// answers from and what is new this week; and what it learned lately, by
// name. Anyone in the community reads it; a member is sent only the names of
// what was learned from posts they can read (convex/communityMemory.ts
// getLearnedLately). The map itself is not drawn yet.
import { useEffect, useState } from "react";
import { fetchLearnedLately, type LearnedLatelyView } from "../../../../shared/cloudCommunityNotesGateway";
import { PanelLearned } from "./KitPanel";

// null: not loaded, the guide has nothing, or it could not be read. A panel
// never fails for want of it.
// version: anything that changes when the notes do (a builder adding,
// correcting or removing one), so the panel reads them again.
export function useLearnedLately(session: unknown, communityId: string | null, version?: string): LearnedLatelyView | null {
  const [view, setView] = useState<LearnedLatelyView | null>(null);
  // Another community: what was shown belongs to the last one.
  useEffect(() => { setView(null); }, [session, communityId]);
  useEffect(() => {
    if (!session || !communityId) return;
    let live = true;
    fetchLearnedLately({ session, communityId }).then((next) => { if (live) setView(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [session, communityId, version]);
  return view;
}

// "11 learned · 4 this week".
export function learnedFact(view: LearnedLatelyView): string | null {
  if (!view.total) return null;
  return [`${view.total}${view.more ? "+" : ""} learned`, view.this_week ? `${view.this_week} this week` : null].filter(Boolean).join(" · ");
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

// The latest things learned, one row each.
export function LearnedRows(props: { view: LearnedLatelyView; now: number; max?: number }) {
  return (
    <>
      {props.view.latest.slice(0, props.max ?? 3).map((note, index) => (
        <PanelLearned key={index} title={note.title} when={learnedWhen(note.at, props.now)} />
      ))}
    </>
  );
}
