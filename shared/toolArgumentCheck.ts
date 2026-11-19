// What an outside AI sends a tool, checked against the tool's published shape
// before anything runs: a misspelled or unknown field, a missing one, or a
// value of the wrong kind is refused with where and what, instead of being
// dropped silently. Covers the parts of JSON Schema our tools use; anything
// else in a schema is not checked here (the server's own checks still run).

type Schema = Record<string, unknown> | boolean | undefined;

const MAX_PROBLEMS = 8;

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected: string, value: unknown): boolean {
  const actual = kindOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return expected === actual;
}

function describe(value: unknown): string {
  const kind = kindOf(value);
  return kind === "string" ? "text" : kind === "integer" || kind === "number" ? "a number" : kind === "boolean" ? "true or false" : kind;
}

function check(schema: Schema, value: unknown, at: string, problems: string[]): void {
  if (problems.length >= MAX_PROBLEMS || schema === undefined || schema === true) return;
  if (schema === false) { problems.push(`${at}: not allowed`); return; }
  const s = schema as Record<string, any>;
  const where = at || "arguments";

  for (const key of ["anyOf", "oneOf"] as const) {
    if (Array.isArray(s[key])) {
      const fits = (s[key] as Schema[]).some((option) => { const trial: string[] = []; check(option, value, at, trial); return trial.length === 0; });
      if (!fits) { problems.push(`${where}: doesn't match any allowed shape`); return; }
    }
  }
  if (Array.isArray(s.allOf)) for (const part of s.allOf as Schema[]) check(part, value, at, problems);

  if (s.type !== undefined) {
    const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
    if (!types.some((type) => typeMatches(type, value))) {
      problems.push(`${where}: should be ${types.map((type) => type === "string" ? "text" : type).join(" or ")}, got ${describe(value)}`);
      return;
    }
  }
  if ("const" in s && JSON.stringify(s.const) !== JSON.stringify(value)) { problems.push(`${where}: must be ${JSON.stringify(s.const)}`); return; }
  if (Array.isArray(s.enum) && !s.enum.some((option: unknown) => JSON.stringify(option) === JSON.stringify(value))) {
    problems.push(`${where}: must be one of ${s.enum.map((option: unknown) => JSON.stringify(option)).join(", ")}`);
    return;
  }

  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) problems.push(`${where}: too short (at least ${s.minLength} characters)`);
    if (typeof s.maxLength === "number" && value.length > s.maxLength) problems.push(`${where}: too long (at most ${s.maxLength} characters)`);
    if (typeof s.pattern === "string") {
      let ok = true;
      try { ok = new RegExp(s.pattern, "u").test(value); } catch { ok = true; }
      if (!ok) problems.push(`${where}: not in the expected form`);
    }
  }
  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) problems.push(`${where}: at least ${s.minimum}`);
    if (typeof s.maximum === "number" && value > s.maximum) problems.push(`${where}: at most ${s.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) problems.push(`${where}: at least ${s.minItems} item(s)`);
    if (typeof s.maxItems === "number" && value.length > s.maxItems) problems.push(`${where}: at most ${s.maxItems} items`);
    if (s.items !== undefined) value.forEach((item, index) => check(s.items, item, `${at}[${index}]`, problems));
  }
  if (kindOf(value) === "object") {
    const record = value as Record<string, unknown>;
    const properties = (s.properties ?? {}) as Record<string, Schema>;
    for (const key of (Array.isArray(s.required) ? s.required : []) as string[]) {
      if (record[key] === undefined) problems.push(`${at ? `${at}.` : ""}${key}: missing`);
    }
    for (const [key, item] of Object.entries(record)) {
      const path = at ? `${at}.${key}` : key;
      if (key in properties) check(properties[key], item, path, problems);
      else if (s.additionalProperties === false) problems.push(`${path}: not a field of this tool`);
      else if (s.additionalProperties && typeof s.additionalProperties === "object") check(s.additionalProperties as Schema, item, path, problems);
    }
  }
}

// Problems with these arguments, at most a few, each "where: what"; none
// means they fit.
export function toolArgumentProblems(schema: unknown, args: unknown): string[] {
  const problems: string[] = [];
  check(schema as Schema, args, "", problems);
  return problems.slice(0, MAX_PROBLEMS);
}
