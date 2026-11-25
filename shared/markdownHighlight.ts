import "highlight.js/styles/github-dark.css";
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

function normalizeCodeLanguage(language?: string): string | null {
  if (!language) return null;
  const trimmed = language.trim().toLowerCase();
  return HIGHLIGHT_LANGUAGE_ALIAS[trimmed] ?? trimmed;
}

/** The highlighted HTML for a code block, as the reader shows it. The lesson
 * editor colours its code blocks from this too, so both look the same. */
export function highlightCodeHtml(code: string, language?: string | null): string | null {
  const normalizedLanguage = normalizeCodeLanguage(language ?? undefined);
  if (normalizedLanguage && PLAIN_TEXT_LANGUAGES.has(normalizedLanguage)) return null;
  try {
    if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
      return hljs.highlight(code, { language: normalizedLanguage }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return null;
  }
}
