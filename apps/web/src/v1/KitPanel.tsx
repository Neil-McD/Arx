// Design system v1: the parts a right panel is made of (mock: "Right
// panels, second pass"). Every panel is the guide's brief (KitBrief), the
// next thing to do, what the place knows, and a fourth part that changes
// with the place (its people, or what it just learned). No dividers: parts
// are set apart by space and type. A part with nothing to say is not drawn.
// Rows are one line and never wrap. What only a host does sits as an action
// in a part's label row.
import { useEffect, useState, type ReactNode } from "react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { cx } from "./kit";

// Layout before data: a panel whose parts load separately draws once they
// have all answered, as one piece, so no part is drawn and then pushed down
// by one that arrives above it. If an answer is slow, it stops waiting after
// PANEL_WAIT_MS and draws what it has.
export const PANEL_WAIT_MS = 3000;
export function usePanelSettled(allSettled: boolean): boolean {
  const [waitedEnough, setWaitedEnough] = useState(false);
  useEffect(() => {
    if (allSettled) return;
    const timer = setTimeout(() => setWaitedEnough(true), PANEL_WAIT_MS);
    return () => clearTimeout(timer);
  }, [allSettled]);
  return allSettled || waitedEnough;
}

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
export function PanelNext(props: { title: string; sub?: string | null; action?: ReactNode; onClick?: () => void; ariaLabel?: string }) {
  const details = <><b>{props.title}</b>{props.sub ? <small>{props.sub}</small> : null}</>;
  return (
    <div className={cx("nx")}>
      {props.onClick ? (
        <button type="button" className={cx("nx-go")} onClick={props.onClick} aria-label={props.ariaLabel ?? props.title}>
          {details}
        </button>
      ) : <div>{details}</div>}
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

export type PanelPerson = { id?: string; name: string; avatarUrl?: string | null };

// People, as real profile photos (or initials when none is set) and names:
// one in full, several by first name ("Maya, Priya and 3 more").
export function PanelPeople(props: { names?: string[]; people?: PanelPerson[]; max?: number }) {
  const max = props.max ?? 4;
  const entries: PanelPerson[] = props.people?.length
    ? props.people
    : (props.names ?? []).map((name, index) => ({ id: `${name}:${index}`, name, avatarUrl: null }));
  const shown = entries.slice(0, max);
  const more = entries.length - shown.length;
  const first = shown.length === 1
    ? [shown[0].name.trim()]
    : shown.map((person) => person.name.trim().split(/\s+/)[0]).filter(Boolean);
  return (
    <div className={cx("ln")}>
      <span className={cx("stack")}>
        {shown.map((person, index) => {
          const clean = person.name.trim() || "Member";
          return (
            <span key={person.id ?? index} className={cx("av s")} title={clean}>
              <UserAvatar
                className="community-dm-kit-avatar"
                readyClassName="has-image"
                name={clean}
                imageUrl={person.avatarUrl ?? null}
                alt=""
                fallback={<span>{clean.charAt(0).toUpperCase() || "?"}</span>}
                fallbackStyle={{ backgroundColor: faceColour(clean), color: "#fff" }}
              />
            </span>
          );
        })}
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
