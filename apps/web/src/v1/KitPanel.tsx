// Design system v1: the parts a right panel is made of (mock: "Every right
// panel"). Every panel is the guide's brief (KitBrief), the next thing to
// do, what the place knows, and a fourth part that changes with the place
// (its people, or what it just learned). Each part is a label with a small
// fact on its right, then a line or two.
import type { ReactNode } from "react";
import { cx } from "./kit";

export function PanelPart(props: { label: string; fact?: string | null; children?: ReactNode }) {
  return (
    <section className={cx("rz")}>
      <span className={cx("lab")}>{props.label}{props.fact ? <em>{props.fact}</em> : null}</span>
      {props.children}
    </section>
  );
}

// One line: what, and a small fact or a button on its right.
export function PanelLine(props: { children: ReactNode; fact?: string | null }) {
  return <div className={cx("ln")}>{props.children}{props.fact ? <em>{props.fact}</em> : null}</div>;
}

// People, as initials and first names: "Maya, Priya and 3 more".
export function PanelPeople(props: { names: string[]; max?: number }) {
  const max = props.max ?? 4;
  const shown = props.names.slice(0, max);
  const more = props.names.length - shown.length;
  // One person is named in full; several by first name.
  const first = shown.length === 1 ? [shown[0].trim()] : shown.map((name) => name.trim().split(/\s+/)[0]).filter(Boolean);
  return (
    <div className={cx("ln")}>
      <span className={cx("stack")}>
        {shown.map((name, index) => <span key={index} className={cx("av xs")}>{name.trim().charAt(0).toUpperCase() || "?"}</span>)}
      </span>
      <span>{first.join(", ")}{more > 0 ? ` and ${more} more` : ""}</span>
    </div>
  );
}

// Something the place learned, and when.
export function PanelLearned(props: { title: string; when: string }) {
  return <div className={cx("recent")}><i />{props.title}<em>{props.when}</em></div>;
}
