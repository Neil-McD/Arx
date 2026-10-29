import { ArrowDown, ArrowLeft, ArrowUpDown, Maximize2, Rows3, ArrowUp, Check, ChevronDown, ChevronUp, Download, Flag, MessageSquare, MoreHorizontal, Plus, RefreshCw, Search, SlidersHorizontal, StickyNote, Tag, Users, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { COMMUNITY_CLIENT_PROPERTY_TYPES, type CommunityClientPropertyType, type CommunityClientPropertyValue } from "../../../../shared/communityClients";
import {
  COMMUNITY_CLIENT_BULK_LIMIT,
  COMMUNITY_CLIENT_DEFAULT_COLUMNS,
  COMMUNITY_CLIENT_FILTER_OP_LABELS,
  COMMUNITY_CLIENT_STATUS_LABELS,
  applyCommunityClientView,
  communityClientGroupable,
  groupCommunityClients,
  communityClientFieldValue,
  communityClientFilterOpsFor,
  type CommunityClientField,
  type CommunityClientFilter,
  type CommunityClientFilterOp,
  type CommunityClientView,
} from "../../../../shared/communityClientViews";
import {
  communityAccessErrorMessage,
  type CloudCommunityClient,
  type CloudCommunityClientBulkInput,
  type CloudCommunityClientPage,
  type CloudCommunityClientProperty,
} from "../../../../shared/cloudCommunityMemberAccessGateway";
import type { CommunityAccessGateway } from "../controllers/useWebCommunityAccessGateway";
import { openCommunityTab } from "../controllers/openCommunityTab";
import { AccessBadge, ClientTimeline, GrantForm, WebCommunityClientAccessPanel } from "./WebCommunityAccess";
import "./WebCommunityAccess.css";
import "./WebCommunityMembers.css";
import "./workflowStageColors.css";

// Workflows → Members: every member as a row of a
// database you shape yourself (Notion), laid out like Substack's Subscribers.
// Views are saved records (columns, filters, sort) the owner's agent edits too;
// select members to set a property, message, flag or note them all at once.

const DAY_MS = 24 * 60 * 60 * 1000;
const TYPE_LABELS: Record<CommunityClientPropertyType, string> = {
  text: "Text", number: "Number", select: "Select", multi_select: "Multi-select", date: "Date", checkbox: "Checkbox", url: "Link",
};
const RELATIVE_FIELDS = new Set(["last_seen_at", "last_active_at", "last_progress_at", "last_lesson_done_at", "last_contacted_at", "last_flagged_at"]);

type Draft = Omit<CommunityClientView, "key">;
type ViewRow = CommunityClientView;

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function ago(iso: string, nowMs: number) {
  const days = Math.floor((nowMs - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 60) return `${days} days ago`;
  return day(iso);
}
function errorText(caught: unknown) {
  const message = String((caught as Error)?.message ?? caught);
  if (message.includes("client_property_name_taken")) return "Another property already has that name.";
  if (message.includes("client_property_limit_reached")) return "You can have up to 50 properties.";
  if (message.includes("client_property_options")) return "Give a select property at least one choice, each one different.";
  if (message.includes("client_property_value_invalid")) return "That value doesn't fit this property.";
  if (message.includes("client_view_limit_reached")) return "You can have up to 30 views.";
  if (message.includes("client_view_invalid")) return "That view has a column or filter that no longer exists.";
  if (message.includes("client_bulk_message_limit_reached")) return "That's more than 500 messages today. Try again tomorrow, or pick fewer members.";
  if (message.includes("client_event_body_invalid")) return "Write something first (up to 4,000 characters).";
  return communityAccessErrorMessage(caught);
}
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
const toDraft = (view: ViewRow): Draft => ({ name: view.name, columns: [...view.columns], filters: view.filters.map((f) => ({ ...f })), match: view.match, sort: view.sort ? { ...view.sort } : null, group: view.group ?? null });

function statusPill(client: CloudCommunityClient) {
  if (client.stuck && client.status === "active") return <span className="pn-members-pill is-warn">Stuck</span>;
  const tone = client.status === "active" ? "is-good" : client.status === "cancelling" || client.status === "past_due" ? "is-warn"
    : client.status === "cancelled" ? "is-bad" : "is-off";
  return <span className={`pn-members-pill ${tone}`}>{COMMUNITY_CLIENT_STATUS_LABELS[client.status] ?? client.status}</span>;
}

/** The member's current offer by name ("Membership"), from the property Polynet keeps for offers. */
function offerName(client: CloudCommunityClient, properties: CloudCommunityClientProperty[]): string | null {
  const key = properties.find((property) => property.system === "offer")?.key;
  const value = key ? client.properties?.[key] : null;
  const last = Array.isArray(value) ? value.at(-1) : value;
  return typeof last === "string" && last.trim() ? last : null;
}

function FieldValue({ client, field, nowMs, properties = [] }: { client: CloudCommunityClient; field: CommunityClientField; nowMs: number; properties?: CloudCommunityClientProperty[] }) {
  if (field.key === "status") return statusPill(client);
  // Plan names the offer, with how they have it (paid, given, until when) in the tooltip.
  if (field.key === "plan" && client.access) return <AccessBadge access={client.access} label={offerName(client, properties)} />;
  // The stage as the same coloured chip Automations shows.
  if (field.key === "stage" && client.stage) {
    return <span className={`pn-members-stage${client.stage.color ? ` pn-stage-color-${client.stage.color}` : ""}`}>{client.stage.name}</span>;
  }
  const value = communityClientFieldValue(client as any, field.key);
  if (field.key === "course_progress" || field.key.startsWith("course:")) {
    if (value === null) return <span className="pn-members-empty">–</span>;
    return <span className="pn-members-progress"><span className="pn-members-bar"><i style={{ width: `${value}%` }} /></span>{value}%</span>;
  }
  if (value === null || value === "" || (Array.isArray(value) && !value.length)) return <span className="pn-members-empty">–</span>;
  if (field.kind === "checkbox") return value === true ? <Check size={15} aria-label="Yes" /> : <span className="pn-members-empty">–</span>;
  if (field.kind === "date" && typeof value === "string") {
    return <time dateTime={value} title={day(value)}>{RELATIVE_FIELDS.has(field.key) ? ago(value, nowMs) : day(value)}</time>;
  }
  if (field.kind === "multi_select" && Array.isArray(value)) return <span className="pn-members-chips">{value.map((item) => <span key={item}>{item}</span>)}</span>;
  if (field.kind === "select" && field.source === "owner") return <span className="pn-members-chips"><span>{String(value)}</span></span>;
  if (field.kind === "url" && typeof value === "string") return <a href={value} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{value.replace(/^https?:\/\//, "")}</a>;
  if (field.key === "role") return <>{String(value).replace(/_/g, "-").replace(/^./, (c) => c.toUpperCase())}</>;
  return <>{Array.isArray(value) ? value.join(", ") : String(value)}</>;
}

/** One owner property's value, edited in place: on the table and on the member's page. */
function PropertyEditor(props: { property: CloudCommunityClientProperty; value: CommunityClientPropertyValue | null; disabled?: boolean;
  onSave: (value: CommunityClientPropertyValue | null) => Promise<void> }) {
  const { property } = props;
  const [text, setText] = useState(props.value === null || props.value === undefined ? "" : String(props.value));
  useEffect(() => { setText(props.value === null || props.value === undefined ? "" : String(props.value)); }, [props.value]);
  // Polynet keeps this one (each member's offers), so it only shows.
  if (property.system) {
    const shown = Array.isArray(props.value) ? props.value.at(-1) : props.value;
    return <span className="pn-members-system-value" title="Set by the member's offer">{shown === null || shown === undefined || shown === "" ? "—" : String(shown)}</span>;
  }
  const label = property.name;
  if (property.type === "checkbox") {
    return <input type="checkbox" aria-label={label} checked={props.value === true} disabled={props.disabled}
      onClick={(event) => event.stopPropagation()} onChange={(event) => void props.onSave(event.target.checked)} />;
  }
  if (property.type === "select") {
    return <select aria-label={label} value={typeof props.value === "string" ? props.value : ""} disabled={props.disabled}
      onClick={(event) => event.stopPropagation()} onChange={(event) => void props.onSave(event.target.value || null)}>
      <option value="">–</option>
      {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  if (property.type === "multi_select") {
    const picked = Array.isArray(props.value) ? props.value : [];
    return <span className="pn-members-multi" onClick={(event) => event.stopPropagation()}>
      {property.options.map((option) => <label key={option} className={picked.includes(option) ? "is-on" : undefined}>
        <input type="checkbox" checked={picked.includes(option)} disabled={props.disabled}
          onChange={(event) => void props.onSave(event.target.checked ? [...picked, option] : picked.filter((item) => item !== option))} />{option}
      </label>)}
    </span>;
  }
  const commit = () => {
    const trimmed = text.trim();
    const current = props.value === null || props.value === undefined ? "" : String(props.value);
    if (trimmed === current) return;
    void props.onSave(!trimmed ? null : property.type === "number" ? Number(trimmed.replace(/,/g, "")) : trimmed);
  };
  return <input aria-label={label} disabled={props.disabled} placeholder="Empty"
    type={property.type === "number" ? "number" : property.type === "date" ? "date" : property.type === "url" ? "url" : "text"}
    value={text} onClick={(event) => event.stopPropagation()} onChange={(event) => setText(event.target.value)}
    onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setText(props.value === null ? "" : String(props.value)); }} />;
}

function FilterRow(props: { filter: CommunityClientFilter; fields: CommunityClientField[]; onChange: (filter: CommunityClientFilter) => void; onRemove: () => void }) {
  const field = props.fields.find((item) => item.key === props.filter.field) ?? props.fields[0];
  const ops = communityClientFilterOpsFor(field.kind);
  const op = ops.includes(props.filter.op) ? props.filter.op : ops[0];
  const needsValue = !["is_empty", "is_not_empty", "is_true", "is_false"].includes(op);
  const choices = field.key === "status" ? field.options.map((key) => ({ key, label: COMMUNITY_CLIENT_STATUS_LABELS[key] ?? key }))
    : field.options.map((key) => ({ key, label: key }));
  const picked = Array.isArray(props.filter.value) ? props.filter.value : props.filter.value !== undefined ? [String(props.filter.value)] : [];
  const days = op === "within_days" || op === "more_than_days_ago";
  return <div className="pn-members-filter-row">
    <select aria-label="Field" value={field.key} onChange={(event) => {
      const next = props.fields.find((item) => item.key === event.target.value)!;
      props.onChange({ field: next.key, op: communityClientFilterOpsFor(next.kind)[0] });
    }}>{props.fields.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select>
    <select aria-label="Condition" value={op} onChange={(event) => props.onChange({ field: field.key, op: event.target.value as CommunityClientFilterOp,
      ...(["is_empty", "is_not_empty", "is_true", "is_false"].includes(event.target.value) ? {} : { value: props.filter.value }) })}>
      {ops.map((item) => <option key={item} value={item}>{COMMUNITY_CLIENT_FILTER_OP_LABELS[item]}</option>)}
    </select>
    {!needsValue ? null : choices.length && (op === "is" || op === "is_not") ? <span className="pn-members-multi">
      {choices.map((choice) => <label key={choice.key} className={picked.includes(choice.key) ? "is-on" : undefined}>
        <input type="checkbox" checked={picked.includes(choice.key)} onChange={(event) => {
          const next = event.target.checked ? [...picked, choice.key] : picked.filter((item) => item !== choice.key);
          props.onChange({ field: field.key, op, ...(next.length ? { value: next } : {}) });
        }} />{choice.label}
      </label>)}
    </span> : <span className="pn-members-filter-value">
      <input aria-label="Value" type={field.kind === "number" || days ? "number" : "text"} min={days ? 0 : undefined}
        value={props.filter.value === undefined ? "" : String(props.filter.value)}
        onChange={(event) => props.onChange({ field: field.key, op, ...(event.target.value === "" ? {} : {
          value: field.kind === "number" || days ? Number(event.target.value) : event.target.value }) })} />
      {days ? <span>days{op === "more_than_days_ago" ? " ago" : ""}</span> : null}
    </span>}
    <button type="button" className="pn-members-icon" aria-label="Remove filter" onClick={props.onRemove}><X size={14} /></button>
  </div>;
}

function filterComplete(filter: CommunityClientFilter) {
  if (["is_empty", "is_not_empty", "is_true", "is_false"].includes(filter.op)) return true;
  return Array.isArray(filter.value) ? filter.value.length > 0 : filter.value !== undefined && filter.value !== "";
}

function Popover(props: { onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) props.onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, []);
  return <div ref={ref} className={`pn-members-popover${props.className ? ` ${props.className}` : ""}`}>{props.children}</div>;
}

function AddPropertyForm(props: { busy: boolean; onSubmit: (input: { name: string; type: CommunityClientPropertyType; options?: string[] }) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CommunityClientPropertyType>("text");
  const [options, setOptions] = useState("");
  const choice = type === "select" || type === "multi_select";
  return <form className="pn-members-panel pn-members-form" onSubmit={(event) => {
    event.preventDefault();
    props.onSubmit({ name: name.trim(), type, ...(choice ? { options: options.split(",").map((item) => item.trim()).filter(Boolean) } : {}) });
  }}>
    <h3>Add a property</h3>
    <div className="pn-members-form-row">
      <label><span>Name</span><input required autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Revenue band" /></label>
      <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as CommunityClientPropertyType)}>
        {COMMUNITY_CLIENT_PROPERTY_TYPES.map((item) => <option key={item} value={item}>{TYPE_LABELS[item]}</option>)}
      </select></label>
      {choice ? <label className="is-wide"><span>Choices, separated by commas</span><input required value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Under $5K, $5–20K, $20K+" /></label> : null}
    </div>
    <p className="pn-members-hint">You, your agent, a form answer or a Workflow can fill it in.</p>
    <div className="pn-members-actions">
      <button type="button" className="pn-members-button is-ghost" onClick={props.onCancel}>Cancel</button>
      <button type="submit" className="pn-members-button is-primary" disabled={props.busy || !name.trim()}>{props.busy ? "Adding…" : "Add property"}</button>
    </div>
  </form>;
}

function ManageProperties(props: { gateway: CommunityAccessGateway; properties: CloudCommunityClientProperty[]; onChanged: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const act = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await operation(); props.onChanged(); setConfirm(null); } catch (caught) { setError(errorText(caught)); } finally { setBusy(null); }
  };
  return <div className="pn-members-panel">
    <div className="pn-members-panel-head"><h3>Your properties</h3><button type="button" className="pn-members-icon" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
    {!props.properties.length ? <p className="pn-members-hint">No properties yet. Add one to track anything Polynet doesn't.</p> : null}
    <ul className="pn-members-props">
      {props.properties.map((property) => property.system ? <li key={property.key}>
        <input aria-label="Property name" value={property.name} disabled readOnly />
        <span className="pn-members-type">{TYPE_LABELS[property.type]}</span>
        <span className="is-wide pn-members-hint">Kept by Polynet from each member's offer. Change offers in Settings › Offers.</span>
      </li> : <li key={property.key}>
        <input aria-label="Property name" defaultValue={property.name} maxLength={60} disabled={busy === property.key}
          onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== property.name) void act(property.key, () => props.gateway.updateProperty(property.key, { name })); }} />
        <span className="pn-members-type">{TYPE_LABELS[property.type]}</span>
        {property.type === "select" || property.type === "multi_select"
          ? <input aria-label="Choices" className="is-wide" defaultValue={property.options.join(", ")} disabled={busy === property.key}
            onBlur={(event) => { const options = event.target.value.split(",").map((item) => item.trim()).filter(Boolean);
              if (options.join("|") !== property.options.join("|")) void act(property.key, () => props.gateway.updateProperty(property.key, { options })); }} />
          : <span className="is-wide" />}
        {confirm === property.key
          ? <span className="pn-members-confirm">Remove it and hide every member's value?
            <button type="button" className="pn-members-button is-danger" onClick={() => void act(property.key, () => props.gateway.archiveProperty(property.key))}>Remove</button>
            <button type="button" className="pn-members-button is-ghost" onClick={() => setConfirm(null)}>Keep</button></span>
          : <button type="button" className="pn-members-button is-ghost" onClick={() => setConfirm(property.key)}>Remove</button>}
      </li>)}
    </ul>
    {error ? <p role="alert" className="workflow-error">{error}</p> : null}
  </div>;
}

type BulkKind = "message" | "set_property" | "flag" | "note";

function BulkPanel(props: { kind: BulkKind; count: number; properties: CloudCommunityClientProperty[]; busy: boolean;
  onRun: (action: CloudCommunityClientBulkInput) => void; onCancel: () => void }) {
  const [body, setBody] = useState("");
  const properties = props.properties.filter((item) => !item.system);
  const [key, setKey] = useState(properties[0]?.key ?? "");
  const [value, setValue] = useState<CommunityClientPropertyValue | null>(null);
  const property = properties.find((item) => item.key === key) ?? null;
  const who = `${props.count} member${props.count === 1 ? "" : "s"}`;
  if (props.kind === "set_property") {
    if (!properties.length) return <div className="pn-members-panel"><p className="pn-members-hint">Add a property first, then you can fill it for many members at once.</p>
      <div className="pn-members-actions"><button type="button" className="pn-members-button is-ghost" onClick={props.onCancel}>Close</button></div></div>;
    return <form className="pn-members-panel pn-members-form" onSubmit={(event) => { event.preventDefault(); props.onRun({ type: "set_property", propertyKey: key, value }); }}>
      <h3>Set a property for {who}</h3>
      <div className="pn-members-form-row">
        <label><span>Property</span><select value={key} onChange={(event) => { setKey(event.target.value); setValue(null); }}>
          {properties.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
        </select></label>
        {property ? <label className="is-wide"><span>Value (leave empty to clear it)</span>
          <span className="pn-members-bulk-value"><PropertyEditor key={property.key} property={property} value={value} onSave={async (next) => setValue(next)} /></span></label> : null}
      </div>
      <div className="pn-members-actions">
        <button type="button" className="pn-members-button is-ghost" onClick={props.onCancel}>Cancel</button>
        <button type="submit" className="pn-members-button is-primary" disabled={props.busy}>{props.busy ? "Saving…" : value === null ? `Clear for ${who}` : `Set for ${who}`}</button>
      </div>
    </form>;
  }
  const message = props.kind === "message";
  return <form className="pn-members-panel pn-members-form" onSubmit={(event) => { event.preventDefault(); props.onRun({ type: props.kind as "message" | "flag" | "note", ...(body.trim() ? { body: body.trim() } : {}) }); }}>
    <h3>{message ? `Message ${who}` : props.kind === "flag" ? `Flag ${who}` : `Add a note to ${who}`}</h3>
    <textarea required={props.kind !== "flag"} autoFocus rows={message ? 5 : 3} maxLength={message ? 4000 : 2000} value={body} onChange={(event) => setBody(event.target.value)}
      placeholder={message ? "Hi {first_name}, …" : props.kind === "flag" ? "Why (optional)" : "What you want to remember"} />
    <p className="pn-members-hint">{message
      ? "Each member gets it as a direct message from you, by name: {first_name} and {name} are filled in. It's logged as contact on their timeline."
      : "It shows on each member's timeline."}</p>
    <div className="pn-members-actions">
      <button type="button" className="pn-members-button is-ghost" onClick={props.onCancel}>Cancel</button>
      <button type="submit" className="pn-members-button is-primary" disabled={props.busy || (props.kind !== "flag" && !body.trim())}>
        {props.busy ? "Working…" : message ? `Send to ${who}` : props.kind === "flag" ? `Flag ${who}` : `Add note`}</button>
    </div>
  </form>;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(name: string, clients: CloudCommunityClient[], fields: CommunityClientField[]) {
  const header = ["Name", ...fields.map((field) => field.name)];
  const rows = clients.map((client) => [client.name, ...fields.map((field) => communityClientFieldValue(client as any, field.key))]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "members"}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MemberPage(props: { gateway: CommunityAccessGateway; client: CloudCommunityClient; fields: CommunityClientField[];
  properties: CloudCommunityClientProperty[]; nowMs: number; onBack: () => void; onChanged: () => void; variant?: "page" | "panel"; onExpand?: () => void;
  onSetValue: (key: string, value: CommunityClientPropertyValue | null) => Promise<void>; onBulk: (kind: BulkKind) => void; onAddProperty: () => void }) {
  const { client, nowMs } = props;
  const [tab, setTab] = useState<"details" | "progress" | "access" | "activity">("details");
  const [refreshKey, setRefreshKey] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const builtIn = props.fields.filter((field) => field.source === "polynet" && !field.key.startsWith("course:") && field.key !== "is_test");
  const courses = client.courses ?? [];
  const totalLessons = courses.reduce((sum, course) => sum + course.lesson_count, 0);
  const overall = communityClientFieldValue(client as any, "course_progress") as number;
  const addNote = async () => {
    setBusy(true); setError(null);
    try { await props.gateway.recordEvent(client.membership_id, "note", note.trim()); setNote(""); setRefreshKey((n) => n + 1); props.onChanged(); }
    catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  };
  const panel = props.variant === "panel";
  return <div className={`pn-members-member${panel ? " is-panel" : ""}`}>
    {panel ? <div className="pn-members-side-bar">
      <span className="pn-members-attrs-label">Member record</span>
      <button type="button" className="pn-members-icon" onClick={props.onExpand} aria-label="Open full page" title="Open full page"><Maximize2 size={15} /></button>
      <button type="button" className="pn-members-icon" onClick={props.onBack} aria-label="Close" title="Close"><X size={16} /></button>
    </div>
      : <button type="button" className="pn-members-button is-ghost pn-members-back" onClick={props.onBack}><ArrowLeft size={15} />Members</button>}
    <header className="pn-members-member-head">
      <UserAvatar name={client.name} imageUrl={client.avatar_url} className="community-interaction-avatar pn-members-avatar is-large" />
      <div className="pn-members-member-name">
        <h2>{client.name}{client.is_test ? <span className="pn-members-pill is-off">Test member</span> : null}</h2>
        <span>{client.email ?? "No verified email"}</span>
      </div>
      <div className="pn-members-actions">
        <button type="button" className="pn-members-button" onClick={() => props.onBulk("message")}><MessageSquare size={15} />Message</button>
        <button type="button" className="pn-members-button" onClick={() => props.onBulk("flag")}><Flag size={15} />Flag</button>
      </div>
    </header>
    <div className="pn-members-stats">
      <div><b>{totalLessons ? `${overall}%` : "–"}</b><span>Course progress · {client.lessons_done} lesson{client.lessons_done === 1 ? "" : "s"} done</span></div>
      <div><b>{client.last_seen_at ? ago(client.last_seen_at, nowMs) : "–"}</b><span>Last seen</span></div>
      <div><b>{client.stage?.name ?? "–"}</b><span>Workflow stage{client.stage?.entered_at ? ` · since ${day(client.stage.entered_at)}` : ""}</span></div>
    </div>
    <div className="pn-members-tabs" role="tablist" aria-label="Member">
      {(["details", "progress", "access", "activity"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
        onClick={() => setTab(key)}>{key === "details" ? "Details" : key === "progress" ? "Progress" : key === "access" ? "Access" : "Activity"}</button>)}
    </div>
    {tab === "details" ? <div className="pn-members-attrs">
      <div className="pn-members-attrs-section">Tracked by Polynet</div>
      {builtIn.map((field) => <div key={field.key} className="pn-members-attr">
        <span className="pn-members-attr-key">{field.name}</span>
        <span className="pn-members-attr-value"><FieldValue client={client} field={field} nowMs={nowMs} properties={props.properties} /></span>
      </div>)}
      <div className="pn-members-attrs-section">Your properties</div>
      {props.properties.map((property) => <div key={property.key} className="pn-members-attr">
        <span className="pn-members-attr-key">{property.name}</span>
        <span className="pn-members-attr-value is-editable"><PropertyEditor property={property} value={client.properties?.[property.key] ?? null}
          onSave={(value) => props.onSetValue(property.key, value)} /></span>
      </div>)}
      <div className="pn-members-attr"><button type="button" className="pn-members-button is-ghost" onClick={props.onAddProperty}><Plus size={14} />Add property</button></div>
      {client.facts?.length ? <>
        <div className="pn-members-attrs-section">What they told the community</div>
        {client.facts.map((fact, index) => <div key={index} className="pn-members-attr"><span className="pn-members-attr-key">{fact.kind.replace(/_/g, " ")}</span><span className="pn-members-attr-value">{fact.body}</span></div>)}
      </> : null}
    </div>
      : tab === "progress" ? <div className="pn-members-attrs">
        {!courses.length ? <p className="pn-members-hint pn-members-pad">No courses yet.</p> : courses.map((course) => <div key={course.ref} className="pn-members-attr">
          <span className="pn-members-attr-key">{course.name ?? "Untitled course"}</span>
          <span className="pn-members-attr-value"><span className="pn-members-progress"><span className="pn-members-bar"><i style={{ width: `${course.percent}%` }} /></span>
            {course.done_count} of {course.lesson_count} lessons{course.completed_at ? ` · finished ${day(course.completed_at)}` : ""}</span></span>
        </div>)}
      </div>
      : tab === "access" ? <WebCommunityClientAccessPanel gateway={props.gateway} membershipId={client.membership_id} onChanged={props.onChanged} />
      : <div className="pn-members-activity">
        <form className="pn-members-note" onSubmit={(event) => { event.preventDefault(); if (note.trim()) void addNote(); }}>
          <StickyNote size={15} aria-hidden="true" />
          <input aria-label="Add a note" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Add a note to their timeline" />
          <button type="submit" className="pn-members-button" disabled={busy || !note.trim()}>{busy ? "Adding…" : "Add"}</button>
        </form>
        {error ? <p role="alert" className="workflow-error">{error}</p> : null}
        <ClientTimeline gateway={props.gateway} membershipId={client.membership_id} refreshKey={refreshKey} />
      </div>}
  </div>;
}

export function WebCommunityMembers({ gateway }: { gateway: CommunityAccessGateway }) {
  const [page, setPage] = useState<CloudCommunityClientPage | null>(null);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const [activeKey, setActiveKey] = useState("all");
  // Workflows' "View members in this stage" opens here with ?stage=<name>: All, filtered to that stage.
  const [draft, setDraft] = useState<Draft | null>(() => {
    const stage = new URLSearchParams(window.location.search).get("stage")?.trim();
    if (!stage) return null;
    return { name: "All", columns: COMMUNITY_CLIENT_DEFAULT_COLUMNS, filters: [{ field: "stage", op: "is", value: stage }], match: "all", sort: null, group: null };
  });
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<null | "filter" | "display" | "more" | "add_property" | "properties" | "rename" | "new_view" | "stuck" | "give" | "sort" | "group" | BulkKind>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The open member lives in ?member= so the browser Back button returns to the list.
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("member"));
  useEffect(() => {
    const sync = () => { pushedMember.current = false; setOpenId(new URLSearchParams(window.location.search).get("member")); };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const pushedMember = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("stage")) return;
    url.searchParams.delete("stage");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  // Wide screens open the record beside the table (Airtable shape); narrow ones, or "Open full page", get the full page.
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 75rem)").matches);
  const [fullPage, setFullPage] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 75rem)");
    const sync = () => setWide(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const openMember = (id: string | null) => {
    if (!id) setFullPage(false);
    if (!id && pushedMember.current) { pushedMember.current = false; window.history.back(); return; }
    pushedMember.current = Boolean(id) && (pushedMember.current || !openId);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("member", id); else url.searchParams.delete("member");
    if (id && openId) window.history.replaceState(window.history.state, "", url);
    else if (id) window.history.pushState(window.history.state, "", url);
    else if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url);
    setOpenId(id);
  };
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewName, setViewName] = useState("");
  const [stuckDays, setStuckDays] = useState("");
  const [bulkFor, setBulkFor] = useState<string[] | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let current = true;
    setState((previous) => (previous === "ready" ? "ready" : "loading"));
    Promise.all([gateway.listAllClients(), gateway.views()])
      .then(([loaded, saved]) => { if (!current) return; setPage(loaded); setViews(saved.views); setLoadedAt(Date.now()); setState("ready"); })
      .catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [gateway, reload]);

  const fields = page?.fields ?? [];
  const properties = page?.properties ?? [];
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const savedView = views.find((view) => view.key === activeKey) ?? views[0] ?? null;
  const view: Draft = draft ?? (savedView ? toDraft(savedView) : { name: "All", columns: COMMUNITY_CLIENT_DEFAULT_COLUMNS, filters: [], match: "all", sort: null, group: null });
  const changed = Boolean(draft && savedView && !sameDraft(draft, toDraft(savedView)));
  const clients = page?.clients ?? [];
  const nowMs = loadedAt;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const searched = needle ? clients.filter((client) => `${client.name} ${client.email ?? ""}`.toLowerCase().includes(needle)) : clients;
    return applyCommunityClientView(searched as any[], { ...view, filters: view.filters.filter(filterComplete) }, nowMs) as CloudCommunityClient[];
  }, [clients, view, query, nowMs]);
  const columns = view.columns.map((key) => fieldByKey.get(key)).filter((field): field is CommunityClientField => Boolean(field));
  const counts = useMemo(() => new Map(views.map((saved) => [saved.key, applyCommunityClientView(clients as any[], saved, nowMs).length])), [views, clients, nowMs]);
  const open = clients.find((client) => client.membership_id === openId) ?? null;
  const selectedIds = [...selected].filter((id) => rows.some((row) => row.membership_id === id));
  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.membership_id));

  const edit = (patch: Partial<Draft>) => setDraft({ ...view, ...patch });
  const pickView = (key: string) => { setActiveKey(key); setDraft(null); setSelected(new Set()); setPanel(null); };
  const act = async (operation: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); if (done) setNotice(done); return true; }
    catch (caught) { setError(errorText(caught)); return false; }
    finally { setBusy(false); }
  };
  const saveView = (asNew: boolean, name?: string) => act(async () => {
    const result = await gateway.saveView(asNew ? { view: { ...view, name: name ?? view.name, filters: view.filters.filter(filterComplete) } }
      : { key: savedView!.key, view: { ...view, filters: view.filters.filter(filterComplete) } });
    const saved = await gateway.views();
    setViews(saved.views); setActiveKey(result.view.key); setDraft(null); setPanel(null);
  }, asNew ? `Saved the view “${name ?? view.name}”.` : "View saved.");
  const setValue = async (membershipId: string, key: string, value: CommunityClientPropertyValue | null) => {
    setError(null);
    try {
      await gateway.setValue(membershipId, key, value);
      setPage((previous) => previous ? { ...previous, clients: previous.clients.map((client) => client.membership_id === membershipId
        ? { ...client, properties: { ...client.properties, [key]: value } } : client) } : previous);
    } catch (caught) { setError(errorText(caught)); }
  };
  const runBulk = async (action: CloudCommunityClientBulkInput, ids: string[]) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const started = await gateway.bulk(action, ids);
      let status = await gateway.bulkStatus(started.bulk_action_id);
      for (let tries = 0; status.status !== "done" && tries < 150 && alive.current; tries++) {
        setNotice(`Working… ${status.done} of ${status.total}`);
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        status = await gateway.bulkStatus(started.bulk_action_id);
      }
      const verb = action.type === "message" ? "Sent to" : action.type === "set_property" ? "Updated" : action.type === "flag" ? "Flagged" : "Added a note to";
      const failed = status.failed.map((row) => clients.find((client) => client.membership_id === row.membership_id)?.name ?? "a member");
      setNotice(status.status !== "done" ? `Still working: ${status.done} of ${status.total} done. Refresh in a moment.`
        : `${verb} ${status.succeeded} of ${status.total}.${failed.length ? ` Couldn't reach ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ` and ${failed.length - 5} more` : ""}.` : ""}`);
      setPanel(null); setBulkFor(null); setSelected(new Set()); setReload((n) => n + 1);
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  };
  const sortBy = (key: string) => {
    const current = view.sort?.field === key ? view.sort.direction : null;
    edit({ sort: current === "desc" ? { field: key, direction: "asc" } : current === "asc" ? null : { field: key, direction: "desc" } });
  };
  const bulkIds = bulkFor ?? selectedIds;
  const bulkPanel = panel === "message" || panel === "set_property" || panel === "flag" || panel === "note"
    ? <BulkPanel kind={panel} count={bulkIds.length} properties={properties} busy={busy}
      onRun={(action) => void runBulk(action, bulkIds)} onCancel={() => { setPanel(null); setBulkFor(null); }} /> : null;
  const addPropertyPanel = panel === "add_property" ? <AddPropertyForm busy={busy} onCancel={() => setPanel(null)} onSubmit={(input) => void act(async () => {
    const created = await gateway.createProperty(input);
    const loaded = await gateway.listAllClients();
    setPage(loaded); setPanel(null);
    if (!view.columns.includes(`prop:${created.property.key}`)) edit({ columns: [...view.columns, `prop:${created.property.key}`] });
  }, `Added “${input.name}”. Save the view to keep it as a column.`)} /> : null;
  const messages = <>
    {notice ? <p role="status" className="pn-members-notice">{notice}</p> : null}
    {error ? <p role="alert" className="workflow-error">{error}</p> : null}
  </>;

  const memberView = (variant: "page" | "panel") => open ? <MemberPage key={open.membership_id} gateway={gateway} client={open} fields={fields} properties={properties} nowMs={nowMs}
    variant={variant} onExpand={() => setFullPage(true)}
    onBack={() => { openMember(null); setPanel(null); setBulkFor(null); }} onChanged={() => setReload((n) => n + 1)}
    onSetValue={(key, value) => setValue(open.membership_id, key, value)}
    onBulk={(kind) => { setBulkFor([open.membership_id]); setPanel(kind); }} onAddProperty={() => setPanel("add_property")} /> : null;
  if (open && (fullPage || !wide)) {
    return <div className="workflow-page pn-members">
      {messages}
      {bulkPanel}{addPropertyPanel}
      {memberView("page")}
    </div>;
  }

  const sortField = view.sort ? fields.find((field) => field.key === view.sort!.field) ?? null : null;
  const groupField = view.group ? fields.find((field) => field.key === view.group) ?? null : null;
  const groups = groupField ? groupCommunityClients(rows as any[], groupField) as Array<{ value: string | null; label: string; rows: CloudCommunityClient[] }> : null;
  const groupLabel = (group: { value: string | null; label: string }) => group.value === null ? group.label
    : groupField?.key === "status" ? COMMUNITY_CLIENT_STATUS_LABELS[group.value as keyof typeof COMMUNITY_CLIENT_STATUS_LABELS] ?? group.label
    : groupField?.key === "role" ? group.label.charAt(0).toUpperCase() + group.label.slice(1) : group.label;
  const renderRow = (client: CloudCommunityClient) => <tr key={client.membership_id} className={[selected.has(client.membership_id) ? "is-selected" : "", client.membership_id === openId ? "is-open" : ""].join(" ").trim() || undefined} onClick={() => openMember(client.membership_id)}>
                <td className="pn-members-check" onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${client.name}`} checked={selected.has(client.membership_id)}
                    onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(client.membership_id); else next.delete(client.membership_id); return next; })} />
                </td>
                <td className="pn-members-who">
                  <span className="pn-members-person">
                    <UserAvatar name={client.name} imageUrl={client.avatar_url} className="community-interaction-avatar pn-members-avatar" />
                    <span><strong>{client.name}{client.is_test ? <small className="pn-members-test"> · test</small> : null}</strong><small>{client.email ?? ""}</small></span>
                  </span>
                </td>
                {columns.map((field) => {
                  const property = field.source === "owner" ? properties.find((item) => `prop:${item.key}` === field.key) : null;
                  return <td key={field.key} className={property ? "is-editable" : undefined} data-label={field.name}>
                    {property ? <PropertyEditor property={property} value={client.properties?.[property.key] ?? null}
                      onSave={(value) => setValue(client.membership_id, property.key, value)} />
                      : <FieldValue client={client} field={field} nowMs={nowMs} properties={properties} />}
                  </td>;
                })}
              </tr>;
  const total = clients.filter((client) => !client.is_test).length;
  const tests = clients.length - total;
  return <div className="workflow-page pn-members">
    <header className="pn-members-head">
      <h2>{state === "ready" ? `${total.toLocaleString()} member${total === 1 ? "" : "s"}` : "Members"}
        {state === "ready" && tests ? <small className="pn-members-test"> + {tests} test</small> : null}</h2>
      {state === "ready" ? <span className="pn-members-updated">Updated {ago(new Date(loadedAt).toISOString(), Date.now()) === "Today" ? "just now" : day(new Date(loadedAt).toISOString())}</span> : null}
      <span className="pn-members-spacer" />
      <button type="button" className="pn-members-button" onClick={() => setReload((n) => n + 1)} aria-label="Refresh members"><RefreshCw size={14} />Refresh</button>
      <button type="button" className="pn-members-button" onClick={() => setPanel(panel === "add_property" ? null : "add_property")}><Plus size={14} />Add property</button>
      <button type="button" className="pn-members-button is-primary" onClick={() => setPanel(panel === "give" ? null : "give")}><Plus size={14} />Give access</button>
    </header>
    {panel === "give" ? <div className="pn-members-panel">
      <p className="pn-members-hint">Give someone access without a paid plan. They need a Polynet account with a verified email.</p>
      <GrantForm withEmail submitLabel="Give access" busy={busy} onCancel={() => setPanel(null)} onSubmit={(input) => act(async () => {
        await gateway.grant({ email: input.email, endsAt: input.endsAt, reason: input.reason });
        setPanel(null); setReload((n) => n + 1);
      }, `Gave ${input.email} access${input.endsAt ? ` until ${day(`${input.endsAt}T12:00:00Z`)}` : ""}.`)} />
    </div> : null}

    <div className="pn-members-views" role="tablist" aria-label="Views">
      {views.map((saved) => <button key={saved.key} type="button" role="tab" aria-selected={saved.key === (savedView?.key ?? "")} onClick={() => pickView(saved.key)}>
        {saved.name}<span className="pn-members-count">{counts.get(saved.key) ?? 0}</span>
      </button>)}
      <button type="button" className="pn-members-newview" onClick={() => { setViewName(""); setPanel(panel === "new_view" ? null : "new_view"); }}><Plus size={13} />View</button>
    </div>

    <div className="pn-members-toolbar">
      <label className="pn-members-search"><Search size={15} aria-hidden="true" />
        <input type="search" aria-label="Search members" placeholder="Search name or email" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="button" className={`pn-members-button${panel === "filter" ? " is-on" : ""}`} aria-expanded={panel === "filter"} onClick={() => setPanel(panel === "filter" ? null : "filter")}>
        Filter{view.filters.length ? ` · ${view.filters.length}` : ""}{panel === "filter" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <span className="pn-members-anchor">
        <button type="button" className={`pn-members-button${panel === "sort" ? " is-on" : ""}`} aria-expanded={panel === "sort"} onClick={() => setPanel(panel === "sort" ? null : "sort")}>
          <ArrowUpDown size={14} />Sort{sortField ? ` · ${sortField.name}` : ""}</button>
        {panel === "sort" ? <Popover onClose={() => setPanel(null)} className="pn-members-display pn-members-popform">
          <div className="pn-members-group">Sort by</div>
          <select aria-label="Sort by" value={view.sort?.field ?? ""} onChange={(event) => edit({ sort: event.target.value ? { field: event.target.value, direction: view.sort?.direction ?? "desc" } : null })}>
            <option value="">Not sorted</option>
            {fields.map((field) => <option key={field.key} value={field.key}>{field.name}</option>)}
          </select>
          {view.sort ? <select aria-label="Direction" value={view.sort.direction} onChange={(event) => edit({ sort: { field: view.sort!.field, direction: event.target.value as "asc" | "desc" } })}>
            <option value="desc">{sortField?.kind === "date" ? "Newest first" : sortField?.kind === "number" ? "Highest first" : "Z to A"}</option>
            <option value="asc">{sortField?.kind === "date" ? "Oldest first" : sortField?.kind === "number" ? "Lowest first" : "A to Z"}</option>
          </select> : null}
        </Popover> : null}
      </span>
      <span className="pn-members-anchor">
        <button type="button" className={`pn-members-button${panel === "group" ? " is-on" : ""}`} aria-expanded={panel === "group"} onClick={() => setPanel(panel === "group" ? null : "group")}>
          <Rows3 size={14} />Group{groupField ? ` · ${groupField.name}` : ""}</button>
        {panel === "group" ? <Popover onClose={() => setPanel(null)} className="pn-members-display pn-members-popform">
          <div className="pn-members-group">Group by</div>
          <select aria-label="Group by" value={view.group ?? ""} onChange={(event) => edit({ group: event.target.value || null })}>
            <option value="">No grouping</option>
            {fields.filter(communityClientGroupable).map((field) => <option key={field.key} value={field.key}>{field.name}</option>)}
          </select>
          <p className="pn-members-hint">Works with choice and yes/no properties, status, plan, workflow stage and role.</p>
        </Popover> : null}
      </span>
      <span className="pn-members-anchor">
        <button type="button" className={`pn-members-button${panel === "display" ? " is-on" : ""}`} aria-expanded={panel === "display"} onClick={() => setPanel(panel === "display" ? null : "display")}><SlidersHorizontal size={14} />Display</button>
        {panel === "display" ? <Popover onClose={() => setPanel(null)} className="pn-members-display">
          {[["Tracked by Polynet", fields.filter((field) => field.source === "polynet" && !field.key.startsWith("course:"))],
            ["Courses", fields.filter((field) => field.key.startsWith("course:"))],
            ["Your properties", fields.filter((field) => field.source === "owner")]].map(([title, group]) => (group as CommunityClientField[]).length ? <div key={title as string}>
            <div className="pn-members-group">{title as string}</div>
            {(group as CommunityClientField[]).map((field) => <label key={field.key}>
              <input type="checkbox" checked={view.columns.includes(field.key)}
                onChange={(event) => edit({ columns: event.target.checked ? [...view.columns, field.key] : view.columns.filter((key) => key !== field.key) })} />{field.name}
            </label>)}
          </div> : null)}
          <div className="pn-members-display-foot">
            <button type="button" className="pn-members-button is-ghost" onClick={() => { setPanel("properties"); }}><Tag size={14} />Manage properties</button>
          </div>
        </Popover> : null}
      </span>
      <span className="pn-members-anchor">
        <button type="button" className="pn-members-button" aria-label="More" aria-expanded={panel === "more"} onClick={() => setPanel(panel === "more" ? null : "more")}><MoreHorizontal size={15} /></button>
        {panel === "more" ? <Popover onClose={() => setPanel(null)} className="pn-members-menu">
          <button type="button" onClick={() => { downloadCsv(view.name, rows, columns); setPanel(null); }}><Download size={14} />Export this view as CSV</button>
          <button type="button" onClick={() => setPanel("properties")}><Tag size={14} />Manage properties</button>
          <button type="button" onClick={() => { setPanel(null); openCommunityTab("members"); }}><Users size={14} />Open the member directory</button>
          <button type="button" onClick={() => { setStuckDays(String(page?.stuck_days ?? 7)); setPanel("stuck"); }}><SlidersHorizontal size={14} />Change when someone counts as stuck</button>
          {savedView ? <button type="button" onClick={() => { setViewName(savedView.name); setPanel("rename"); }}>Rename this view</button> : null}
          {savedView && views.length > 1 ? <button type="button" className="is-danger" onClick={() => void act(async () => {
            await gateway.deleteView(savedView.key);
            const saved = await gateway.views(); setViews(saved.views); pickView(saved.views[0]?.key ?? "all");
          }, `Deleted the view “${savedView.name}”.`)}>Delete this view</button> : null}
        </Popover> : null}
      </span>
      {changed ? <span className="pn-members-dirty">
        <button type="button" className="pn-members-button is-ghost" onClick={() => setDraft(null)}>Reset</button>
        <button type="button" className="pn-members-button" onClick={() => { setViewName(`${view.name} (copy)`); setPanel("new_view"); }}>Save as new</button>
        <button type="button" className="pn-members-button is-primary" disabled={busy} onClick={() => void saveView(false)}>Save view</button>
      </span> : null}
    </div>

    {panel === "filter" ? <div className="pn-members-panel">
      {view.filters.length > 1 ? <div className="pn-members-match">Show members who match
        <select aria-label="Match" value={view.match} onChange={(event) => edit({ match: event.target.value as "all" | "any" })}>
          <option value="all">all</option><option value="any">any</option>
        </select> of these</div> : null}
      {view.filters.map((filter, index) => <FilterRow key={index} filter={filter} fields={fields}
        onChange={(next) => edit({ filters: view.filters.map((item, at) => (at === index ? next : item)) })}
        onRemove={() => edit({ filters: view.filters.filter((_, at) => at !== index) })} />)}
      {!view.filters.length ? <p className="pn-members-hint">No filters: everyone shows.</p> : null}
      <div className="pn-members-actions">
        <button type="button" className="pn-members-button is-ghost" onClick={() => fields[0] && edit({ filters: [...view.filters, { field: "status", op: "is" }] })}><Plus size={14} />Add filter</button>
        <span className="pn-members-spacer" />
        <button type="button" className="pn-members-button is-ghost" onClick={() => setPanel(null)}>Done</button>
      </div>
    </div> : null}
    {panel === "new_view" || panel === "rename" ? <form className="pn-members-panel pn-members-form" onSubmit={(event) => {
      event.preventDefault();
      if (panel === "rename") void act(async () => { await gateway.saveView({ key: savedView!.key, view: { ...toDraft(savedView!), name: viewName.trim() } }); const saved = await gateway.views(); setViews(saved.views); setPanel(null); }, "Renamed.");
      else void saveView(true, viewName.trim());
    }}>
      <h3>{panel === "rename" ? "Rename this view" : "Save as a new view"}</h3>
      <div className="pn-members-form-row"><label className="is-wide"><span>Name</span><input required autoFocus maxLength={40} value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="e.g. $20K+ and stuck" /></label></div>
      {panel === "new_view" ? <p className="pn-members-hint">It keeps the columns, filters and sort you see now. Your agent can change it too.</p> : null}
      <div className="pn-members-actions">
        <button type="button" className="pn-members-button is-ghost" onClick={() => setPanel(null)}>Cancel</button>
        <button type="submit" className="pn-members-button is-primary" disabled={busy || !viewName.trim()}>{panel === "rename" ? "Rename" : "Save view"}</button>
      </div>
    </form> : null}
    {panel === "stuck" ? <form className="pn-members-panel pn-members-form" onSubmit={(event) => {
      event.preventDefault();
      void act(async () => { await gateway.setStuckDays(Number(stuckDays)); setPanel(null); setReload((n) => n + 1); }, `Members now count as stuck after ${stuckDays} days without progress.`);
    }}>
      <h3>When someone counts as stuck</h3>
      <div className="pn-members-form-row"><label><span>Days without progress</span><input type="number" min={1} max={365} required value={stuckDays} onChange={(event) => setStuckDays(event.target.value)} /></label></div>
      <p className="pn-members-hint">Progress is finishing a lesson, sending a form or moving a stage. Joining counts too.</p>
      <div className="pn-members-actions">
        <button type="button" className="pn-members-button is-ghost" onClick={() => setPanel(null)}>Cancel</button>
        <button type="submit" className="pn-members-button is-primary" disabled={busy}>Save</button>
      </div>
    </form> : null}
    {panel === "properties" ? <ManageProperties gateway={gateway} properties={properties} onClose={() => setPanel(null)}
      onChanged={() => void gateway.listAllClients().then(setPage).catch(() => setReload((n) => n + 1))} /> : null}
    {addPropertyPanel}
    {messages}

    {selectedIds.length && !bulkFor ? <div className="pn-members-bulkbar" role="region" aria-label="Selected members">
      <span><b>{selectedIds.length} selected</b>{!allOnPage && rows.length <= COMMUNITY_CLIENT_BULK_LIMIT
        ? <button type="button" className="pn-members-link" onClick={() => setSelected(new Set(rows.map((row) => row.membership_id)))}>Select all {rows.length}</button> : null}</span>
      <span className="pn-members-spacer" />
      <button type="button" className="pn-members-link" onClick={() => setSelected(new Set())}>Deselect all</button>
      <button type="button" className="pn-members-button is-primary" onClick={() => setPanel("message")}><MessageSquare size={14} />Message</button>
      <button type="button" className="pn-members-button" onClick={() => setPanel("set_property")}><Tag size={14} />Set property</button>
      <button type="button" className="pn-members-button" onClick={() => setPanel("flag")}><Flag size={14} />Flag</button>
      <button type="button" className="pn-members-button" onClick={() => setPanel("note")}><StickyNote size={14} />Note</button>
      <button type="button" className="pn-members-button" onClick={() => downloadCsv(`${view.name} selected`, rows.filter((row) => selected.has(row.membership_id)), columns)}><Download size={14} />Export</button>
    </div> : null}
    {selectedIds.length > COMMUNITY_CLIENT_BULK_LIMIT ? <p className="workflow-error" role="alert">Pick up to {COMMUNITY_CLIENT_BULK_LIMIT} members at a time.</p> : null}
    {bulkPanel}

    {state === "loading" ? <div className="pn-members-loading" role="status"><span className="pn-members-spinner" aria-hidden="true" />Loading members…</div>
      : state === "error" ? <p className="workflow-error" role="alert">Couldn't load members. <button type="button" className="pn-members-button" onClick={() => setReload((n) => n + 1)}>Try again</button></p>
      : <div className={open ? "pn-members-split" : "pn-members-unsplit"}><div className="pn-members-table-wrap">
        <table className="pn-members-table">
          <thead><tr>
            <th className="pn-members-check"><input type="checkbox" aria-label="Select all in this view" checked={allOnPage}
              onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.membership_id)) : new Set())} /></th>
            <th className="pn-members-who">Member</th>
            {columns.map((field) => <th key={field.key} aria-sort={view.sort?.field === field.key ? (view.sort.direction === "asc" ? "ascending" : "descending") : undefined}>
              <button type="button" onClick={() => sortBy(field.key)} title="Sort">
                {field.source === "owner" ? <span className="pn-members-mine" aria-label="Your property">◆</span> : null}{field.name}
                {view.sort?.field === field.key ? view.sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
              </button>
            </th>)}
          </tr></thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={columns.length + 2} className="pn-members-none">{clients.length ? "No members in this view." : "No members yet. They show up here when they join."}</td></tr>
              : groups ? groups.map((group) => <Fragment key={group.value ?? "__empty"}>
                <tr className="pn-members-grouprow"><td colSpan={columns.length + 2}>{groupLabel(group)}<span className="pn-members-count">{group.rows.length}</span></td></tr>
                {group.rows.map(renderRow)}
              </Fragment>)
              : rows.map(renderRow)}
          </tbody>
        </table>
      </div>
      {open ? <aside className="pn-members-side" aria-label={`${open.name}'s record`}>{memberView("panel")}</aside> : null}
      </div>}
    <p className="pn-members-hint"><span className="pn-members-mine">◆</span> marks your own properties: click a cell to change it. Everything else is tracked by Polynet.</p>
  </div>;
}
