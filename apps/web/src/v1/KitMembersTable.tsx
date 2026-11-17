// Design system v1: the host's Members table (Neil, Nov 15: like an admin
// users table). A toolbar (search, a status filter, export), a bordered
// table with a row per member and a box to tick, and a bar of what can be
// done to everyone ticked. Join requests wait in a drawer, one line above
// the table. The rules are in shared/communityMembersTable.ts; the page
// that loads the people and acts on them is KitMembersPage.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronRight, Download, Plus, Search, X } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { memberKey, memberStatus, type MemberTableRow } from "../../../../shared/communityMembersTable";
import type { CommunityAdmissionJoinRequest } from "../components/CommunityJoinRequestReview";
import { Btn, cx } from "./kit";

type Avatars = { getAvatarColor: (id: string) => string; getInitials: (name: string) => string };

export function Face(props: Avatars & { name: string; url: string | null; seed: string; size?: "s"; style?: CSSProperties }) {
  return (
    <span className={cx("av", props.size)} style={props.style}>
      <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={props.name} imageUrl={props.url} alt=""
        fallback={<span>{props.getInitials(props.name)}</span>} fallbackStyle={{ backgroundColor: props.getAvatarColor(props.seed) }} />
    </span>
  );
}

const roleTag = (role: string) => (role === "owner" ? "host" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : null);

export type MembersFilter = { id: string; label: string; count: number | null };
export type MembersSortKey = "name" | "plan" | "joined" | "active";

