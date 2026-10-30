// Saved views over a community's clients. A view is a data record (which
// columns, which filters, how it sorts), never code, so the owner edits it on
// the Members page and their agent edits the same record over MCP. The page
// and the agent's /builder/clients/ read both filter with clientMatchesView,
// so a view shows the same members wherever it is read.

import { COMMUNITY_CLIENT_PROPERTY_TYPES, type CommunityClientPropertyDefinition } from "./communityClients";

export type CommunityClientFieldKind = (typeof COMMUNITY_CLIENT_PROPERTY_TYPES)[number];

export type CommunityClientField = {
  /** A built-in field's name, "prop:<key>" for the owner's property, "course:<ref>" for one course's percent. */
  key: string;
  name: string;
  kind: CommunityClientFieldKind;
  options: string[];
  /** Who fills it: Polynet keeps built-in and course fields; the owner (or their agent, a form or a Workflow) fills properties. */
  source: "polynet" | "owner";
};

export const COMMUNITY_CLIENT_STATUSES = ["active", "cancelling", "past_due", "cancelled", "previous"] as const;
export const COMMUNITY_CLIENT_STATUS_LABELS: Record<string, string> = {
  active: "Active", cancelling: "Cancelling", past_due: "Past due", cancelled: "Cancelled", previous: "Previous",
};

const builtIn = (key: string, name: string, kind: CommunityClientFieldKind, options: string[] = []): CommunityClientField =>
  ({ key, name, kind, options, source: "polynet" });

/** Everything Polynet tracks about a client, in the order the column picker lists it. */
export const COMMUNITY_CLIENT_BUILT_IN_FIELDS: CommunityClientField[] = [
  builtIn("status", "Status", "select", [...COMMUNITY_CLIENT_STATUSES]),
  builtIn("email", "Email", "text"),
  builtIn("plan", "Plan", "text"),
  builtIn("stage", "Workflow stage", "text"),
  builtIn("course_progress", "Course progress", "number"),
  builtIn("lessons_done", "Lessons done", "number"),
  builtIn("forms_submitted", "Forms submitted", "number"),
  builtIn("stuck", "Stuck", "checkbox"),
  builtIn("last_seen_at", "Last seen", "date"),
  builtIn("last_active_at", "Last active", "date"),
  builtIn("last_progress_at", "Last progress", "date"),
  builtIn("last_lesson_done_at", "Last lesson finished", "date"),
  builtIn("last_contacted_at", "Last contacted", "date"),
  builtIn("last_flagged_at", "Last flagged", "date"),
  builtIn("joined_at", "Joined", "date"),
  builtIn("left_at", "Left", "date"),
  builtIn("renews_at", "Renews", "date"),
  builtIn("ends_at", "Access ends", "date"),
  builtIn("referred_by", "Referred by", "text"),
  builtIn("role", "Role", "select", ["admin", "moderator", "member"]),
  builtIn("is_test", "Test member", "checkbox"),
];

/** The fields of one community: built-in, then each course, then the owner's properties. */
export function communityClientFields(args: {
  properties: CommunityClientPropertyDefinition[];
  courses?: Array<{ ref: string; name: string | null }>;
}): CommunityClientField[] {
  return [
    ...COMMUNITY_CLIENT_BUILT_IN_FIELDS,
    ...(args.courses ?? []).map((course) => builtIn(`course:${course.ref}`, `Course: ${course.name ?? "Untitled"}`, "number")),
    ...args.properties.map((property) => ({ key: `prop:${property.key}`, name: property.name, kind: property.type,
      options: property.options, source: "owner" as const })),
  ];
}

/** The parts of a client row a view reads (the list's row shape, kept loose so old rows still read). */
export type CommunityClientRow = {
  status: string;
  role?: string;
  is_test?: boolean;
  email?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  stage?: { name: string } | null;
  courses?: Array<{ ref: string; lesson_count: number; done_count: number; percent: number }>;
  lessons_done?: number;
  forms_submitted?: number;
  stuck?: boolean;
  last_seen_at?: string | null;
  last_active_at?: string | null;
  last_progress_at?: string | null;
  last_lesson_done_at?: string | null;
  last_contacted_at?: string | null;
  last_flagged_at?: string | null;
  referred_by?: string | null;
  access?: { plan?: { kind: string; name?: string } | null; renews_at?: string | null; ends_at?: string | null } | null;
  properties?: Record<string, unknown>;
};

