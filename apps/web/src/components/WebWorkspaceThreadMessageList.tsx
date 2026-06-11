import type { ReactNode } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { AttachmentChipButton } from "../../../../shared/AttachmentChipButton";
import {
  MessageCopyAction,
  MessageFooter,
  MessageSourcesAction,
} from "../../../../shared/MessageFooterActions";
import { RuntimeComputerUseViewer } from "./RuntimeComputerUseViewer";
import { RuntimeLiveTimeline } from "./RuntimeLiveTimeline";
import { RuntimeWebSources } from "./RuntimeWebSources";
import type {
  WorkspaceMarkdownRenderer,
  WorkspaceThreadContextPayload,
  WorkspaceThreadMessageView,
} from "./webWorkspaceThreadViews";

type WebWorkspaceThreadMessageListProps = {
  messages: WorkspaceThreadMessageView[];
  copiedMessageId: string | null;
  session: AuthSessionLike | null;
  renderMarkdown: WorkspaceMarkdownRenderer;
  copyTextToClipboard: (text: string) => Promise<void> | void;
  handleCopyMessage: (messageId: string, text: string) => Promise<void> | void;
  openMessageContextModal: (payload: WorkspaceThreadContextPayload) => void;
  renderPreviewForRun: (runId: string | null) => ReactNode;
  streamingRunId: string | null;
};

export function WebWorkspaceThreadMessageList(
  props: WebWorkspaceThreadMessageListProps,
) {
  // A run can persist several assistant messages; the preview anchors only on
  // the last one, and never while the streaming view still owns the run.
  const previewAnchorMessageIdByRunId = new Map<string, string>();
  for (const message of props.messages) {
    if (message.role === "user") continue;
    const runId = String(message.runId ?? "").trim();
    if (!runId) continue;
    previewAnchorMessageIdByRunId.set(runId, message.id);
  }
  const streamingRunId = String(props.streamingRunId ?? "").trim();

  const messageItems = props.messages.map((message) => {
    const isUser = message.role === "user";
    const contextPayload = message.contextPayload;
    const messageRunId = String(message.runId ?? "").trim();
    const isPreviewAnchor =
      !isUser &&
      messageRunId.length > 0 &&
      messageRunId !== streamingRunId &&
      previewAnchorMessageIdByRunId.get(messageRunId) === message.id;

    return (
      <div
        key={message.id}
        className={isUser ? "message-item user" : "message-item assistant"}
      >
        <div className="message-text">
          {!isUser && message.runtimeEvents.length > 0 ? (
            <RuntimeLiveTimeline
              events={message.runtimeEvents}
              session={props.session}
              renderReasoningMarkdown={(text) =>
                props.renderMarkdown(text, {
                  onCopyCode: props.copyTextToClipboard,
                })
              }
              showActiveIndicators={false}
            />
          ) : null}
          {!isUser && message.runtimeEvents.length > 0 ? (
            <RuntimeComputerUseViewer
              events={message.runtimeEvents}
              session={props.session}
              requireLiveDesktop={message.requireLiveDesktop}
            />
          ) : null}
          {isUser
            ? message.textContent
            : props.renderMarkdown(message.textContent, {
                onCopyCode: props.copyTextToClipboard,
              })}
        </div>
        {message.attachments.length > 0 ? (
          <div className="attachments-preview message-attachments-preview">
            {message.attachments.map((attachment) => {
              const openUrl = attachment.openUrl;
              return (
                <AttachmentChipButton
                  key={attachment.id}
                  name={attachment.name}
                  imageUrl={attachment.imageUrl}
                  onClick={
                    openUrl
                      ? () => {
                          window.open(
                            openUrl,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      : null
                  }
                  disabled={!openUrl}
                />
              );
            })}
          </div>
        ) : null}
        {!isUser ? (
          <MessageFooter metaLabel={message.modelLabel}>
            <MessageCopyAction
              copied={props.copiedMessageId === message.id}
              onClick={() => {
                void props.handleCopyMessage(message.id, message.textContent);
              }}
              title="Copy"
              ariaLabel="Copy"
            />
            {contextPayload ? (
              <MessageSourcesAction
                onClick={() => {
                  props.openMessageContextModal(contextPayload);
                }}
                title="Sources used"
                ariaLabel="Sources used"
              />
            ) : null}
          </MessageFooter>
        ) : null}
        {isPreviewAnchor ? props.renderPreviewForRun(message.runId) : null}
        {!isUser && message.runtimeEvents.length > 0 ? (
          <RuntimeWebSources events={message.runtimeEvents} />
        ) : null}
      </div>
    );
  });

  return (
    <>
      {messageItems}
    </>
  );
}
