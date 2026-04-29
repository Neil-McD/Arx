import { type ReactNode, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const HIGHLIGHT_LANGUAGE_ALIAS: Record<string, string> = {
  html: "xml",
  jsx: "javascript",
  js: "javascript",
  md: "markdown",
  shell: "bash",
  sh: "bash",
  svg: "xml",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "bash",
};

const PLAIN_TEXT_LANGUAGES = new Set([
  "txt",
  "text",
  "plain",
  "plaintext",
]);

const CODE_BLOCK_LANGUAGES = new Set([
  "bash",
  "css",
  "diff",
  "go",
  "java",
  "javascript",
  "json",
  "markdown",
  "patch",
  "python",
  "rust",
  "sql",
  "typescript",
  "xml",
  "yaml",
]);

export type MarkdownRenderOptions = {
  onCopyCode?: (text: string) => Promise<void> | void;
};

type CodeBlockProps = {
  code: string;
  language?: string;
  onCopyCode?: (text: string) => Promise<void> | void;
};

type CodeBlockVariant = "code" | "artifact" | "terminal" | "diff";

async function copyCodeToClipboard(text: string, onCopyCode?: (text: string) => Promise<void> | void): Promise<void> {
  if (onCopyCode) {
    await onCopyCode(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Keep default path best-effort only.
  }
}

function downloadTextFile(filename: string, text: string, type = "text/plain;charset=utf-8"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeTableCellText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function readTableRows(table: HTMLTableElement | null): string[][] {
  if (!table) return [];
  return Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => normalizeTableCellText(cell.textContent ?? "")),
  );
}

function tableRowsToTsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => cell.replace(/\t/g, " ").replace(/\n/g, " ")).join("\t")).join("\n");
}