export type CommunityClientFieldValue = string | number | boolean | string[] | null;

function overallPercent(courses: CommunityClientRow["courses"]): number {
  const total = (courses ?? []).reduce((sum, course) => sum + course.lesson_count, 0);
  const done = (courses ?? []).reduce((sum, course) => sum + course.done_count, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

function planName(client: CommunityClientRow): string | null {
  const plan = client.access?.plan;
  if (!plan) return null;
  if (plan.kind === "price_point") return plan.name ?? "Paid plan";
  if (plan.kind === "grant") return "Given by hand";
  if (plan.kind === "owner") return "Owner";
  return "Free";
}

/** One field's value for one client: dates as ISO strings, course progress as a percent. */
export function communityClientFieldValue(client: CommunityClientRow, key: string): CommunityClientFieldValue {
  if (key.startsWith("prop:")) {
    const value = client.properties?.[key.slice(5)];
    return value === undefined ? null : value as CommunityClientFieldValue;
  }
  if (key.startsWith("course:")) {
    const course = (client.courses ?? []).find((row) => row.ref === key.slice(7));
    return course ? course.percent : null;
  }
  switch (key) {
    case "status": return client.status;
    case "role": return client.role ?? null;
    case "is_test": return Boolean(client.is_test);
    case "email": return client.email ?? null;
    case "plan": return planName(client);
    case "stage": return client.stage?.name ?? null;
    case "course_progress": return overallPercent(client.courses);
    case "lessons_done": return client.lessons_done ?? 0;
    case "forms_submitted": return client.forms_submitted ?? 0;
    case "stuck": return Boolean(client.stuck);
    case "renews_at": return client.access?.renews_at ?? null;
    case "ends_at": return client.access?.ends_at ?? null;
    case "joined_at": case "left_at": case "last_seen_at": case "last_active_at": case "last_progress_at":
    case "last_lesson_done_at": case "last_contacted_at": case "last_flagged_at": case "referred_by":
      return (client as Record<string, unknown>)[key] as string | null ?? null;
    default: return null;
  }
}

export const COMMUNITY_CLIENT_FILTER_OPS = [
  "is", "is_not", "contains", "is_empty", "is_not_empty", "gt", "lt", "within_days", "more_than_days_ago", "is_true", "is_false",
] as const;
export type CommunityClientFilterOp = (typeof COMMUNITY_CLIENT_FILTER_OPS)[number];

/** Which filter operators fit a field kind, in the order the filter builder offers them. */
export function communityClientFilterOpsFor(kind: CommunityClientFieldKind): CommunityClientFilterOp[] {
  switch (kind) {
    case "checkbox": return ["is_true", "is_false"];
    case "number": return ["gt", "lt", "is", "is_empty", "is_not_empty"];
    case "date": return ["within_days", "more_than_days_ago", "is_empty", "is_not_empty"];
    case "select": case "multi_select": return ["is", "is_not", "is_empty", "is_not_empty"];
    default: return ["contains", "is", "is_not", "is_empty", "is_not_empty"];
  }
}

export const COMMUNITY_CLIENT_FILTER_OP_LABELS: Record<CommunityClientFilterOp, string> = {
  is: "is", is_not: "is not", contains: "contains", is_empty: "is empty", is_not_empty: "is not empty",
  gt: "is more than", lt: "is less than", within_days: "in the last", more_than_days_ago: "more than",
  is_true: "is checked", is_false: "is not checked",
};

export type CommunityClientFilter = { field: string; op: CommunityClientFilterOp; value?: string | number | string[] };
export type CommunityClientSort = { field: string; direction: "asc" | "desc" };

export type CommunityClientView = {
  key: string;
  name: string;
  columns: string[];
  filters: CommunityClientFilter[];
  match: "all" | "any";
  sort: CommunityClientSort | null;
  /** A field to group rows by (see communityClientGroupable), or null for one flat list. */
  group: CommunityClientGroup;
};
export type CommunityClientGroup = string | null;

export const COMMUNITY_CLIENT_VIEW_LIMIT = 30;
export const COMMUNITY_CLIENT_VIEW_NAME_MAX = 40;
export const COMMUNITY_CLIENT_VIEW_COLUMN_LIMIT = 40;
export const COMMUNITY_CLIENT_VIEW_FILTER_LIMIT = 12;

export const COMMUNITY_CLIENT_DEFAULT_COLUMNS = ["status", "plan", "stage", "course_progress", "last_seen_at", "joined_at"];

const view = (key: string, name: string, filters: CommunityClientFilter[], sort: CommunityClientSort | null = null,
  columns = COMMUNITY_CLIENT_DEFAULT_COLUMNS): CommunityClientView => ({ key, name, columns, filters, match: "all", sort, group: null });
const STILL_HERE: CommunityClientFilter = { field: "status", op: "is_not", value: ["cancelled", "previous"] };

/** The views every community starts with. The owner can change or delete any of them. */
export const COMMUNITY_CLIENT_DEFAULT_VIEWS: CommunityClientView[] = [
  view("all", "All", [], { field: "joined_at", direction: "desc" }),
  view("stuck", "Stuck", [{ field: "stuck", op: "is_true" }], { field: "last_progress_at", direction: "asc" },
    ["status", "stage", "course_progress", "last_progress_at", "last_seen_at", "last_contacted_at"]),
  view("not_seen", "Not seen in 7 days", [STILL_HERE, { field: "last_seen_at", op: "more_than_days_ago", value: 7 }],
    { field: "last_seen_at", direction: "asc" }, ["status", "stage", "course_progress", "last_seen_at", "last_contacted_at"]),
  view("just_finished", "Just finished something", [{ field: "last_lesson_done_at", op: "within_days", value: 2 }],
    { field: "last_lesson_done_at", direction: "desc" }, ["status", "stage", "course_progress", "last_lesson_done_at", "lessons_done"]),
  view("about_to_cancel", "About to cancel", [{ field: "status", op: "is", value: ["cancelling", "past_due"] }],
    { field: "ends_at", direction: "asc" }, ["status", "plan", "ends_at", "course_progress", "last_seen_at", "last_contacted_at"]),
  view("cancelled", "Cancelled", [{ field: "status", op: "is", value: ["cancelled"] }], { field: "left_at", direction: "desc" },
    ["status", "plan", "left_at", "course_progress", "joined_at"]),
  view("previous", "Previous clients", [{ field: "status", op: "is", value: ["previous"] }], { field: "left_at", direction: "desc" },
    ["status", "left_at", "course_progress", "joined_at", "referred_by"]),
];

export class CommunityClientViewError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
  }
}

