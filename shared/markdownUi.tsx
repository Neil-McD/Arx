import { type ReactNode, useMemo, useState } from "react";
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

export type MarkdownRenderOptions = {
  onCopyCode?: (text: string) => Promise<void> | void;
};

type CodeBlockProps = {
  code: string;
  language?: string;
  onCopyCode?: (text: string) => Promise<void> | void;
};

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

function CodeBlock({ code, language, onCopyCode }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => {
    const normalizedLanguage = language
      ? HIGHLIGHT_LANGUAGE_ALIAS[language.trim().toLowerCase()] ?? language.trim().toLowerCase()
      : null;
    if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
      try {
        return hljs.highlight(code, { language: normalizedLanguage }).value;
      } catch {
        return hljs.highlightAuto(code).value;
      }
    }
    return hljs.highlightAuto(code).value;
  }, [code, language]);

  const handleCopy = async () => {
    await copyCodeToClipboard(code, onCopyCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button className="code-block-copy" type="button" onClick={() => void handleCopy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="md-code-block">
        <code
          className={language ? `language-${language} hljs` : "hljs"}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

export function renderMarkdown(text: string, options?: MarkdownRenderOptions): ReactNode {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const elements: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("```")) {
      const lang = trimmedLine.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      elements.push(
        <CodeBlock key={key++} code={codeLines.join("\n")} language={lang || undefined} onCopyCode={options?.onCopyCode} />
      );
      i++;
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmedLine)) {
      elements.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]?.length ?? 1;
      const content = headerMatch[2] ?? "";
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(
        <Tag key={key++} className="md-header">
          {renderInline(content)}
        </Tag>
      );
      i++;
      continue;
    }

    if (trimmedLine.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const raw = lines[i] ?? "";
        const trimmed = raw.trim();
        if (trimmed === "") {
          quoteLines.push("");
          i++;
          continue;
        }
        if (!trimmed.startsWith(">")) break;
        let inner = trimmed.slice(1);
        if (inner.startsWith(" ")) inner = inner.slice(1);
        quoteLines.push(inner);
        i++;
      }
      elements.push(
        <blockquote key={key++} className="md-blockquote">
          {renderMarkdown(quoteLines.join("\n"), options)}
        </blockquote>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listItems: Array<{ kind: "text"; lines: string[] } | { kind: "code"; code: string; language?: string }> =
        [];
      while (i < lines.length) {
        const rawLine = lines[i] ?? "";
        const currentLine = rawLine.trim();
        if (/^\d+\.\s+/.test(currentLine)) {
          const content = currentLine.replace(/^\d+\.\s+/, "");
          listItems.push({ kind: "text", lines: [content] });
          i++;
        } else if (currentLine.startsWith("```")) {
          const lang = currentLine.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
            codeLines.push(lines[i] ?? "");
            i++;
          }
          listItems.push({ kind: "code", code: codeLines.join("\n"), language: lang || undefined });
          i++;
        } else if (currentLine === "") {
          i++;
        } else if (/^( {2,}|\t)/.test(rawLine) && listItems.length > 0) {
          const last = listItems[listItems.length - 1];
          if (last && last.kind === "text") {
            last.lines.push(currentLine);
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      elements.push(
        <ol key={key++} className="md-list">
          {listItems.map((item) =>
            item.kind === "code" ? (
              <li key={key++} className="md-list-code">
                <CodeBlock code={item.code} language={item.language} onCopyCode={options?.onCopyCode} />
              </li>
            ) : (
              <li key={key++}>{renderInline(item.lines.join("\n"))}</li>
            )
          )}
        </ol>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const listItems: Array<{ kind: "text"; lines: string[] } | { kind: "code"; code: string; language?: string }> =
        [];
      while (i < lines.length) {
        const rawLine = lines[i] ?? "";
        const currentLine = rawLine.trim();
        if (/^[-*]\s+/.test(currentLine)) {
          const content = currentLine.replace(/^[-*]\s+/, "");
          listItems.push({ kind: "text", lines: [content] });
          i++;
        } else if (currentLine.startsWith("```")) {
          const lang = currentLine.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
            codeLines.push(lines[i] ?? "");
            i++;
          }
          listItems.push({ kind: "code", code: codeLines.join("\n"), language: lang || undefined });
          i++;
        } else if (currentLine === "") {
          i++;
        } else if (/^( {2,}|\t)/.test(rawLine) && listItems.length > 0) {
          const last = listItems[listItems.length - 1];
          if (last && last.kind === "text") {
            last.lines.push(currentLine);
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      elements.push(
        <ul key={key++} className="md-list">
          {listItems.map((item) =>
            item.kind === "code" ? (
              <li key={key++} className="md-list-code">
                <CodeBlock code={item.code} language={item.language} onCopyCode={options?.onCopyCode} />
              </li>
            ) : (
              <li key={key++}>{renderInline(item.lines.join("\n"))}</li>
            )
          )}
        </ul>
      );
      continue;
    }

    if (trimmedLine === "") {
      i++;
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const raw = lines[i] ?? "";
      const trimmed = raw.trim();
      if (trimmed === "") break;
      if (
        trimmed.startsWith("```") ||
        /^(-{3,}|_{3,}|\*{3,})$/.test(trimmed) ||
        /^(#{1,6})\s+(.+)$/.test(trimmed) ||
        trimmed.startsWith(">") ||
        /^\d+\.\s+/.test(trimmed) ||
        /^[-*]\s+/.test(trimmed)
      ) {
        break;
      }
      paragraphLines.push(raw);
      i++;
    }
    elements.push(
      <p key={key++} className="md-paragraph">
        {renderInline(paragraphLines.join("\n"))}
      </p>
    );
  }

  return <>{elements}</>;
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="md-inline-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const label = linkMatch[1] ?? "";
      const href = (linkMatch[2] ?? "").trim();
      const safeHref =
        href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:") ? href : null;
      parts.push(
        safeHref ? (
          <a key={key++} className="md-link" href={safeHref} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      parts.push(<s key={key++}>{strikeMatch[1]}</s>);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) ?? remaining.match(/^__([^_]+)__/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/) ?? remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[`*_\[~]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    }
    if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return <>{parts}</>;
}
