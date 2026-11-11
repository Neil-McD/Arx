import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isDesignV1Active } from "../../../../shared/designSystem";

// Design system v1 (docs/specs/design-system-v1.md, section 4): every page in
// a community has the same header line, level with a channel's: its title on
// the left and its own actions on the right. The frame owns the line; a page
// fills it with <CommunityPageHeader>.
// undefined: not inside a frame. null: inside one whose line has not mounted yet.
const HeaderSlotContext = createContext<HTMLElement | null | undefined>(undefined);

const RailSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export function CommunityPageFrame(props: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const body = (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">{props.children}</div>
    </div>
  );
  if (!isDesignV1Active()) return body;
  // The right column is a slot too: a page that has one fills it with
  // <CommunityPageRail>; an empty slot takes no room.
  return (
    <>
      <HeaderSlotContext.Provider value={slot}>
        <RailSlotContext.Provider value={rail}>
          <div className="community-page-body">
            <header className="community-channel-header community-page-header" ref={setSlot} />
            {body}
            <aside className="community-page-rail" ref={setRail} />
          </div>
        </RailSlotContext.Provider>
      </HeaderSlotContext.Provider>
    </>
  );
}

export function CommunityPageRail(props: { label: string; children: ReactNode }) {
  const rail = useContext(RailSlotContext);
  if (!rail) return null;
  return createPortal(<div className="community-page-rail-content" aria-label={props.label}>{props.children}</div>, rail);
}

// `children` is the page's classic title row, shown when v1 is off (and where
// a page is used outside the frame, as on mobile).
export function CommunityPageHeader(props: { title: string; actions?: ReactNode; children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  if (!isDesignV1Active() || slot === undefined) return <>{props.children}</>;
  if (!slot) return null;
  return createPortal(
    <>
      <div className="community-channel-header-identity">
        <h1>{props.title}</h1>
      </div>
      {props.actions ? <div className="community-page-header-actions">{props.actions}</div> : null}
    </>,
    slot,
  );
}