/** A view key from its name: "About to cancel" -> "about_to_cancel". */
export function communityClientViewKey(name: string): string {
  const key = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return key || "view";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Checks a view against the community's fields. Unknown columns or filter
 * fields are refused, so a typo never silently shows everyone.
 */
export function normalizeCommunityClientView(input: unknown, fields: CommunityClientField[]): Omit<CommunityClientView, "key"> {
  const bad = (what: string) => new CommunityClientViewError("client_view_invalid", what);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("view");
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > COMMUNITY_CLIENT_VIEW_NAME_MAX) throw bad("name");
  const known = new Map(fields.map((field) => [field.key, field]));
  const columns = raw.columns === undefined ? COMMUNITY_CLIENT_DEFAULT_COLUMNS.filter((key) => known.has(key)) : raw.columns;
  if (!Array.isArray(columns) || columns.length > COMMUNITY_CLIENT_VIEW_COLUMN_LIMIT
      || columns.some((key) => typeof key !== "string" || !known.has(key))) throw bad("columns");
  const filters = raw.filters ?? [];
  if (!Array.isArray(filters) || filters.length > COMMUNITY_CLIENT_VIEW_FILTER_LIMIT) throw bad("filters");
  const cleanFilters = filters.map((filter): CommunityClientFilter => {
    if (!filter || typeof filter !== "object") throw bad("filter");
    const { field, op, value } = filter as Record<string, unknown>;
    const definition = typeof field === "string" ? known.get(field) : undefined;
    if (!definition) throw bad(`filter field ${String(field)}`);
    if (!communityClientFilterOpsFor(definition.kind).includes(op as CommunityClientFilterOp)) throw bad(`filter op ${String(op)} for ${definition.key}`);
    const needsValue = !["is_empty", "is_not_empty", "is_true", "is_false"].includes(op as string);
    if (!needsValue) return { field: definition.key, op: op as CommunityClientFilterOp };
    if (op === "within_days" || op === "more_than_days_ago" || op === "gt" || op === "lt") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw bad(`filter value for ${definition.key}`);
      return { field: definition.key, op: op as CommunityClientFilterOp, value };
    }
    if (Array.isArray(value)) {
      if (!value.length || value.length > 30 || value.some((item) => typeof item !== "string" || item.length > 100)) throw bad(`filter value for ${definition.key}`);
      return { field: definition.key, op: op as CommunityClientFilterOp, value: [...new Set(value as string[])] };
    }
    if ((typeof value !== "string" || !value.trim() || value.length > 100) && typeof value !== "number") throw bad(`filter value for ${definition.key}`);
    return { field: definition.key, op: op as CommunityClientFilterOp, value: typeof value === "string" ? value.trim() : value };
  });
  const match = raw.match === undefined ? "all" : raw.match;
  if (match !== "all" && match !== "any") throw bad("match");
  let sort: CommunityClientSort | null = null;
  if (raw.sort !== undefined && raw.sort !== null) {
    const { field, direction } = raw.sort as Record<string, unknown>;
    if (typeof field !== "string" || !known.has(field) || (direction !== "asc" && direction !== "desc")) throw bad("sort");
    sort = { field, direction };
  }
  let group: CommunityClientGroup = null;
  if (raw.group !== undefined && raw.group !== null) {
    const definition = typeof raw.group === "string" ? known.get(raw.group) : undefined;
    if (!definition || !communityClientGroupable(definition)) throw bad("group");
    group = definition.key;
  }
  return { name, columns: [...new Set(columns as string[])], filters: cleanFilters, match, sort, group };
}

