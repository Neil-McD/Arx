// Design system v1: the community brain, drawn (mock: "The map, third pass",
// neurons and synapses). The layout is fixed rules (shared/communityBrainLayout.ts),
// so the map keeps its shape as it grows; this only draws it.
// - panel: no words, the shape and its glow; under five learned things the
//   caller shows a list instead.
// - page: courses, subjects and pods named, and the few learned things that
//   are new or most used; hover names a point, a click picks it.
// Readings: community (everything), yours (your lessons and your things lit),
// gaps (for builders: the biggest subjects, which no course teaches, lit).
import { useId, useMemo } from "react";
import type { BrainMap } from "../../../../shared/communityBrain";
import { chooseLabels, layoutBrain, type LayoutPoint } from "../../../../shared/communityBrainLayout";
import { cx } from "./kit";

export type BrainReading = "community" | "yours" | "gaps";
// The fewest learned things worth a map; fewer, and a list says more.
export const BRAIN_MAP_MIN_POINTS = 5;

function curve(a: { x: number; y: number }, b: { x: number; y: number }, bend: number): string {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function fibrePath(path: Array<{ x: number; y: number }>): string {
  return path.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
}

export function KitBrainMap(props: {
  map: BrainMap;
  size: "panel" | "page";
  reading?: BrainReading;
  now: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const reading = props.reading ?? "community";
  // Each map's own gradients: several maps can share a page.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const glow = `brain-glow-${uid}`;
  const mineGlow = `brain-mine-${uid}`;
  const page = props.size === "page";
  const layout = useMemo(() => layoutBrain(props.map, props.now), [props.map, props.now]);
  // The biggest subjects are where the community knows what no course teaches.
  const gapKeys = useMemo(() => new Set(props.map.subjects.filter((s) => s.size >= 3).sort((a, b) => b.size - a.size).slice(0, 3).map((s) => `subject:${s.name}`)), [props.map]);
  const labels = useMemo(() => page ? chooseLabels(layout, { max: 9 }) : [], [layout, page]);
  const labelled = new Map(labels.map((label) => [label.id, label]));
  // Room for the names too, so none is cut at the edge.
  let { minX, minY, maxX, maxY } = layout.bounds;
  for (const { box } of labels) { minX = Math.min(minX, box.x - 8); maxX = Math.max(maxX, box.x + box.w + 8); }

  const lit = (p: LayoutPoint) => reading === "yours" ? p.point.mine : reading === "gaps" ? p.point.at.kind === "subject" && gapKeys.has(`subject:${p.point.at.name}`) : true;
  const dimAll = reading !== "community";
  const pick = (id: string) => props.onSelect?.(id);

  return (
    <svg className={cx(page ? "brain brain-page" : "brain brain-panel")} viewBox={`${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}`}
      role="img" aria-label={`A map of what ${props.map.center.name} knows: ${props.map.counts.courses} courses, ${props.map.counts.learned} things learned`}>
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" className={cx("brain-glow-in")} /><stop offset="1" className={cx("brain-glow-out")} />
        </radialGradient>
        <radialGradient id={mineGlow} cx="50%" cy="50%" r="50%">
          <stop offset="0" className={cx("brain-mine-in")} /><stop offset="1" className={cx("brain-glow-out")} />
        </radialGradient>
      </defs>

      {/* Fibres: the courses. */}
      {layout.fibres.map((fibre) => <path key={fibre.key} className={cx(dimAll ? "brain-fibre dim" : "brain-fibre")} d={fibrePath(fibre.path)} />)}
      {/* Spokes to subjects and pods. */}
      {layout.hubs.filter((hub) => hub.kind !== "course").map((hub) => {
        const gap = reading === "gaps" && gapKeys.has(hub.key);
        return <path key={`s-${hub.key}`} className={cx(gap ? "brain-spoke gap" : dimAll ? "brain-spoke dim" : "brain-spoke")} d={curve(layout.center, hub, (hashBend(hub.key)))} />;
      })}
      {/* Branches: what was learned, off its lesson, subject or pod. */}
      {layout.points.map((p) => <path key={`b-${p.id}`} className={cx(dimAll && !lit(p) ? "brain-branch dim" : "brain-branch")} d={curve(p.anchor, p, hashBend(p.id))} strokeWidth={0.7 + Math.min(1, p.point.use / 10) * 0.8} />)}
      {/* Synapses: what answers read together. */}
      {layout.arcs.map((arc) => {
        const hot = props.selectedId && arc.ids.includes(props.selectedId);
        return <path key={arc.ids.join("|")} className={cx(hot ? "brain-arc hot" : dimAll ? "brain-arc dim" : "brain-arc")} d={curve(arc.a, arc.b, 0.22)} />;
      })}

      <circle cx={0} cy={0} r={52} fill={`url(#${glow})`} />

      {/* Learned things. */}
      {layout.points.map((p) => {
        const on = lit(p);
        const cls = !on && dimAll ? "brain-dot dim" : reading === "yours" && p.point.mine ? "brain-dot mine"
          : p.point.kind === "taught" ? "brain-dot taught" : p.point.title === null && !page ? "brain-dot" : p.point.fresh ? "brain-dot fresh" : "brain-dot";
        const selected = props.selectedId === p.id;
        const name = p.point.title ?? (p.point.kind === "taught" ? "Taught by a host" : "Something the community learned");
        return (
          <g key={p.id} className={cx(page ? "brain-node pickable" : "brain-node")}
            {...(page ? { tabIndex: 0, role: "button", "aria-label": name, onClick: () => pick(p.id), onKeyDown: (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(p.id); } } } : {})}>
            {page ? <title>{name}</title> : null}
            {p.point.fresh && on && reading !== "yours" ? <circle cx={p.x} cy={p.y} r={p.r + 10} fill={`url(#${glow})`} /> : null}
            {reading === "yours" && p.point.mine ? <circle cx={p.x} cy={p.y} r={p.r + 9} fill={`url(#${mineGlow})`} /> : null}
            <circle className={cx(cls)} cx={p.x} cy={p.y} r={p.r} />
            {selected ? <circle className={cx("brain-ring")} cx={p.x} cy={p.y} r={p.r + 5} /> : null}
            {/* A wider target than the dot, for a finger. */}
            {page ? <circle className={cx("brain-hit")} cx={p.x} cy={p.y} r={Math.max(10, p.r + 6)} /> : null}
          </g>
        );
      })}

      {/* Lessons, along their fibres. */}
      {layout.lessons.map((lesson) => {
        const mine = reading === "yours" && lesson.done;
        const cls = mine ? "brain-lesson mine" : dimAll ? "brain-lesson dim" : lesson.done ? "brain-lesson done" : "brain-lesson";
        return (
          <g key={lesson.id} className={cx(page ? "brain-node pickable" : "brain-node")}
            {...(page ? { tabIndex: 0, role: "button", "aria-label": `Lesson ${lesson.order}: ${lesson.title}`, onClick: () => pick(lesson.id), onKeyDown: (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(lesson.id); } } } : {})}>
            {page ? <title>{`${lesson.order}. ${lesson.title}`}</title> : null}
            {mine ? <circle cx={lesson.x} cy={lesson.y} r={15} fill={`url(#${mineGlow})`} /> : null}
            <circle className={cx(cls)} cx={lesson.x} cy={lesson.y} r={lesson.r} />
            {props.selectedId === lesson.id ? <circle className={cx("brain-ring")} cx={lesson.x} cy={lesson.y} r={lesson.r + 5} /> : null}
            {page ? <text className={cx(dimAll && !mine ? "brain-num dim" : "brain-num")} x={lesson.x} y={lesson.y - lesson.r - 6} textAnchor="middle">{lesson.order}</text> : null}
            {page ? <circle className={cx("brain-hit")} cx={lesson.x} cy={lesson.y} r={12} /> : null}
          </g>
        );
      })}

      {/* Hubs: subjects and pods are cells; a course is named at its fibre's end. */}
      {layout.hubs.map((hub) => {
        const gap = reading === "gaps" && gapKeys.has(hub.key);
        const right = Math.cos((hub.angle * Math.PI) / 180) >= -0.2;
        return (
          <g key={hub.key}>
            {hub.kind === "pod" ? (
              <>
                <circle className={cx("brain-membrane")} cx={hub.x} cy={hub.y} r={hub.inside ? 44 : 18} />
                <circle className={cx(hub.inside ? "brain-cell" : "brain-cell closed")} cx={hub.x} cy={hub.y} r={hub.inside ? 5.2 : 3} />
              </>
            ) : hub.kind === "subject" || hub.kind === "other" ? (
              <>
                <circle className={cx(gap ? "brain-cell gap" : dimAll ? "brain-cell dim" : hub.kind === "other" ? "brain-cell other" : "brain-cell")} cx={hub.x} cy={hub.y} r={6} />
                <circle className={cx(gap ? "brain-nucleus gap" : dimAll ? "brain-nucleus dim" : "brain-nucleus")} cx={hub.x} cy={hub.y} r={2} />
              </>
            ) : null}
            {page ? (
              <text className={cx(gap ? "brain-hub gap" : dimAll ? "brain-hub dim" : hub.kind === "pod" && !hub.inside ? "brain-hub closed" : "brain-hub")}
                x={hub.kind === "course" ? hub.x : hub.x} y={hub.kind === "course" ? hub.y + 4 : hub.kind === "pod" ? hub.y + (hub.inside ? 60 : 32) : hub.y - 13}
                textAnchor={hub.kind === "course" ? (right ? "start" : "end") : "middle"}>
                {hub.kind === "pod" && !hub.inside ? `${hub.label} · ${hub.count}` : hub.label}
              </text>
            ) : null}
            {page && gap ? <text className={cx("brain-gapnote")} x={hub.x} y={hub.y - 28} textAnchor="middle">No course teaches this</text> : null}
          </g>
        );
      })}

      {/* The few learned things worth naming. */}
      {page ? labels.map((label) => {
        const p = layout.points.find((entry) => entry.id === label.id)!;
        const dim = dimAll && !lit(p);
        return (
          <text key={`l-${label.id}`} className={cx(props.selectedId === label.id ? "brain-name on" : dim ? "brain-name dim" : "brain-name")}
            x={label.right ? label.box.x : label.box.x + label.box.w} y={p.y + 4} textAnchor={label.right ? "start" : "end"}>
            {p.point.title!.length > 28 ? `${p.point.title!.slice(0, 27)}…` : p.point.title}
          </text>
        );
      }) : null}
      {page && props.selectedId && !labelled.has(props.selectedId) ? (() => {
        const p = layout.points.find((entry) => entry.id === props.selectedId);
        if (!p?.point.title) return null;
        const right = p.x >= p.anchor.x;
        return <text className={cx("brain-name on")} x={p.x + (right ? p.r + 7 : -p.r - 7)} y={p.y + 4} textAnchor={right ? "start" : "end"}>{p.point.title}</text>;
      })() : null}

      <circle className={cx("brain-core")} cx={0} cy={0} r={8} />
      <circle className={cx("brain-core-ring")} cx={0} cy={0} r={13} />
      {page ? <text className={cx("brain-center")} x={0} y={33} textAnchor="middle">{props.map.center.name}</text> : null}
    </svg>
  );
}

// How much a line bends, the same every time for the same thing.
function hashBend(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.4;
}