// Search, the status filter and export, in one line above the table.
export function MembersToolbar(props: {
  search: string;
  onSearch: (value: string) => void;
  filters: MembersFilter[];
  filter: string;
  onFilter: (id: string) => void;
  onExport: () => void;
  exporting: boolean;
  canExport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const first = props.filters[0];
  const chosen = props.filters.find((entry) => entry.id === props.filter);
  const filtered = Boolean(chosen && first && chosen.id !== first.id);
  return (
    <div className={cx("mbar")}>
      <label className={cx("msearch")}>
        <Search size={15} strokeWidth={1.8} aria-hidden="true" />
        <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search" aria-label="Search members by name" />
        {props.search ? <button type="button" aria-label="Clear search" onClick={() => props.onSearch("")}><X size={14} strokeWidth={1.8} aria-hidden="true" /></button> : null}
      </label>
      <div className={cx("mfilter")} ref={menu}>
        <button type="button" className={cx("mbtn", filtered && "on")} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
          {filtered ? <>Status: {chosen!.label}</> : <><Plus size={14} strokeWidth={1.8} aria-hidden="true" />Status</>}
        </button>
        {filtered ? <button type="button" className={cx("mbtn mclear")} aria-label="Show everyone" onClick={() => props.onFilter(first.id)}><X size={14} strokeWidth={1.8} aria-hidden="true" /></button> : null}
        {open ? (
          <div className={cx("mmenu")} role="listbox" aria-label="Status">
            {props.filters.map((entry) => (
              <button key={entry.id} type="button" role="option" aria-selected={entry.id === props.filter} onClick={() => { props.onFilter(entry.id); setOpen(false); }}>
                <span>{entry.label}</span>{entry.count !== null ? <em>{entry.count}</em> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className={cx("mbtn mexport")} onClick={props.onExport} disabled={!props.canExport || props.exporting} aria-label="Export everyone as a spreadsheet" title="Export everyone">
        <Download size={15} strokeWidth={1.8} aria-hidden="true" />{props.exporting ? <span>Exporting…</span> : null}
      </button>
    </div>
  );
}

function Tick(props: { on: boolean; some?: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={props.some ? "mixed" : props.on} aria-label={props.label} className={cx("mtick", (props.on || props.some) && "on")}
      onClick={(event) => { event.stopPropagation(); props.onToggle(); }}>
      {props.on ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : props.some ? <i /> : null}
    </button>
  );
}

// The table: a row per member. A row opens their record; its box ticks them.
export function MembersTable(props: Avatars & {
  rows: MemberTableRow[];
  avatarOf: (row: MemberTableRow) => string | null;
  now: number;
  timeFor: (iso: string | null, now: number) => string;
  dayFor: (iso: string | null, now: number) => string | null;
  sort: { key: MembersSortKey; desc: boolean } | null;
  onSort: (key: MembersSortKey) => void;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  openKey: string | null;
  onOpen: (key: string) => void;
  empty: string;
}) {
  const keys = props.rows.map(memberKey);
  const ticked = keys.filter((key) => props.selected.has(key)).length;
  const head = (key: MembersSortKey, label: string) => (
    <button type="button" className={cx("mth")} aria-sort={props.sort?.key === key ? (props.sort.desc ? "descending" : "ascending") : undefined} onClick={() => props.onSort(key)}>
      {label}{props.sort?.key === key ? <i>{props.sort.desc ? "↓" : "↑"}</i> : null}
    </button>
  );
  return (
    <div className={cx("mtbl")} role="table" aria-label="Members">
      <div className={cx("mrow2 mhead")} role="row">
        <Tick on={keys.length > 0 && ticked === keys.length} some={ticked > 0 && ticked < keys.length} label="Select everyone shown" onToggle={props.onToggleAll} />
        {head("name", "Member")}
        <span className={cx("mth")}>Status</span>
        {head("plan", "Plan")}
        {head("joined", "Joined")}
        {head("active", "Last active")}
        <span />
      </div>
      {props.rows.map((row) => {
        const key = memberKey(row);
        const status = memberStatus(row);
        return (
          <div key={key} role="row" tabIndex={0} className={cx("mrow2", props.openKey === key && "sel", props.selected.has(key) && "tick")}
            onClick={() => props.onOpen(key)} onKeyDown={(event) => { if (event.key === "Enter") props.onOpen(key); }}>
            <Tick on={props.selected.has(key)} label={`Select ${row.name}`} onToggle={() => props.onToggle(key)} />
            <span className={cx("mwho")}>
              <Face size="s" name={row.name} url={props.avatarOf(row)} seed={row.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
              <span>
                <b>{row.name}{roleTag(row.role) ? <span className={cx("tag")}>{roleTag(row.role)}</span> : null}</b>
                {row.handle ? <small>@{row.handle}</small> : null}
              </span>
            </span>
            <span className={cx("mstat", status.kind)}><i />{status.label}</span>
            <span>{row.plan.label}</span>
            <span>{props.dayFor(row.joined_at, props.now) ?? "—"}</span>
            <span>{props.timeFor(row.last_active_at, props.now)}</span>
            <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" className={cx("mchev")} />
          </div>
        );
      })}
      {props.rows.length === 0 ? <p className={cx("mnone")}>{props.empty}</p> : null}
    </div>
  );
}

// What can be done to everyone ticked.
export function MembersBulkBar(props: { count: number; compable: number; busy: string | null; onExport: () => void; onComp: () => void; onClear: () => void }) {
  if (props.count === 0) return null;
  return (
    <div className={cx("mbulk")} role="region" aria-label="Selected members">
      <b>{props.count} selected</b>
      <Btn small onClick={props.onExport}>Export selected</Btn>
      {props.compable > 0 ? (
        <Btn small onClick={props.onComp}>{props.busy === "comp" ? "Saving…" : props.compable === props.count ? "Keep free for good" : `Keep ${props.compable} free for good`}</Btn>
      ) : null}
      <Btn small txt onClick={props.onClear}>Clear</Btn>
    </div>
  );
}

// One line above the table when people are waiting; their requests are in the drawer.
export function JoinRequestsLine(props: { count: number; open: boolean; onOpen: () => void }) {
  if (props.count === 0) return null;
  return (
    <button type="button" className={cx("mwait")} aria-expanded={props.open} onClick={props.onOpen}>
      <i className={cx("dot amber")} />
      <span>{props.count === 1 ? "One person is waiting to join" : `${props.count} people are waiting to join`}</span>
      <em>Review</em>
    </button>
  );
}

export function JoinRequestsDrawer(props: Avatars & {
  requests: CommunityAdmissionJoinRequest[];
  decidingId: string | null;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onClose: () => void;
  close?: ReactNode;
}) {
  return (
    <div className={cx("mdrawer")}>
      <header>
        <div><span className={cx("lab")}>Waiting to join</span><h2>{props.requests.length === 1 ? "1 request" : `${props.requests.length} requests`}</h2></div>
        <button type="button" className={cx("mx")} aria-label="Close" onClick={props.onClose}><X size={16} strokeWidth={1.8} aria-hidden="true" /></button>
      </header>
      {props.requests.length === 0 ? <p className={cx("mnone")}>Nobody is waiting.</p> : null}
      {props.requests.map((request) => (
        <article key={request.id} className={cx("mreq")}>
          <Face name={request.displayName ?? "Someone"} url={request.avatarUrl} seed={request.userId} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
          <div>
            <b>{request.displayName ?? "Someone"}</b><small>Asked {request.createdAtLabel}</small>
            {request.message ? <p>{request.message}</p> : null}
            <span className={cx("mreq-acts")}>
              <Btn small go onClick={() => props.onApprove(request.id)}>{props.decidingId === request.id ? "…" : "Approve"}</Btn>
              <button type="button" className={cx("btn sm no")} disabled={props.decidingId === request.id} onClick={() => props.onDecline(request.id)}>Decline</button>
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
