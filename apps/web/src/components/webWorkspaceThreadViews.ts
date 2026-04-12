import type { ReactNode } from "react";
import type {
  HistoryUsedItem,
  MemorySuggestion,
  MemoryUsedItem,
} from "../../../../shared/messageMetadataUi";
import type { MessageContextModalPayload } from "../../../../shared/messageContextUi";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";

export type WorkspaceThreadContextPayload = MessageContextModalPayload<
  MemoryUsedItem,
  HistoryUsedItem,
  MemorySuggestion
>;

export type WorkspaceMarkdownRenderer = (
  text: string,
  options: { onCopyCode: (text: string) => Promise<void> | void },
) => ReactNode;

export type WorkspaceThreadAttachmentView = {
  id: string;
  name: string;
  imageUrl: string | null;
  openUrl: string | null;
};

export type WorkspaceThreadErrorView = {
  displayedError: ReactNode;
  showSignInAction: boolean;
  showRetryAction: boolean;
};

export type WorkspaceThreadMessageView = {
  id: string;
  role: "user" | "assistant";
  textContent: string;
  attachments: WorkspaceThreadAttachmentView[];
  runtimeEvents: ThreadStreamingRuntimeEvent[];
  runId: string | null;
  requireLiveDesktop: boolean;
  modelLabel: string | null;
  contextPayload: WorkspaceThreadContextPayload | null;
};

export type WorkspaceStreamingMessageView = {
  runtimeEvents: ThreadStreamingRuntimeEvent[];
  content: string;
};
