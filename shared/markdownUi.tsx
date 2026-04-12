import { type ReactNode, useMemo, useState } from "react";
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

function CodeBlock({ code, language, onCopyCode }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = useMemo(() => {
    if (!language) return null;
    const trimmed = language.trim().toLowerCase();
    return HIGHLIGHT_LANGUAGE_ALIAS[trimmed] ?? trimmed;
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

function normalizeMathMarkdown(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
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
      return (
        <CodeBlock
          code={raw}
          language={match?.[1]}
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
