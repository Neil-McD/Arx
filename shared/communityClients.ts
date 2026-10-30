// A community's clients: one row per membership, past members included, for the
// owner, admins and their agents. The row is a read model over records Polynet
// already keeps (membership, subscription, workflow stage, lesson progress,
// approved member facts). The only stored state added here is the owner's own
// properties: fields the founder or their agent defines and fills in, kept
// apart from member facts, which belong to the member and need their consent.

export const COMMUNITY_CLIENT_PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
] as const;
export type CommunityClientPropertyType = (typeof COMMUNITY_CLIENT_PROPERTY_TYPES)[number];

export const COMMUNITY_CLIENT_PROPERTY_LIMIT = 50;
export const COMMUNITY_CLIENT_PROPERTY_NAME_MAX = 60;
export const COMMUNITY_CLIENT_PROPERTY_OPTION_LIMIT = 30;
export const COMMUNITY_CLIENT_PROPERTY_OPTION_MAX = 60;
export const COMMUNITY_CLIENT_TEXT_MAX = 2000;
export const COMMUNITY_CLIENT_URL_MAX = 2000;
export const COMMUNITY_CLIENT_STUCK_DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CommunityClientPropertyValue = string | number | boolean | string[];

export type CommunityClientPropertyDefinition = {
  key: string;
  name: string;
  type: CommunityClientPropertyType;
  options: string[];
};

export class CommunityClientError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
  }
}

function cleanName(value: unknown, max: number, code: string): string {
  if (typeof value !== "string") throw new CommunityClientError(code);
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > max) throw new CommunityClientError(code);
  return name;
}

/** A stable key from a property name: "Business offer" -> "business_offer". */
export function communityClientPropertyKey(name: string): string {
  const key = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return key || "property";
}

export function normalizeCommunityClientPropertyOptions(type: CommunityClientPropertyType, options: unknown): string[] {
  if (type !== "select" && type !== "multi_select") {
    if (options !== undefined && !(Array.isArray(options) && options.length === 0)) {
      throw new CommunityClientError("client_property_options_not_allowed");
    }
    return [];
  }
  if (!Array.isArray(options) || options.length === 0 || options.length > COMMUNITY_CLIENT_PROPERTY_OPTION_LIMIT) {
    throw new CommunityClientError("client_property_options_invalid");
  }
  const seen = new Set<string>();
  return options.map((option) => {
    const name = cleanName(option, COMMUNITY_CLIENT_PROPERTY_OPTION_MAX, "client_property_options_invalid");
    if (seen.has(name.toLowerCase())) throw new CommunityClientError("client_property_options_duplicate");
    seen.add(name.toLowerCase());
    return name;
  });
}

export function normalizeCommunityClientPropertyDraft(draft: { name: unknown; type: unknown; options?: unknown }) {
  const name = cleanName(draft.name, COMMUNITY_CLIENT_PROPERTY_NAME_MAX, "client_property_name_invalid");
  if (!COMMUNITY_CLIENT_PROPERTY_TYPES.includes(draft.type as CommunityClientPropertyType)) {
    throw new CommunityClientError("client_property_type_invalid");
  }
  const type = draft.type as CommunityClientPropertyType;
  return { name, type, options: normalizeCommunityClientPropertyOptions(type, draft.options) };
}

/**
 * Checks one value against its property. `null` clears it. Dates are stored
 * as YYYY-MM-DD so they read the same in every timezone.
 */
export function normalizeCommunityClientPropertyValue(
  property: CommunityClientPropertyDefinition,
  value: unknown,
): CommunityClientPropertyValue | null {
  if (value === null) return null;
  const invalid = () => new CommunityClientError("client_property_value_invalid", property.key);
  switch (property.type) {
    case "text": {
      if (typeof value !== "string" || value.length > COMMUNITY_CLIENT_TEXT_MAX) throw invalid();
      const text = value.trim();
      return text ? text : null;
    }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw invalid();
      return value;
    case "checkbox":
      if (typeof value !== "boolean") throw invalid();
      return value;
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid();
      const parsed = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid();
      return value;
    }
    case "url": {
      if (typeof value !== "string" || value.length > COMMUNITY_CLIENT_URL_MAX) throw invalid();
      let url: URL;
      try { url = new URL(value.trim()); } catch { throw invalid(); }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw invalid();
      return url.toString();
    }
    case "select": {
      if (typeof value !== "string") throw invalid();
      const option = property.options.find((name) => name.toLowerCase() === value.trim().toLowerCase());
      if (!option) throw invalid();
      return option;
    }
    case "multi_select": {
      if (!Array.isArray(value)) throw invalid();
      const picked = new Set<string>();
      for (const item of value) {
        const option = typeof item === "string"
          ? property.options.find((name) => name.toLowerCase() === item.trim().toLowerCase())
          : undefined;
        if (!option) throw invalid();
        picked.add(option);
      }
      // Kept in the property's option order so two equal picks always compare equal.
      const ordered = property.options.filter((name) => picked.has(name));
      return ordered.length ? ordered : null;
    }
  }
}

/**
 * Which property types a form question can fill. Text takes any answer; a
 * select takes one choice, a multi-select several; number, date and link take
 * a short answer that must parse.
 */
