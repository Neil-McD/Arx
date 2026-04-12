import type { ReactNode } from "react";

export type ProjectLike = {
  id: string;
  name: string | null;
  root_path: string;
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
  generalThreads: TThread[];
  agentThreadsCount: number;
  chatThreadsCount: number;
  showChatSignInPrompt?: boolean;
};

export type ThreadSidebarPanelActions<TThread, TProject extends ProjectLike> = {
  onThreadLaneFilterChange: (lane: "chat" | "agent") => void;
  onThreadSearchQueryChange: (value: string) => void;
  onToggleProjectExpanded: (projectId: string) => void;
  onStartDraftInProject: (project: TProject) => void;
  onEditProject?: (project: TProject) => void | Promise<void>;
  onDeleteProject?: (project: TProject) => void | Promise<void>;
  renderSessionItem: (thread: TThread, opts?: { showProjectHint?: boolean }) => ReactNode;
  onSignInForChat?: () => void | Promise<void>;
};
