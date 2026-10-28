import {
  MAX_MEMBER_FACT_BODY_LENGTH,
  MEMBER_FACT_KINDS,
  isMemberFactKind,
  type MemberFactKind,
} from "./memberOntology.ts";

export const POLYNET_PROFILE_CONFIRM_MAX_FACTS = 12;
export const POLYNET_PROFILE_CONFIRM_MARKER_MAX_LENGTH = 120;
export const POLYNET_PROFILE_CONFIRM_MARKER_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$";

export type PolynetProfileConfirmedFactInput = {
  kind: MemberFactKind;
  body: string;
};

export type PolynetProfileConfirmInput = {
  confirmMarker: string;
  facts: PolynetProfileConfirmedFactInput[];
};

export type PolynetProfileConfirmInputResult =
  | { ok: true; input: PolynetProfileConfirmInput }
  | { ok: false; message: string };

const ROOT_KEYS = new Set(["confirm_marker", "facts"]);
const FACT_KEYS = new Set(["kind", "body"]);
const CONFIRM_MARKER_REGEX = new RegExp(POLYNET_PROFILE_CONFIRM_MARKER_PATTERN);

export function buildPolynetProfileFactBatchKey(
  facts: Array<{ kind: string; body: string }>,
): string {
  return facts
    .map((fact) => `${fact.kind}\u0000${fact.body}`)
    .sort((left, right) => left.localeCompare(right))
    .join("\u0001");
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function normalizePolynetProfileConfirmInput(
  raw: Record<string, unknown>,
): PolynetProfileConfirmInputResult {
  if (!hasOnlyKeys(raw, ROOT_KEYS)) {
    return { ok: false, message: "Profile confirmation contains unsupported fields." };
  }

  if (typeof raw.confirm_marker !== "string") {
    return { ok: false, message: "confirm_marker is required." };
  }
  const confirmMarker = raw.confirm_marker.trim();
  if (!confirmMarker) {
    return { ok: false, message: "confirm_marker is required." };
  }
  if (confirmMarker.length > POLYNET_PROFILE_CONFIRM_MARKER_MAX_LENGTH) {
    return {
      ok: false,
      message: `confirm_marker must be at most ${POLYNET_PROFILE_CONFIRM_MARKER_MAX_LENGTH} characters.`,
    };
  }
  if (!CONFIRM_MARKER_REGEX.test(confirmMarker)) {
    return {
      ok: false,
      message: "confirm_marker may contain only letters, numbers, dots, underscores, colons, and hyphens.",
    };
  }

  if (!Array.isArray(raw.facts) || raw.facts.length < 1) {
    return { ok: false, message: "facts must contain at least one approved profile fact." };
  }
  if (raw.facts.length > POLYNET_PROFILE_CONFIRM_MAX_FACTS) {
    return {
      ok: false,
      message: `facts supports at most ${POLYNET_PROFILE_CONFIRM_MAX_FACTS} approved profile facts.`,
    };
  }

  const facts: PolynetProfileConfirmedFactInput[] = [];
  const seenFacts = new Set<string>();
  for (const [index, rawFact] of raw.facts.entries()) {
    if (!rawFact || typeof rawFact !== "object" || Array.isArray(rawFact)) {
      return { ok: false, message: `fact ${index + 1} must be an object.` };
    }
    const fact = rawFact as Record<string, unknown>;
    if (!hasOnlyKeys(fact, FACT_KEYS)) {
      return { ok: false, message: `fact ${index + 1} contains unsupported fields.` };
    }
    if (typeof fact.kind !== "string" || !isMemberFactKind(fact.kind.trim())) {
      return { ok: false, message: `fact ${index + 1} has an invalid kind.` };
    }
    if (typeof fact.body !== "string") {
      return { ok: false, message: `fact ${index + 1} requires body.` };
    }
    const body = fact.body.trim().replace(/\s+/g, " ");
    if (!body) {
      return { ok: false, message: `fact ${index + 1} requires body.` };
    }
    if (body.length > MAX_MEMBER_FACT_BODY_LENGTH) {
      return {
        ok: false,
        message: `fact ${index + 1} body must be at most ${MAX_MEMBER_FACT_BODY_LENGTH} characters.`,
      };
    }
    const kind = fact.kind.trim() as MemberFactKind;
    const factKey = `${kind}\u0000${body}`;
    if (seenFacts.has(factKey)) {
      return { ok: false, message: `fact ${index + 1} duplicates an earlier fact.` };
    }
    seenFacts.add(factKey);
    facts.push({ kind, body });
  }

  return { ok: true, input: { confirmMarker, facts } };
}