function asText(value: CommunityClientFieldValue): string {
  if (value === null || value === undefined) return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function isEmpty(value: CommunityClientFieldValue): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length);
}

export function communityClientMatchesFilter(client: CommunityClientRow, filter: CommunityClientFilter, nowMs: number): boolean {
  const value = communityClientFieldValue(client, filter.field);
  const wanted = Array.isArray(filter.value) ? filter.value : filter.value === undefined ? [] : [filter.value];
  const lower = (items: unknown[]) => items.map((item) => String(item).toLowerCase());
  switch (filter.op) {
    case "is_empty": return isEmpty(value);
    case "is_not_empty": return !isEmpty(value);
    case "is_true": return value === true;
    case "is_false": return value !== true;
    case "contains": return asText(value).toLowerCase().includes(String(filter.value ?? "").toLowerCase());
    case "is": case "is_not": {
      const have = lower(Array.isArray(value) ? value : isEmpty(value) ? [] : [value]);
      const hit = lower(wanted).some((item) => have.includes(item));
      return filter.op === "is" ? hit : !hit;
    }
    case "gt": return typeof value === "number" && value > Number(filter.value);
    case "lt": return typeof value === "number" && value < Number(filter.value);
    case "within_days": case "more_than_days_ago": {
      const at = typeof value === "string" ? Date.parse(value) : NaN;
      if (!Number.isFinite(at)) return filter.op === "more_than_days_ago";
      const days = (nowMs - at) / DAY_MS;
      return filter.op === "within_days" ? days <= Number(filter.value) : days > Number(filter.value);
    }
  }
}