function escapeCsvCell(cell: string): string {
  const normalized = cell.replace(/\r\n?/g, "\n");
  if (!/[",\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function tableRowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function resolveTableTextAlign(
  align: unknown,
): "center" | "justify" | "left" | "right" | undefined {
  return align === "center" || align === "justify" || align === "left" || align === "right"
    ? align
    : undefined;
}

function normalizeCodeLanguage(language?: string): string | null {
  if (!language) return null;
  const trimmed = language.trim().toLowerCase();
  return HIGHLIGHT_LANGUAGE_ALIAS[trimmed] ?? trimmed;
}

function hasExplicitCodeLanguage(language?: string): boolean {
  const normalizedLanguage = normalizeCodeLanguage(language);
  return Boolean(normalizedLanguage && CODE_BLOCK_LANGUAGES.has(normalizedLanguage));
}

function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;

  if (/^[$>]\s+\S+/.test(trimmed)) return true;
  if (/^(npm|pnpm|yarn|git|npx|curl|cd|mkdir|rm|cp|mv|cat|sed|rg|grep|node|deno|python|pip|docker|vercel|convex)\b/.test(trimmed)) {
    return true;
  }
  if (/^[-+@]{2,}\s/.test(trimmed)) return true;
  if (/^<\/?[a-z][\w:-]*(\s|>|\/>)/i.test(trimmed)) return true;
  if (/^[{[][\s\S]*[}\]]$/.test(trimmed) && /[:",\n]/.test(trimmed)) return true;
  if (/\b(import|export|from|const|let|var|function|class|return|async|await|if|else|for|while|switch|try|catch|def|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/.test(trimmed)) {
    return true;
  }
  if (/[{};=<>]/.test(trimmed) && lines.some((line) => /[{};=<>]/.test(line))) {
    return true;
  }
  if (lines.length >= 2 && lines.every((line) => /^[\w.-]+\s*:\s+.+/.test(line))) {
    return true;
  }

  return false;
}

function shouldRenderCodeCard(code: string, language?: string): boolean {
  if (hasExplicitCodeLanguage(language)) return true;
  const lines = code.trim().split("\n").filter((line) => line.trim());
  if (lines.length <= 1 && code.trim().length <= 120) return false;
  return looksLikeCode(code);
}

function looksLikeDiagram(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (/[┌┐└┘├┤┬┴┼─│╭╮╰╯═║╔╗╚╝]/.test(trimmed)) return true;

  const lines = trimmed.split("\n").filter((line) => line.trim());
  const arrowCount = trimmed.match(/-->|<--|->|<-|=>|<=/g)?.length ?? 0;
  if (arrowCount >= 2) return true;

  const ruleLineCount = lines.filter((line) => /(?:\+-{2,}\+|[|+][-=_]{3,}|[-=_]{3,}[|+])/.test(line)).length;
  if (ruleLineCount >= 2) return true;

  const connectorLineCount = lines.filter((line) => /[|+\\/<>-]{3,}/.test(line) && /[A-Za-z0-9]/.test(line)).length;
  return lines.length >= 2 && connectorLineCount >= 2;
}

function ArtifactBlock({
  extension = "txt",
  label,
  onCopyText,
  text,
}: {
  extension?: string;
  label: string;
  onCopyText?: (text: string) => Promise<void> | void;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const normalizedText = text.trimEnd();

  const handleCopy = async () => {
    await copyCodeToClipboard(normalizedText, onCopyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadTextFile(`${label.toLowerCase()}.${extension}`, normalizedText);
  };

  return (
    <div className="md-artifact-block">
      <div className="md-artifact-toolbar">
        <span className="md-artifact-label">{label}</span>
        <div className="md-artifact-actions">
          <button className="md-artifact-action" type="button" onClick={() => void handleCopy()}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="md-artifact-action" type="button" onClick={handleDownload}>
            .{extension}
          </button>
        </div>
      </div>
      <pre className="md-artifact-content">
        <code>{normalizedText}</code>
      </pre>
    </div>
  );
}

function PlainTextBlock({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("\n") && trimmed.length <= 96) {
    return (
      <p className="md-paragraph">
        <code className="md-inline-code">{trimmed}</code>
      </p>
    );
  }

  return (
    <pre className="md-plain-block">
      <code>{trimmed}</code>
    </pre>
  );
}

function MarkdownTable({
  children,
  onCopyText,
}: {
  children: ReactNode;
  onCopyText?: (text: string) => Promise<void> | void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);

  const getRows = () => readTableRows(tableRef.current);

  const handleCopy = async () => {
    const tsv = tableRowsToTsv(getRows());
    if (!tsv) return;
    await copyCodeToClipboard(tsv, onCopyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const csv = tableRowsToCsv(getRows());
    if (!csv) return;
    downloadTextFile("table.csv", csv, "text/csv;charset=utf-8");
  };

  return (
    <div className="md-table-block">
      <div className="md-table-toolbar">
        <span className="md-table-label">Table</span>
        <div className="md-table-actions">
          <button className="md-table-action" type="button" onClick={() => void handleCopy()}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="md-table-action" type="button" onClick={handleDownload}>
            CSV
          </button>
        </div>
      </div>
      <div className="md-table-scroll">
        <table ref={tableRef} className="md-table">
          {children}
        </table>
      </div>
    </div>
  );
}

function CodeBlock({ code, language, onCopyCode }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = useMemo(() => {
    return normalizeCodeLanguage(language);
  }, [language]);
  const isPlainText = normalizedLanguage ? PLAIN_TEXT_LANGUAGES.has(normalizedLanguage) : false;
  const variant: CodeBlockVariant = useMemo(() => {
    if (normalizedLanguage === "diff" || normalizedLanguage === "patch") return "diff";
    if (normalizedLanguage === "bash") return "terminal";
    if (isPlainText || normalizedLanguage === "markdown") return "artifact";
    return "code";
  }, [isPlainText, normalizedLanguage]);
  const highlighted = useMemo(() => {
    if (isPlainText) return null;
    if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
      try {
        return hljs.highlight(code, { language: normalizedLanguage }).value;
      } catch {
        return hljs.highlightAuto(code).value;
      }
    }
    return hljs.highlightAuto(code).value;
  }, [code, isPlainText, normalizedLanguage]);

  const handleCopy = async () => {
    await copyCodeToClipboard(code, onCopyCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`code-block-wrapper code-block-variant-${variant}`}>
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button className="code-block-copy" type="button" onClick={() => void handleCopy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="md-code-block">
        {isPlainText ? (
          <code>{code}</code>
        ) : (
          <code
            className={language ? `language-${language} hljs` : "hljs"}
            dangerouslySetInnerHTML={{ __html: highlighted ?? "" }}
          />
        )}
      </pre>
    </div>
  );
}

const TOP_LEVEL_ORDERED_LIST_RE = /^(\s{0,3})(\d+)([.)])\s+/;
const TOP_LEVEL_UNORDERED_LIST_RE = /^\s{0,3}[-*+]\s+/;

function normalizeRepeatedOrderedListRuns(lines: string[]): string[] {
  const nextLines = [...lines];
  const regions: Array<{ end: number; start: number }> = [];
  let inFence = false;
  let regionStart: number | null = null;

  const closeRegion = (end: number) => {
    if (regionStart !== null && regionStart < end) {
      regions.push({ start: regionStart, end });
    }
    regionStart = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      closeRegion(index);
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (!trimmed) {
      closeRegion(index);
      return;
    }
    if (regionStart === null) regionStart = index;
  });
  closeRegion(lines.length);

  for (const region of regions) {
    const markers: Array<{ index: number; number: number }> = [];
    for (let index = region.start; index < region.end; index += 1) {
      const match = lines[index]?.match(TOP_LEVEL_ORDERED_LIST_RE);
      if (!match) continue;
      markers.push({ index, number: Number(match[2]) });
    }
    if (markers.length < 2) continue;

    const runs: Array<Array<{ index: number; number: number }>> = [];
    let currentRun: Array<{ index: number; number: number }> = [];
    for (const marker of markers) {
      const previous = currentRun[currentRun.length - 1];
      if (previous && marker.number === 1 && previous.number > 1) {
        runs.push(currentRun);
        currentRun = [];
      }
      currentRun.push(marker);
    }
    if (currentRun.length > 0) runs.push(currentRun);

    for (const run of runs) {
      if (run.length < 2 || !run.every((marker) => marker.number === 1)) continue;

      for (let runIndex = 0; runIndex < run.length; runIndex += 1) {
        const marker = run[runIndex];
        const orderedMatch = nextLines[marker.index]?.match(TOP_LEVEL_ORDERED_LIST_RE);
        if (orderedMatch) {
          nextLines[marker.index] = nextLines[marker.index].replace(
            TOP_LEVEL_ORDERED_LIST_RE,
            `${orderedMatch[1]}${runIndex + 1}${orderedMatch[3]} `,
          );
        }

        const nextMarkerIndex = markers.find((candidate) => candidate.index > marker.index)?.index ?? region.end;
        const segmentIndexes = Array.from(
          { length: Math.max(0, nextMarkerIndex - marker.index - 1) },
          (_, offset) => marker.index + offset + 1,
        );
        const hasRootChildBullets = segmentIndexes.some((index) => TOP_LEVEL_UNORDERED_LIST_RE.test(lines[index] ?? ""));
        if (!hasRootChildBullets) continue;

        for (const index of segmentIndexes) {
          const line = nextLines[index] ?? "";
          if (!line.trim() || TOP_LEVEL_ORDERED_LIST_RE.test(line)) continue;
          if (/^\s{3,}/.test(line)) continue;
          nextLines[index] = `   ${line}`;
        }
      }
    }
  }

  return nextLines;
}

function normalizeMathMarkdown(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalizeRepeatedOrderedListRuns(normalized.split("\n"));
  const nextLines: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      nextLines.push(line);
      continue;
    }

    if (inFence) {
      nextLines.push(line);
      continue;
    }

    if (trimmed === "\\[" || trimmed === "\\]") {
      nextLines.push("$$");
      continue;
    }

    const segments = line.split(/(`[^`]*`)/g);
    nextLines.push(
      segments
        .map((segment) => {
          if (segment.startsWith("`") && segment.endsWith("`")) return segment;
          return segment
            .replace(/\\\[(.+?)\\\]/g, (_, expression: string) => `$$${expression}$$`)
            .replace(/\\\((.+?)\\\)/g, (_, expression: string) => `$${expression}$`);
        })
        .join(""),
    );
  }

  return nextLines.join("\n");
}

export function renderMarkdown(text: string, options?: MarkdownRenderOptions): ReactNode {
  const components: Components = {
    a({ href, children }) {
      const safeHref =
        typeof href === "string" &&
        (href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:"))
          ? href
          : null;
      if (!safeHref) return <>{children}</>;
      return (
        <a className="md-link" href={safeHref} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    blockquote({ children }) {
      return <blockquote className="md-blockquote">{children}</blockquote>;
    },
    code(props) {
      const inline = Boolean((props as { inline?: boolean }).inline);
      const className = String(props.className ?? "");
      const raw = String(props.children ?? "").replace(/\n$/, "");
      if (inline) {
        return <code className="md-inline-code">{raw}</code>;
      }
      const match = className.match(/language-([\w-]+)/);
      const language = match?.[1];
      if (!hasExplicitCodeLanguage(language) && looksLikeDiagram(raw)) {
        return (
          <ArtifactBlock
            label="Diagram"
            text={raw}
            extension="txt"
            onCopyText={options?.onCopyCode}
          />
        );
      }
      if (!shouldRenderCodeCard(raw, language)) {
        return <PlainTextBlock text={raw} />;
      }
      return (
        <CodeBlock
          code={raw}
          language={language}
          onCopyCode={options?.onCopyCode}
        />
      );
    },
    h1({ children }) {
      return <h1 className="md-header">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="md-header">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="md-header">{children}</h3>;
    },
    h4({ children }) {
      return <h4 className="md-header">{children}</h4>;
    },
    h5({ children }) {
      return <h5 className="md-header">{children}</h5>;
    },
    h6({ children }) {
      return <h6 className="md-header">{children}</h6>;
    },
    hr() {
      return <hr className="md-hr" />;
    },
    ol({ children }) {
      return <ol className="md-list">{children}</ol>;
    },
    p({ children }) {
      return <p className="md-paragraph">{children}</p>;
    },
    pre({ children }) {
      return <>{children}</>;
    },
    table({ children }) {
      return <MarkdownTable onCopyText={options?.onCopyCode}>{children}</MarkdownTable>;
    },
    tbody({ children }) {
      return <tbody className="md-table-body">{children}</tbody>;
    },
    td({ align, children }) {
      const textAlign = resolveTableTextAlign(align);
      return (
        <td className="md-table-cell" style={textAlign ? { textAlign } : undefined}>
          {children}
        </td>
      );
    },
    th({ align, children }) {
      const textAlign = resolveTableTextAlign(align);
      return (
        <th className="md-table-cell md-table-header-cell" style={textAlign ? { textAlign } : undefined}>
          {children}
        </th>
      );
    },
    thead({ children }) {
      return <thead className="md-table-head">{children}</thead>;
    },
    tr({ children }) {
      return <tr className="md-table-row">{children}</tr>;
    },
    ul({ children }) {
      return <ul className="md-list">{children}</ul>;
    },
  };

  return (
    <ReactMarkdown
      components={components}
      rehypePlugins={[rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath]}
      skipHtml
    >
      {normalizeMathMarkdown(text)}
    </ReactMarkdown>
  );
}
