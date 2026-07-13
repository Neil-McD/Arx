import type { ReactNode } from "react";
import { tokenizeChatInlineMarkdown } from "./chatInlineMarkdown";
import { renderTextWithLinks } from "./linkEmbedUi";

type RenderChatInlineMarkdownOptions = {
  // Plain text runs (incl. URL auto-linking); defaults to renderTextWithLinks.
  renderTextRun?: (text: string) => ReactNode;
  // Formatted token contents can opt into mention/contact rendering too.
  renderFormattedRun?: (text: string) => ReactNode;
  // Community chat enables labeled links; shared DM behavior stays unchanged.
  allowLabeledLinks?: boolean;
};

export function renderChatInlineMarkdown(
  rawInput: unknown,
  options?: RenderChatInlineMarkdownOptions,
): ReactNode {
  const renderTextRun = options?.renderTextRun ?? ((text: string) => renderTextWithLinks(text));
  const renderFormattedRun = options?.renderFormattedRun ?? ((text: string) => text);
  const tokens = tokenizeChatInlineMarkdown(rawInput, {
    allowLabeledLinks: options?.allowLabeledLinks,
  });
  if (tokens.length === 0) return "";
  if (tokens.length === 1 && tokens[0]!.kind === "text") {
    return renderTextRun(tokens[0]!.text);
  }
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "link": {
            const opensNewTab = token.href.startsWith("http://") || token.href.startsWith("https://");
            return (
              <a
                key={index}
                className="chat-link"
                href={token.href}
                target={opensNewTab ? "_blank" : undefined}
                rel={opensNewTab ? "noreferrer noopener" : undefined}
              >
                {token.text}
              </a>
            );
          }
          case "bold":
            return <strong key={index}>{renderFormattedRun(token.text)}</strong>;
          case "italic":
            return <em key={index}>{renderFormattedRun(token.text)}</em>;
          case "strike":
            return <del key={index}>{renderFormattedRun(token.text)}</del>;
          case "code":
            return (
              <code key={index} className="chat-inline-code">
                {token.text}
              </code>
            );
          case "code_block":
            return (
              <pre key={index} className="chat-inline-code-block">
                <code>{token.text}</code>
              </pre>
            );
          default:
            return <span key={index}>{renderTextRun(token.text)}</span>;
        }
      })}
    </>
  );
}