export function communityClientMatchesView(client: CommunityClientRow, view: Pick<CommunityClientView, "filters" | "match">, nowMs: number): boolean {
  if (!view.filters.length) return true;
  return view.match === "any"
    ? view.filters.some((filter) => communityClientMatchesFilter(client, filter, nowMs))
    : view.filters.every((filter) => communityClientMatchesFilter(client, filter, nowMs));
}

/** Sorts by one field; empty values always go last. */
export function sortCommunityClients<T extends CommunityClientRow>(clients: T[], sort: CommunityClientSort | null): T[] {
  if (!sort) return clients;
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...clients].sort((a, b) => {
    const left = communityClientFieldValue(a, sort.field);
    const right = communityClientFieldValue(b, sort.field);
    if (isEmpty(left) && isEmpty(right)) return 0;
    if (isEmpty(left)) return 1;
    if (isEmpty(right)) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    if (typeof left === "boolean" || typeof right === "boolean") return (Number(left) - Number(right)) * sign;
    return asText(left).localeCompare(asText(right)) * sign;
  });
}

/** A client list in a view: filtered, then sorted. */
export function applyCommunityClientView<T extends CommunityClientRow>(clients: T[], view: Pick<CommunityClientView, "filters" | "match" | "sort">, nowMs: number): T[] {
  return sortCommunityClients(clients.filter((client) => communityClientMatchesView(client, view, nowMs)), view.sort);
}

// ---------------------------------------------------------------------------
// Bulk actions on selected clients

export const COMMUNITY_CLIENT_BULK_ACTIONS = ["set_property", "message", "flag", "note"] as const;
export type CommunityClientBulkActionType = (typeof COMMUNITY_CLIENT_BULK_ACTIONS)[number];
/** How many clients one bulk action may touch. */
export const COMMUNITY_CLIENT_BULK_LIMIT = 200;
export const COMMUNITY_CLIENT_MESSAGE_MAX = 4000;

/** "{first_name}" and "{name}" in a bulk message become each member's own name. */
export function personalizeCommunityClientMessage(template: string, name: string): string {
  const full = name.trim() || "there";
  const first = full.split(/\s+/)[0] ?? full;
  return template.replace(/\{first_name\}/g, first).replace(/\{name\}/g, full);
}

const GROUPABLE_TEXT_FIELDS = new Set(["plan", "stage"]);

/** Fields with a short list of values: choices, yes/no, plan and workflow stage. */
export function communityClientGroupable(field: Pick<CommunityClientField, "key" | "kind">): boolean {
  return field.kind === "select" || field.kind === "checkbox" || GROUPABLE_TEXT_FIELDS.has(field.key);
}

export type CommunityClientRowGroup<T> = { value: string | null; label: string; rows: T[] };

/** Splits already sorted rows into groups: choices in their set order, then other values A to Z, then the empty group. */
export function groupCommunityClients<T extends CommunityClientRow>(clients: T[], field: CommunityClientField): CommunityClientRowGroup<T>[] {
  const byValue = new Map<string | null, T[]>();
  for (const client of clients) {
    const raw = communityClientFieldValue(client, field.key);
    const value = field.kind === "checkbox" ? (raw === true ? "true" : "false")
      : raw === null || raw === undefined || raw === "" ? null : Array.isArray(raw) ? raw.join(", ") : String(raw);
    const list = byValue.get(value);
    if (list) list.push(client); else byValue.set(value, [client]);
  }
  const order = field.kind === "checkbox" ? ["true", "false"] : field.options;
  const keys = [...byValue.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    const left = order.indexOf(a), right = order.indexOf(b);
    if (left !== -1 || right !== -1) return (left === -1 ? Infinity : left) - (right === -1 ? Infinity : right);
    return a.localeCompare(b);
  });
  return keys.map((value) => ({ value, rows: byValue.get(value)!,
    label: value === null ? `No ${field.name.toLowerCase()}` : field.kind === "checkbox" ? (value === "true" ? field.name : `Not ${field.name.toLowerCase()}`) : value }));
}
