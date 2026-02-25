import type { ReactNode, RefObject } from "react";

export type ProjectLike = {
  id: string;
  name: string | null;
  root_path: string;
};

export type ChatThreadGroup<TThread> = {
  label: string;
  threads: TThread[];
};

export type ProjectThreadGroup<TProject, TThread> = {
  project: TProject;
  threads: TThread[];
};

export type ThreadSidebarPanelState<TThread, TProject extends ProjectLike> = {
  threadLaneFilter: "chat" | "agent";
  threadSearchQuery: string;
  normalizedThreadSearch: string;
  threadSearchResults: TThread[];
  projectThreadGroups: Array<ProjectThreadGroup<TProject, TThread>>;
  projectExpandedById: Record<string, boolean>;
  projectMenuProjectId: string | null;
  generalThreads: TThread[];
  agentThreadsCount: number;
  chatThreadsCount: number;
  chatThreadGroups: Array<ChatThreadGroup<TThread>>;
  showChatSignInPrompt?: boolean;
};

export type ThreadSidebarPanelActions<TThread, TProject extends ProjectLike> = {
  onThreadLaneFilterChange: (lane: "chat" | "agent") => void;
  onThreadSearchQueryChange: (value: string) => void;
  onAddProject: () => void | Promise<void>;
  onToggleProjectExpanded: (projectId: string) => void;
  onStartDraftInProject: (project: TProject) => void;
  onToggleProjectMenu: (projectId: string) => void;
  projectMenuRef: RefObject<HTMLDivElement>;
  onRenameProject: (project: TProject) => void | Promise<void>;
  onRemoveProject: (project: TProject) => void | Promise<void>;
  renderSessionItem: (thread: TThread, opts?: { showProjectHint?: boolean }) => ReactNode;
  onSignInForChat?: () => void | Promise<void>;
};
