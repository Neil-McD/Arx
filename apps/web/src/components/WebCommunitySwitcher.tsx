import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Compass, Plus } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { WebCommunityShellProps } from "./webShellChromeShared";

export function WebCommunitySwitcher({ shell }: { shell: WebCommunityShellProps }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 56 });
  const active = shell.activeCommunity;
  const close = () => { popover.current?.hidePopover(); trigger.current?.focus(); };
  const run = (action: () => void) => { close(); action(); };
  const avatar = (community: NonNullable<typeof active>) => <CommunityAvatar
    communityId={community.id} visualIdentity={community.visual_identity}
    name={community.name} imageUrl={community.avatar_url}
    focusX={community.avatar_focus_x} focusY={community.avatar_focus_y}
    zoom={community.avatar_zoom} className="community-switcher-avatar" />;
  const attention = shell.railCommunities.some(c => c.slug !== shell.selectedActiveCommunitySlug && shell.communityRailAttentionById[c.id]);
  return <>
    <button ref={trigger} type="button" className="community-switcher-trigger"
      aria-label="Switch community" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
      onClick={() => {
        if (open) { close(); return; }
        const rect = trigger.current!.getBoundingClientRect();
        setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)), top: rect.bottom + 8 });
        setQuery(""); popover.current?.showPopover(); search.current?.focus();
      }}>
      {active && avatar(active)}<span>{active?.name ?? "Communities"}</span>
      {attention && <span className="community-switcher-attention" aria-label="Unread activity in other communities" />}
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={id} ref={popover} popover="auto" role="dialog" aria-label="Switch community"
      className="community-switcher-popover" style={position}
      onToggle={event => setOpen(event.newState === "open")}>
      <input ref={search} className="community-dm-recipient-search" type="search" aria-label="Search communities" placeholder="Search communities"
        value={query} onChange={event => setQuery(event.target.value)} />
      <div className="community-switcher-list">
        {shell.railCommunities.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())).map(c =>
          <button type="button" className="community-switcher-row" key={c.id}
            aria-current={c.slug === shell.selectedActiveCommunitySlug ? "page" : undefined}
            onClick={() => run(() => { shell.onSelectActiveCommunity(c); })}>
            {avatar(c)}<span>{c.name}</span>
            {shell.communityRailAttentionById[c.id] && <span className="community-switcher-attention" aria-label="Unread activity" />}
            {c.slug === shell.selectedActiveCommunitySlug && <Check size={16} aria-hidden="true" />}
          </button>)}
        {!shell.railCommunities.some(c => c.name.toLowerCase().includes(query.trim().toLowerCase())) &&
          <p>{shell.isLoadingCommunities ? "Loading communities…" : "No communities found"}</p>}
      </div>
      <div className="community-switcher-actions">
        <button type="button" className="community-switcher-row" onClick={() => run(shell.onOpenDiscover)}><Compass size={18} />Discover communities</button>
        <button type="button" className="community-switcher-row" onClick={() => run(shell.onOpenCommunityCreateCta)}><Plus size={18} />Create community</button>
      </div>
    </div>
  </>;
}
