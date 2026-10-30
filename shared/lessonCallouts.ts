// Callouts in a lesson: a quote whose first line names its type, the same
// "> [!TIP]" alerts GitHub and Obsidian read, so agents and the CLI can write
// them and other Markdown tools still show something sensible.
//
//   > [!TIP] One tool first
//   > Connect one tool before you add the next.
//
// Text after the marker on its first line is the callout's title, as in
// Obsidian; the type only sets the colour and icon, and readers never see its
// name.

export type LessonCalloutType = "tip" | "note" | "important" | "action" | "warning";

export const LESSON_CALLOUTS: readonly { type: LessonCalloutType; marker: string; label: string; hint: string }[] = [
  { type: "tip", marker: "TIP", label: "Tip", hint: "A helpful shortcut" },
  { type: "note", marker: "NOTE", label: "Note", hint: "Good to know" },
  { type: "important", marker: "IMPORTANT", label: "Key idea", hint: "The one thing to remember" },
  { type: "action", marker: "ACTION", label: "Do this", hint: "A step to take now" },
  { type: "warning", marker: "WARNING", label: "Warning", hint: "A mistake to avoid" },
];

// Other names writers use for the same callouts.
const ALIASES: Record<string, LessonCalloutType> = { CAUTION: "warning", KEY: "important", DO: "action", TODO: "action" };

/** "[!TIP]" at the very start of a quote's first line, and any spaces after it. */
export const LESSON_CALLOUT_MARKER = /^\[!([A-Za-z]+)\][ \t]*/;

export function lessonCalloutType(value: unknown): LessonCalloutType | null {
  if (typeof value !== "string") return null;
  const word = value.toUpperCase();
  return LESSON_CALLOUTS.find((callout) => callout.marker === word || callout.type.toUpperCase() === word)?.type ?? ALIASES[word] ?? null;
}

export function lessonCallout(type: LessonCalloutType) {
  return LESSON_CALLOUTS.find((callout) => callout.type === type) ?? LESSON_CALLOUTS[0];
}

export function lessonCalloutMarker(type: LessonCalloutType): string {
  return `[!${lessonCallout(type).marker}]`;
}

/** The first line of a top-level quote that opens with a callout marker. */
const CALLOUT_MARKER_LINE = /^(>[ \t]?)\[!([A-Za-z]+)\](?:[ \t]+(\S.*?))?[ \t]*$/;

/**
 * Takes each top-level callout's title ("" when it has none) off its marker
 * line, in order, so a Markdown parser that joins a quote's lines still sees
 * the marker on a line of its own. Code blocks are left alone.
 */
export function extractLessonCalloutTitles(source: string): { source: string; titles: string[] } {
  const titles: string[] = [];
  let fence: string | null = null;
  let previous = "";
  const lines = source.split("\n").map((line) => {
    const before = previous;
    previous = line;
    const opener = /^\s*(`{3,}|~{3,})/.exec(line);
    if (opener) {
      if (!fence) fence = opener[1][0];
      else if (opener[1][0] === fence) fence = null;
      return line;
    }
    if (fence || before.startsWith(">")) return line;
    const match = CALLOUT_MARKER_LINE.exec(line);
    const type = match ? lessonCalloutType(match[2]) : null;
    if (!match || !type) return line;
    titles.push(match[3] ?? "");
    return `${match[1]}[!${match[2]}]`;
  });
  return { source: lines.join("\n"), titles };
}
