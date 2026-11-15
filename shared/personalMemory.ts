// Personal memory (docs/specs/agent-system-end-state.md, slice 2): what the
// guide remembers about one member in one community, from that member's own
// private talks with it. Small and capped, like Hermes's USER.md: the guide
// adds, changes part of, or removes entries; when it's full, a write fails
// and the guide has to merge or drop something first. Only that member can
// read it; it is never shown in a channel or pod, never to a builder, and
// never evidence for community memory. These are the rules, free of the
// database so they can be tested on their own.

export const PERSONAL_MEMORY_MAX_CHARS = 1_375;
export const PERSONAL_MEMORY_ENTRY_MAX_CHARS = 500;
export const PERSONAL_MEMORY_OPERATIONS_MAX = 10;
export const PERSONAL_MEMORY_OPERATION = "member.memory.remember";
export const PERSONAL_MEMORY_PATH = "/members/me/memory.md";

export type PersonalMemoryEntry = { text: string; sourceRef: string; at: number };

export type PersonalMemoryOperation =
  | { action: "add"; content: string }
  | { action: "patch"; oldText: string; content: string }
  | { action: "remove"; oldText: string }
  | { action: "clear" };

export type PersonalMemoryRefusal = {
  code: "operations_invalid" | "entry_too_long" | "no_match" | "ambiguous_match" | "memory_full";
  message: string;
};

// Invisible characters can hide instructions in text that is loaded into
// every private talk; they are dropped, and whitespace is folded.
function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePersonalMemoryOperations(raw: unknown): PersonalMemoryOperation[] | PersonalMemoryRefusal {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const invalid: PersonalMemoryRefusal = {
    code: "operations_invalid",
    message: `Give operations: 1 to ${PERSONAL_MEMORY_OPERATIONS_MAX} of { action: "add", content } | { action: "patch", old_text, content } | { action: "remove", old_text } | { action: "clear" }.`,
  };
  if (list.length === 0 || list.length > PERSONAL_MEMORY_OPERATIONS_MAX) return invalid;
  const operations: PersonalMemoryOperation[] = [];
  for (const item of list) {
    const op = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const content = clean(op.content);
    const oldText = clean(op.old_text ?? op.oldText);
    if (op.action === "add" && content) operations.push({ action: "add", content });
    else if (op.action === "patch" && oldText && content) operations.push({ action: "patch", oldText, content });
    else if (op.action === "remove" && oldText) operations.push({ action: "remove", oldText });
    else if (op.action === "clear") operations.push({ action: "clear" });
    else return invalid;
  }
  return operations;
}

export function personalMemoryChars(entries: Array<{ text: string }>): number {
  return entries.reduce((sum, entry) => sum + entry.text.length, 0);
}

// The one entry an old_text names: an exact whole entry wins, else a span
// that occurs in exactly one entry.
function match(entries: PersonalMemoryEntry[], oldText: string): number | PersonalMemoryRefusal {
  const exact = entries.findIndex((entry) => entry.text === oldText);
  if (exact >= 0) return exact;
  const lower = oldText.toLowerCase();
  const hits = entries.flatMap((entry, i) => (entry.text.toLowerCase().includes(lower) ? [i] : []));
  if (hits.length === 1) return hits[0];
  return hits.length === 0
    ? { code: "no_match", message: `Nothing in this member's memory contains "${oldText.slice(0, 80)}".` }
    : { code: "ambiguous_match", message: `"${oldText.slice(0, 80)}" is in more than one entry; quote more of the one you mean.` };
}

// Applies a batch to the entries. The cap is checked on the batch's result,
// so one batch can free room and add. Nothing is applied if any step fails.
export function applyPersonalMemoryOperations(
  entries: PersonalMemoryEntry[],
  operations: PersonalMemoryOperation[],
  source: { sourceRef: string; at: number },
): { entries: PersonalMemoryEntry[]; changed: boolean } | PersonalMemoryRefusal {
  let next = entries.map((entry) => ({ ...entry }));
  let changed = false;
  for (const op of operations) {
    if (op.action === "clear") {
      changed = changed || next.length > 0;
      next = [];
      continue;
    }
    if ((op.action === "add" || op.action === "patch") && op.content.length > PERSONAL_MEMORY_ENTRY_MAX_CHARS) {
      return { code: "entry_too_long", message: `An entry is at most ${PERSONAL_MEMORY_ENTRY_MAX_CHARS} characters; keep it short.` };
    }
    if (op.action === "add") {
      // The same entry twice is one entry.
      if (next.some((entry) => entry.text === op.content)) continue;
      next.push({ text: op.content, ...source });
      changed = true;
      continue;
    }
    const at = match(next, op.oldText);
    if (typeof at !== "number") return at;
    if (op.action === "remove") {
      next.splice(at, 1);
    } else {
      const entry = next[at];
      const replaced = entry.text === op.oldText
        ? op.content
        : entry.text.replace(new RegExp(op.oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), op.content);
      next[at] = { text: clean(replaced), ...source };
    }
    changed = true;
  }
  const used = personalMemoryChars(next);
  if (used > PERSONAL_MEMORY_MAX_CHARS) {
    return {
      code: "memory_full",
      message: `This member's memory would be ${used}/${PERSONAL_MEMORY_MAX_CHARS} characters. In the same batch, remove or shorten (patch) entries to free at least ${used - PERSONAL_MEMORY_MAX_CHARS} characters, then add.`,
    };
  }
  return { entries: next, changed };
}

// members/me/memory.md, as the member and the guide working for them read it.
export function renderPersonalMemory(entries: PersonalMemoryEntry[]): string {
  const used = personalMemoryChars(entries);
  const lines = [`# What the guide remembers about you here (${used}/${PERSONAL_MEMORY_MAX_CHARS} characters)`, ""];
  if (entries.length === 0) lines.push("_Nothing yet._");
  for (const entry of entries) lines.push(`- ${entry.text}`);
  return lines.join("\n");
}

// What the guide is told in a member's private talk.
export function personalMemoryInstructions(communitySlug: string): string {
  const target = `/communities/${communitySlug}/capabilities/${PERSONAL_MEMORY_OPERATION}.json`;
  return [
    "PERSONAL_MEMORY",
    "What you remember about this member, from their own private talks with you. Only they see it: never repeat it in a channel or pod, and never treat it as something the community knows.",
    "Save when they ask you to remember something, or tell you something clearly worth keeping for later talks (a goal, how they like answers, what they're working on). Not small talk, not what's already below, nothing they'd regret seeing written down.",
    "Write preferences as instructions (\"Keep answers short.\"); when one changes, patch it rather than adding a second. Keep entries short; when memory is full, merge or remove entries in the same batch.",
    `Save with polynet_call { target: "${target}", operation: "${PERSONAL_MEMORY_OPERATION}", version: 1, idempotencyKey, input: { operations: [{ action: "add", content } | { action: "patch", old_text, content } | { action: "remove", old_text } | { action: "clear" }] } }.`,
    "After saving, say in one short line what you remembered. If they ask what you remember, tell them plainly; if they say forget something (or everything), remove it (or clear) and say so.",
  ].join("\n");
}
