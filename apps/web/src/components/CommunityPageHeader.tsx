import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { openGuideFromSearch } from "./guideSearch";
import { useCommunityAgentOn } from "../controllers/communityAgentOn";

// The mock's "Search or ask", the same on every page's top bar. Until search
// exists it asks your guide (⌘K does the same).
export function SearchOrAskButton() {
  // Without the agent it only searches.
  const agentOn = useCommunityAgentOn();
  return (
    <button type="button" className="community-search-ask" onClick={() => openGuideFromSearch()} aria-keyshortcuts="Meta+K" title={agentOn ? "Search or ask your guide (⌘K)" : "Search (⌘K)"}>
      <Search size={14} aria-hidden="true" />
      <span>{agentOn ? "Search or ask" : "Search"}</span>
      <kbd>⌘K</kbd>
    </button>
  );
}

// Design system v1 (docs/specs/design-system-v1.md, section 4): every page in
// a community has the same header line, level with a channel's: its title on
// the left and its own actions on the right. The frame owns the line; a page
// fills it with <CommunityPageHeader>.
// undefined: not inside a frame. null: inside one whose line has not mounted yet.
const HeaderSlotContext = createContext<HTMLElement | null | undefined>(undefined);

const RailSlotContext = createContext<HTMLElement | null | undefined>(undefined);

// A page's own controls (a time range, a section switcher, "Done editing")
// sit in a row just under the header, aligned with the page (Neil, Nov 13):
// the header line holds the page's name and nothing else.
const ToolbarSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export function CommunityPageFrame(props: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  const v1 = isDesignV1Active();
  const body = (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">
        {v1 ? <div className="community-page-toolbar" ref={setToolbar} /> : null}
        {props.children}
      </div>
    </div>
  );
  if (!v1) return body;
  // The right column is a slot too: a page that has one fills it with
  // <CommunityPageRail>; an empty slot takes no room.
  return (
    <>
      <HeaderSlotContext.Provider value={slot}>
        <RailSlotContext.Provider value={rail}>
          <ToolbarSlotContext.Provider value={toolbar}>
          <div className="community-page-body">
            <header className="community-channel-header community-page-header" ref={setSlot} />
            {body}
            <aside className="community-page-rail" ref={setRail} />
          </div>
          </ToolbarSlotContext.Provider>
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
  const toolbar = useContext(ToolbarSlotContext);
  if (!isDesignV1Active() || slot === undefined) return <>{props.children}</>;
  if (!slot) return null;
  return (
    <>
      {createPortal(
        <div className="community-channel-header-identity">
          <h1>{props.title}</h1>
        </div>,
        slot,
      )}
      {props.actions && toolbar ? createPortal(<div className="community-page-header-actions">{props.actions}</div>, toolbar) : null}
    </>
  );
}
