import { Fragment, type ReactNode } from "react";
import {
  parseChatBlockMarkdown,
  type ChatMarkdownListBlock,
} from "./chatBlockMarkdown";

type ChatBlockMarkdownProps = {
  text: string;
  renderInline: (text: string) => ReactNode;
};

function renderWithLineBreaks(text: string, renderInline: (text: string) => ReactNode): ReactNode {
  return text.split("\n").map((line, index, lines) => (
    <Fragment key={`${index}:${line.slice(0, 24)}`}>
      {renderInline(line)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function ChatMarkdownList(props: {
  block: ChatMarkdownListBlock;
  renderInline: (text: string) => ReactNode;
}) {
  const items = props.block.items.map((item, index) => (
    <li key={`${index}:${item.text.slice(0, 24)}`}>
      <span className="chat-md-list-item-text">{props.renderInline(item.text)}</span>
      {item.children.map((child, childIndex) => (
        <ChatMarkdownList
          key={`${childIndex}:${child.ordered ? "ol" : "ul"}`}
          block={child}
          renderInline={props.renderInline}
        />
      ))}
    </li>
  ));

  if (props.block.ordered) {
    return (
      <ol className="chat-md-list" start={props.block.start === 1 ? undefined : props.block.start}>
        {items}
      </ol>
    );
  }
  return <ul className="chat-md-list">{items}</ul>;
}

export function ChatBlockMarkdown(props: ChatBlockMarkdownProps) {
  const blocks = parseChatBlockMarkdown(props.text);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const content = props.renderInline(block.text);
          if (block.level === 1) return <h2 key={index} className="chat-md-heading chat-md-heading-1">{content}</h2>;
          if (block.level === 2) return <h3 key={index} className="chat-md-heading chat-md-heading-2">{content}</h3>;
          return <h4 key={index} className="chat-md-heading chat-md-heading-3">{content}</h4>;
        }
        if (block.kind === "list") {
          return <ChatMarkdownList key={index} block={block} renderInline={props.renderInline} />;
        }
        if (block.kind === "blockquote") {
          return (
            <blockquote key={index} className="chat-md-blockquote">
              {renderWithLineBreaks(block.text, props.renderInline)}
            </blockquote>
          );
        }
        if (block.kind === "divider") {
          return <hr key={index} className="chat-md-divider" />;
        }
        if (block.kind === "code_block") {
          return (
            <pre
              key={index}
              className="chat-md-code-block"
              data-language={block.language ?? undefined}
              tabIndex={0}
              onKeyDown={(event) => {
                const codeBlock = event.currentTarget;
                if (codeBlock.scrollWidth <= codeBlock.clientWidth) return;
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  codeBlock.scrollLeft += event.key === "ArrowRight" ? 40 : -40;
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  codeBlock.scrollLeft = event.key === "End" ? codeBlock.scrollWidth : 0;
                }
              }}
            >
              <code>{block.text}</code>
            </pre>
          );
        }
        return (
          <p key={index} className="chat-md-paragraph">
            {renderWithLineBreaks(block.text, props.renderInline)}
          </p>
        );
      })}
    </>
  );
}