export function communityClientPropertyAcceptsQuestion(propertyType: CommunityClientPropertyType, questionType: string): boolean {
  if (propertyType === "text") return true;
  if (propertyType === "select") return questionType === "single_choice";
  if (propertyType === "multi_select") return questionType === "multiple_choice";
  if (propertyType === "number" || propertyType === "date" || propertyType === "url") return questionType === "short_text";
  return false;
}

/** The shape a short answer must have to fill a number, date or link property. */
export type CommunityClientAnswerFormat = "number" | "date" | "url";

export function communityClientAnswerFormat(propertyType: CommunityClientPropertyType): CommunityClientAnswerFormat | null {
  return propertyType === "number" || propertyType === "date" || propertyType === "url" ? propertyType : null;
}

// Digits with optional thousands commas and decimals: "12", "1,200", "-3.5".
const NUMBER_ANSWER = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^[+-]?\.\d+$/;

/** A typed answer as a number, date or link property's value. The member's check
 * and the write both use it, so an answer that passes always fills. Throws when it doesn't fit. */
function typedAnswerValue(property: CommunityClientPropertyDefinition, answer: string): CommunityClientPropertyValue | null {
  const text = answer.trim();
  if (property.type !== "number") return normalizeCommunityClientPropertyValue(property, text);
  return normalizeCommunityClientPropertyValue(property, NUMBER_ANSWER.test(text) ? Number(text.replace(/,/g, "")) : NaN);
}

/** What to tell the member when a short answer can't fill its property, or null when it can. */
export function communityClientAnswerFormatIssue(format: CommunityClientAnswerFormat, answer: string): string | null {
  if (!answer.trim()) return null;
  try {
    typedAnswerValue({ key: "answer", type: format, options: [] } as unknown as CommunityClientPropertyDefinition, answer);
    return null;
  } catch {
    return format === "number" ? "Enter a number, like 12."
      : format === "date" ? "Enter a date like 2026-11-01."
      : "Enter a full link, starting with https://.";
  }
}

/** A choice question's options its select property can't hold: answering one of them would fill nothing. */
export function communityClientUnmatchedOptions(
  property: CommunityClientPropertyDefinition,
  question: { type: string; options: string[] },
): string[] {
  if (property.type !== "select" && property.type !== "multi_select") return [];
  const known = new Set(property.options.map((name) => name.trim().toLowerCase()));
  return question.options.filter((option) => !known.has(option.trim().toLowerCase()));
}

/** A submitted answer as the value its mapped property expects; choices arrive as option indexes. */
export function communityClientValueFromAnswer(
  property: CommunityClientPropertyDefinition,
  question: { type: string; options: string[] },
  answer: string | string[] | undefined,
): CommunityClientPropertyValue | null {
  if (answer === undefined || answer === "" || (Array.isArray(answer) && !answer.length)) return null;
  const option = (index: string) => question.options[Number(index)];
  const text = question.type === "single_choice" ? option(String(answer))
    : question.type === "multiple_choice" ? (Array.isArray(answer) ? answer : [answer]).map(option).filter(Boolean).join(", ")
    : String(answer);
  if (property.type === "multi_select") {
    return normalizeCommunityClientPropertyValue(property, (Array.isArray(answer) ? answer : [answer]).map(option));
  }
  if (property.type === "number" || property.type === "date" || property.type === "url") return typedAnswerValue(property, String(text));
  return normalizeCommunityClientPropertyValue(property, property.type === "text" ? String(text).slice(0, COMMUNITY_CLIENT_TEXT_MAX) : text);
}

/** Status from the membership and its subscription, newest truth first. */
export type CommunityClientStatus = "active" | "cancelling" | "past_due" | "cancelled" | "previous";

export function deriveCommunityClientStatus(args: {
  active: boolean;
  subscription: { status: string; cancelAtPeriodEnd: boolean } | null;
}): CommunityClientStatus {
  if (!args.active) {
    return args.subscription && (args.subscription.status === "canceled" || args.subscription.status === "ended")
      ? "cancelled" : "previous";
  }
  if (args.subscription?.status === "past_due") return "past_due";
  if (args.subscription && (args.subscription.cancelAtPeriodEnd || args.subscription.status === "cancel_at_period_end")) {
    return "cancelling";
  }
  return "active";
}

/**
 * Stuck: an active member with no progress (lesson finished, form submitted,
 * stage moved, or joining itself) for `days`. The owner can change `days`.
 */
export function deriveCommunityClientStuck(args: {
  active: boolean;
  lastProgressAtMs: number | null;
  nowMs: number;
  days?: number;
}): boolean {
  if (!args.active || args.lastProgressAtMs === null) return false;
  const days = args.days ?? COMMUNITY_CLIENT_STUCK_DEFAULT_DAYS;
  return args.nowMs - args.lastProgressAtMs >= days * DAY_MS;
}

/** A join-link ref: letters, digits, dash and underscore, up to 64. Anything else is ignored. */
export function normalizeCommunityReferralRef(value: unknown): string | null {
  const ref = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,64}$/.test(ref) ? ref : null;
}
