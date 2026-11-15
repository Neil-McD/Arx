// Design system v1: the parts a right panel is made of (mock: "Right
// panels, second pass"). Every panel is the guide's brief (KitBrief), the
// next thing to do, what the place knows, and a fourth part that changes
// with the place (its people, or what it just learned). No dividers: parts
// are set apart by space and type. A part with nothing to say is not drawn.
// Rows are one line and never wrap. What only a host does sits as an action
// in a part's label row.
import type { ReactNode } from "react";
import { cx } from "./kit";

// A part: a small label, a fact after it, an action on its right.
export function PanelPart(props: { label: string; fact?: string | null; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className={cx("rz")}>
      <span className={cx("lab")}>{props.label}{props.fact ? <em>{props.fact}</em> : null}{props.action}</span>
      {props.children}
    </section>
  );
}

// An action in a label row or at the end of a line.
export function PanelAction(props: { children: ReactNode; onClick: () => void; label?: string; icon?: boolean; expanded?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={cx(props.icon ? "la ico" : "la")} aria-label={props.label} aria-expanded={props.expanded} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

// One line: what, then a small fact or an action on its right.
export function PanelLine(props: { children: ReactNode; fact?: string | null; dim?: boolean; action?: ReactNode }) {
  return (
    <div className={cx("ln")}>
      <span className={cx(props.dim ? "t dim" : "t")}>{props.children}</span>
      {props.fact ? <em>{props.fact}</em> : null}
      {props.action}
    </div>
  );
}

// The next thing to do: what it is, a small line under it, the way in.
export function PanelNext(props: { title: string; sub?: string | null; action?: ReactNode }) {
  return (
    <div className={cx("nx")}>
      <div><b>{props.title}</b>{props.sub ? <small>{props.sub}</small> : null}</div>
      {props.action}
    </div>
  );
}

const FACE_COLOURS = ["#5B6CF0", "#8E6BD9", "#C58B3A", "#3DAE8C", "#E0788C", "#3D8FD6", "#B0614F"];

// A person's colour, the same every time for the same name.
function faceColour(name: string): string {
  let sum = 0;
  for (const char of name) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
  return FACE_COLOURS[sum % FACE_COLOURS.length];
}

// People, as initials and names: one in full, several by first name
// ("Maya, Priya and 3 more").
export function PanelPeople(props: { names: string[]; max?: number }) {
  const max = props.max ?? 4;
  const shown = props.names.slice(0, max);
  const more = props.names.length - shown.length;
  const first = shown.length === 1 ? [shown[0].trim()] : shown.map((name) => name.trim().split(/\s+/)[0]).filter(Boolean);
  return (
    <div className={cx("ln")}>
      <span className={cx("stack")}>
        {shown.map((name, index) => <span key={index} className={cx("av xs")} style={{ background: faceColour(name), color: "#fff" }}>{name.trim().charAt(0).toUpperCase() || "?"}</span>)}
      </span>
      <span className={cx("t")}>{first.join(", ")}{more > 0 ? ` and ${more} more` : ""}</span>
    </div>
  );
}

// Something the place learned, and when. With onOpen, the row opens it.
export function PanelLearned(props: { title: string; when: string; onOpen?: () => void; expanded?: boolean }) {
  const inner = <><i className={cx("dot")} /><span className={cx("t")}>{props.title}</span><em>{props.when}</em></>;
  return props.onOpen
    ? <button type="button" className={cx("ln")} aria-expanded={props.expanded} onClick={props.onOpen}>{inner}</button>
    : <div className={cx("ln")}>{inner}</div>;
}
