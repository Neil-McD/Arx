import { useCallback } from "react";
import {
  buildContextFallbackThreadTitle,
  deriveThreadTitleFromUserText,
  isMissingThreadTitleValue,
} from "../../../shared/threadTitleUi";
import { normalizeThreadLane } from "../../../shared/threadSidebarSelectors";

type ThreadTitleThread = {
  id: string;
  title: string | null;
  thread_lane: string | null;
  engine_id: string;
  project_id: string | null;
  community_id: string | null;
  workspace_path: string | null;
};

type ThreadTitleMessage = {
  role: string;
  content_json: string;
};

type ThreadTitleProject = {
  id: string;
  name: string | null;
  root_path: string;
};

type ThreadTitleCommunity = {
  id: string;
  name: string;
};

type UseDesktopThreadTitleViewModelArgs<
  ThreadT extends ThreadTitleThread,
  MessageT extends ThreadTitleMessage,
  ProjectT extends ThreadTitleProject,
  CommunityT extends ThreadTitleCommunity,
> = {
  activeThreadId: string | null;
  messages: MessageT[];
  communities: CommunityT[];
  projectById: Map<string, ProjectT>;
  resolveThreadProjectId: (thread: ThreadT) => string | null;
  parseMessageText: (contentJson: string) => string;
};

export function useDesktopThreadTitleViewModel<
  ThreadT extends ThreadTitleThread,
  MessageT extends ThreadTitleMessage,
  ProjectT extends ThreadTitleProject,
  CommunityT extends ThreadTitleCommunity,
>(args: UseDesktopThreadTitleViewModelArgs<ThreadT, MessageT, ProjectT, CommunityT>) {
  const {
    activeThreadId,
    messages,
    communities,
    projectById,
    resolveThreadProjectId,
    parseMessageText,
  } = args;

  const getProjectLabelForThread = useCallback(
    (thread: ThreadT): string | null => {
      const projectId = resolveThreadProjectId(thread);
      if (!projectId) return null;
      const project = projectById.get(projectId);
      if (!project) return null;
      const name = (project.name ?? "").trim();
      if (name) return name;
      const root = (project.root_path ?? "").trim();
      return root ? root.split("/").pop() ?? root : null;
    },
    [projectById, resolveThreadProjectId],
  );

  const getThreadDisplayTitle = useCallback(
    (thread: ThreadT): string => {
      const explicitTitle = (thread.title ?? "").trim();
      if (!isMissingThreadTitleValue(explicitTitle)) {
        return explicitTitle;
      }

      if (thread.id === activeThreadId) {
        const firstUserMsg = messages.find((message) => message.role === "user");
        const preview = firstUserMsg ? parseMessageText(firstUserMsg.content_json).trim() : "";
        if (preview) {
          return deriveThreadTitleFromUserText(preview) || preview;
        }
      }

      const hints: Array<string> = [];
      const projectLabel = getProjectLabelForThread(thread);
      if (projectLabel) hints.push(projectLabel);

      if (thread.community_id) {
        const communityName =
          (communities.find((community) => community.id === thread.community_id)?.name ?? "").trim();
        if (communityName) hints.push(communityName);
      }

      const workspaceHint = (thread.workspace_path ?? "").trim();
      if (workspaceHint) {
        hints.push(workspaceHint.split("/").pop() ?? workspaceHint);
      }

      return buildContextFallbackThreadTitle({
        threadId: thread.id,
        lane: normalizeThreadLane(thread.thread_lane, thread.engine_id),
        hints,
      });
    },
    [
      activeThreadId,
      communities,
      getProjectLabelForThread,
      messages,
      parseMessageText,
    ],
  );

  const getSidebarThreadTitle = useCallback(
    (thread: ThreadT, opts?: { showProjectHint?: boolean }): string => {
      const displayTitle = getThreadDisplayTitle(thread);
      const projectLabel = opts?.showProjectHint ? getProjectLabelForThread(thread) : null;
      return projectLabel ? `${projectLabel} · ${displayTitle}` : displayTitle;
    },
    [getProjectLabelForThread, getThreadDisplayTitle],
  );

  return {
    getProjectLabelForThread,
    getThreadDisplayTitle,
    getSidebarThreadTitle,
  };
}
