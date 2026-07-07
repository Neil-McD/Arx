import type { ReactNode } from "react";
import { tokenizeChatInlineMarkdown } from "./chatInlineMarkdown";
import { renderTextWithLinks } from "./linkEmbedUi";

type RenderChatInlineMarkdownOptions = {
  // Plain text runs (incl. URL auto-linking); defaults to renderTextWithLinks.
  renderTextRun?: (text: string) => ReactNode;
};

export function renderChatInlineMarkdown(
  rawInput: unknown,
  options?: RenderChatInlineMarkdownOptions,
): ReactNode {
  const renderTextRun = options?.renderTextRun ?? ((text: string) => renderTextWithLinks(text));
  const tokens = tokenizeChatInlineMarkdown(rawInput);
  if (tokens.length === 0) return "";
  if (tokens.length === 1 && tokens[0]!.kind === "text") {
    return renderTextRun(tokens[0]!.text);
  }
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "bold":
            return <strong key={index}>{token.text}</strong>;
          case "italic":
            return <em key={index}>{token.text}</em>;
          case "strike":
            return <del key={index}>{token.text}</del>;
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
