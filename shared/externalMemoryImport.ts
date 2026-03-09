const EXTERNAL_MEMORY_IMPORT_CATEGORIES = [
  "Instructions",
  "Identity",
  "Career",
  "Projects",
  "Preferences",
] as const;

export type ExternalMemoryImportCategory = (typeof EXTERNAL_MEMORY_IMPORT_CATEGORIES)[number];

export type ExternalMemoryImportItem = {
  category: ExternalMemoryImportCategory;
  date: string | null;
  entry: string;
  memoryContent: string;
};

export const EXTERNAL_MEMORY_IMPORT_PROMPT = `Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward - tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

const CATEGORY_BY_KEY = new Map<string, ExternalMemoryImportCategory>(
  EXTERNAL_MEMORY_IMPORT_CATEGORIES.map((category) => [category.toLowerCase(), category]),
);

function extractImportBody(rawText: string): string {
  const fencedMatch = rawText.match(/```(?:[^\n`]*)\n([\s\S]*?)```/);
  return fencedMatch?.[1]?.trim() || rawText.trim();
}

function normalizeHeader(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:+\s*$/, "")
    .trim()
    .toLowerCase();
}

function parseCategory(line: string): ExternalMemoryImportCategory | null {
  return CATEGORY_BY_KEY.get(normalizeHeader(line)) ?? null;
}

function buildMemoryContent(item: {
  category: ExternalMemoryImportCategory;
  date: string | null;
  entry: string;
}): string {
  const datePrefix = item.date ? `[${item.date}] ` : "";
  return `${datePrefix}${item.category}: ${item.entry}`.trim();
}

export function normalizeImportedMemoryContentKey(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

export function parseExternalMemoryImport(rawText: string): ExternalMemoryImportItem[] {
  const body = extractImportBody(String(rawText ?? ""));
  if (!body) return [];

  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const items: ExternalMemoryImportItem[] = [];
  let activeCategory: ExternalMemoryImportCategory | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const nextCategory = parseCategory(line);
    if (nextCategory) {
      activeCategory = nextCategory;
      continue;
    }

    const entryMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}|unknown)\]\s*-\s*(.+)$/i);
    if (entryMatch && activeCategory) {
      const date = entryMatch[1]?.toLowerCase() === "unknown" ? null : entryMatch[1] ?? null;
      const entry = entryMatch[2]?.trim() ?? "";
      if (!entry) continue;
      items.push({
        category: activeCategory,
        date,
        entry,
        memoryContent: buildMemoryContent({
          category: activeCategory,
          date,
          entry,
        }),
      });
      continue;
    }

    const lastItem = items[items.length - 1];
    if (activeCategory && lastItem && lastItem.category === activeCategory) {
      const entry = `${lastItem.entry} ${line}`.trim();
      const date = lastItem.date;
      lastItem.entry = entry;
      lastItem.memoryContent = buildMemoryContent({
        category: activeCategory,
        date,
        entry,
      });
    }
  }

  return items;
}
