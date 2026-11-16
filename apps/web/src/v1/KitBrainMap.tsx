// Design system v1: the community brain, drawn (mock: "The map, third pass",
// neurons and synapses). The layout is fixed rules (shared/communityBrainLayout.ts),
// so the map keeps its shape as it grows; this only draws it.
// - panel: no words, the shape and its glow; under five learned things the
//   caller shows a list instead.
// - page: courses, subjects and pods named, and the few learned things that
//   are new or most used; hover names a point, a click picks it. Scroll or
//   pinch zooms, a drag pans, a double click zooms in there; zooming spreads
//   things apart (dots and names keep their size) and names more of them.
// Readings: community (everything), yours (your lessons and your things lit),
// gaps (for builders: the biggest subjects, which no course teaches, lit).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { BrainMap } from "../../../../shared/communityBrain";
import { chooseLabels, fitStage, fitView, isFitView, layoutBrain, panBy, revealPoint, scaleLayout, stageWindow, zoomAt, type BrainView, type LabelBox, type LayoutPoint } from "../../../../shared/communityBrainLayout";
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
  // Page only: a click on empty space.
  onClear?: () => void;
  // Page only: how many pixels of the stage's right side a panel covers.
  coverRight?: number;
}) {
  const reading = props.reading ?? "community";
  // Each map's own gradients: several maps can share a page.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const glow = `brain-glow-${uid}`;
  const mineGlow = `brain-mine-${uid}`;
  const page = props.size === "page";
  const base = useMemo(() => layoutBrain(props.map, props.now), [props.map, props.now]);
  // The page's map is drawn in screen pixels: the stage it fills, measured.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 900, h: 640 });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !page || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setStage((last) => Math.abs(last.w - box.width) < 1 && Math.abs(last.h - box.height) < 1 ? last : { w: Math.round(box.width), h: Math.round(box.height) });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(wrap);
    return () => watch.disconnect();
  }, [page]);
  // The view (page only): how far in, and what is at its middle.
  // Pixels per layout unit: the whole map fits the stage with its names,
  // and with room above and below for the controls over the map.
  const { scale: fit, frame: bounds } = useMemo(() => page ? fitStage(base, stage, { inset: { x: Math.min(110, stage.w * 0.1), y: 64 }, hubCharW: 8.2, edge: 16 })
    : { scale: 1, frame: base.extent }, [base, stage, page]);
  const [view, setView] = useState<BrainView>(() => fitView(bounds));
  // A new map, or a stage of another size while the whole map is shown: fit again.
  useEffect(() => { setView(fitView(bounds)); }, [props.map]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setView((current) => current.k === 1 ? fitView(bounds) : current); }, [bounds]); // eslint-disable-line react-hooks/exhaustive-deps
  const scale = page ? fit * view.k : 1;
  const layout = useMemo(() => scaleLayout(base, scale), [base, scale]);
  // On the page, dots are a little larger: they are read, not glanced at.
  const dot = page ? Math.min(1.5, Math.max(0.7, 0.45 + scale * 0.55)) : 1;
  const lessonR = (r: number) => page ? Math.max(1.8, r * 1.3 * Math.min(1, scale)) : r;
  const podR = 44 * scale;
  const win = page ? stageWindow(view, scale, stage) : { x: base.bounds.minX, y: base.bounds.minY, w: base.bounds.maxX - base.bounds.minX, h: base.bounds.maxY - base.bounds.minY };
  // The biggest subjects are where the community knows what no course teaches.
  const gapKeys = useMemo(() => new Set(props.map.subjects.filter((s) => s.size >= 3).sort((a, b) => b.size - a.size).slice(0, 3).map((s) => `subject:${s.name}`)), [props.map]);
  // Names go where there is room on screen: only for what is in view, never
  // over a hub's name, and as many as the stage has space for.
  const labels = useMemo(() => {
    if (!page) return [];
    const taken: LabelBox[] = layout.hubs.map((hub) => {
      const w = hub.label.length * 8.2 + 12;
      if (hub.kind === "course") return { x: Math.cos((hub.angle * Math.PI) / 180) >= -0.2 ? hub.x : hub.x - w, y: hub.y - 10, w, h: 20 };
      return { x: hub.x - w / 2, y: hub.kind === "pod" ? hub.y + (hub.inside ? podR : 16) : hub.y - 30, w, h: 26 };
    });
    taken.push({ x: -70, y: -20, w: 140, h: 62 });
    return chooseLabels(layout, { max: Math.max(6, Math.round((stage.w * stage.h) / 30_000)), charW: 6.9, lineH: 17, taken, dot, clearOfDots: true, within: { x: win.x + 8, y: win.y + 8, w: win.w - 16 - (props.coverRight ?? 0), h: win.h - 16 } });
  }, [layout, page, stage, win.x, win.y, win.w, win.h, props.coverRight, podR, dot]);
  const labelled = new Map(labels.map((label) => [label.id, label]));

  // Gestures (page only). Offsets from the middle of the drawing, in view units.
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; pinch: number | null }>({ moved: false, pinch: null });
  // Offsets are in layout units at rest: pixels over the stage's fit.
  const fromMiddle = (clientX: number, clientY: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    return { dx: (clientX - (box.left + box.width / 2)) / fit, dy: (clientY - (box.top + box.height / 2)) / fit };
  };
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => setView((current) => {
    const at = clientX === undefined || !svgRef.current ? { dx: 0, dy: 0 } : fromMiddle(clientX, clientY!);
    return zoomAt(current, at.dx, at.dy, current.k * factor, bounds);
  });
  // The wheel must be able to stop the page scrolling, so it is bound by hand.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !page) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // A trackpad pinch arrives as a wheel with ctrl held, in small steps.
      zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.0016)), event.clientX, event.clientY);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const handlers = page ? {
    onPointerDown: (event: any) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) gesture.current = { moved: false, pinch: null };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = { moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    },
    onPointerMove: (event: any) => {
      const last = pointers.current.get(event.pointerId);
      if (!last) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 2 && gesture.current.pinch) {
        const [a, b] = [...pointers.current.values()];
        const spread = Math.hypot(a.x - b.x, a.y - b.y);
        zoomBy(spread / gesture.current.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        gesture.current.pinch = spread;
        return;
      }
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      // A click that wobbles a few pixels is still a click.
      if (!gesture.current.moved && Math.hypot(dx, dy) < 4) { pointers.current.set(event.pointerId, last); return; }
      if (!gesture.current.moved) { gesture.current.moved = true; svgRef.current?.setPointerCapture?.(event.pointerId); }
      setView((current) => panBy(current, dx / fit, dy / fit, bounds));
    },
    onPointerUp: (event: any) => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) gesture.current.pinch = null; },
    onPointerCancel: (event: any) => { pointers.current.delete(event.pointerId); gesture.current.pinch = null; },
    // A drag is not a pick.
    onClickCapture: (event: any) => { if (gesture.current.moved) { event.stopPropagation(); gesture.current.moved = false; } },
    // A click on empty space puts down what was picked.
    onClick: (event: any) => { if (event.target === svgRef.current) props.onClear?.(); },
    onDoubleClick: (event: any) => zoomBy(2, event.clientX, event.clientY),
  } : {};
  // What is picked is brought clear of the panel and the edges, moving the
  // map the least it can.
  useEffect(() => {
    if (!page || !props.selectedId) return;
    const at = [...base.points, ...base.lessons, ...base.hubs.map((hub) => ({ ...hub, id: hub.key }))].find((entry) => entry.id === props.selectedId);
    if (!at) return;
    setView((current) => revealPoint(current, at, fit * current.k, stage, { left: 70, right: (props.coverRight ?? 0) + (props.coverRight ? 210 : 90), top: 80, bottom: 70 }, bounds));
  }, [props.selectedId, props.coverRight]); // eslint-disable-line react-hooks/exhaustive-deps

  const lit = (p: LayoutPoint) => reading === "yours" ? p.point.mine : reading === "gaps" ? p.point.at.kind === "subject" && gapKeys.has(`subject:${p.point.at.name}`) : true;
  const dimAll = reading !== "community";
  const pick = (id: string) => props.onSelect?.(id);

  const drawing = (
    <svg ref={svgRef} {...handlers} className={cx(page ? "brain brain-page" : "brain brain-panel")} viewBox={`${win.x.toFixed(1)} ${win.y.toFixed(1)} ${win.w.toFixed(0)} ${win.h.toFixed(0)}`}
      {...(page ? { width: stage.w, height: stage.h } : {})}
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
            {p.point.fresh && on && reading !== "yours" ? <circle cx={p.x} cy={p.y} r={p.r * dot + 10} fill={`url(#${glow})`} /> : null}
            {reading === "yours" && p.point.mine ? <circle cx={p.x} cy={p.y} r={p.r * dot + 9} fill={`url(#${mineGlow})`} /> : null}
            <circle className={cx(cls)} cx={p.x} cy={p.y} r={p.r * dot} />
            {selected ? <circle className={cx("brain-ring")} cx={p.x} cy={p.y} r={p.r * dot + 5} /> : null}
            {/* A wider target than the dot, for a finger. */}
            {page ? <circle className={cx("brain-hit")} cx={p.x} cy={p.y} r={Math.max(11, p.r * dot + 6)} /> : null}
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
            <circle className={cx(cls)} cx={lesson.x} cy={lesson.y} r={lessonR(lesson.r)} />
            {props.selectedId === lesson.id ? <circle className={cx("brain-ring")} cx={lesson.x} cy={lesson.y} r={lessonR(lesson.r) + 5} /> : null}
            {page ? <text className={cx(dimAll && !mine ? "brain-num dim" : "brain-num")} x={lesson.x} y={lesson.y - lessonR(lesson.r) - 6} textAnchor="middle">{lesson.order}</text> : null}
            {page ? <circle className={cx("brain-hit")} cx={lesson.x} cy={lesson.y} r={12} /> : null}
          </g>
        );
      })}

      {/* Hubs: subjects and pods are cells; a course is named at its fibre's end. */}
      {layout.hubs.map((hub) => {
        const gap = reading === "gaps" && gapKeys.has(hub.key);
        const right = Math.cos((hub.angle * Math.PI) / 180) >= -0.2;
        const pickable = page && hub.kind === "subject";
        return (
          <g key={hub.key} className={cx(pickable ? "brain-node pickable" : "brain-node")}
            {...(pickable ? { tabIndex: 0, role: "button", "aria-label": `Subject: ${hub.label}`, onClick: () => pick(hub.key), onKeyDown: (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(hub.key); } } } : {})}>
            {pickable ? <circle className={cx("brain-hit")} cx={hub.x} cy={hub.y} r={14} /> : null}
            {props.selectedId === hub.key ? <circle className={cx("brain-ring")} cx={hub.x} cy={hub.y} r={11} /> : null}
            {hub.kind === "pod" ? (
              <>
                <circle className={cx("brain-membrane")} cx={hub.x} cy={hub.y} r={hub.inside ? podR : 18} />
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
                x={hub.x} y={hub.kind === "course" ? hub.y + 4 : hub.kind === "pod" ? hub.y + (hub.inside ? podR + 16 : 32) : hub.y - 13}
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
        return <text className={cx("brain-name on")} x={p.x + (right ? p.r * dot + 7 : -p.r * dot - 7)} y={p.y + 4} textAnchor={right ? "start" : "end"}>{p.point.title}</text>;
      })() : null}

      <circle className={cx("brain-core")} cx={0} cy={0} r={8} />
      <circle className={cx("brain-core-ring")} cx={0} cy={0} r={13} />
      {page ? <text className={cx("brain-center")} x={0} y={33} textAnchor="middle">{props.map.center.name}</text> : null}
    </svg>
  );
  if (!page) return drawing;
  return (
    <div className={cx("brainwrap")} ref={wrapRef}>
      {drawing}
      <div className={cx("brainzoom")} role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.6)}>+</button>
        <button type="button" aria-label="Zoom out" disabled={view.k <= 1} onClick={() => zoomBy(1 / 1.6)}>−</button>
        <button type="button" disabled={isFitView(view, bounds)} onClick={() => setView(fitView(bounds))}>Fit</button>
      </div>
    </div>
  );
}

// How much a line bends, the same every time for the same thing.
function hashBend(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.4;
}
