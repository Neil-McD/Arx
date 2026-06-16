import assert from "node:assert/strict";

import { resolveWorkspaceActiveProject } from "../shared/workspaceActiveProjectSelector.ts";

type Project = {
  id: string;
  name: string;
};

type Thread = {
  id: string;
  project_id: string | null;
};

const projects: Project[] = [
  { id: "general", name: "General" },
  { id: "test", name: "Test" },
];
const projectById = new Map(projects.map((project) => [project.id, project]));
const resolveThreadProjectId = (thread: Thread): string | null =>
  String(thread.project_id ?? "").trim() || null;

const activeThreadBeatsDraftSelection = resolveWorkspaceActiveProject({
  activeThread: { id: "thread_test", project_id: "test" },
  activeThreadId: "thread_test",
  workspaceWantsNewChat: false,
  resolvedActiveProjectId: "general",
  resolvedActiveProjectName: "General",
  projectById,
  resolveThreadProjectId,
});
assert.equal(activeThreadBeatsDraftSelection.currentProjectId, "test");
assert.equal(activeThreadBeatsDraftSelection.currentProjectName, "Test");
assert.equal(activeThreadBeatsDraftSelection.source, "active_thread");
assert.equal(activeThreadBeatsDraftSelection.isFromActiveThread, true);

const pendingThreadDoesNotFlashDefault = resolveWorkspaceActiveProject({
  activeThread: null,
  activeThreadId: "thread_test",
  workspaceWantsNewChat: false,
  resolvedActiveProjectId: "general",
  resolvedActiveProjectName: "General",
  projectById,
  resolveThreadProjectId,
});
assert.equal(pendingThreadDoesNotFlashDefault.currentProjectId, null);
assert.equal(pendingThreadDoesNotFlashDefault.currentProjectName, "");
assert.equal(pendingThreadDoesNotFlashDefault.source, "pending_thread");
assert.equal(pendingThreadDoesNotFlashDefault.isPendingThreadProject, true);

const draftSelectionFeedsRightPanel = resolveWorkspaceActiveProject({
  activeThread: { id: "thread_general", project_id: "general" },
  activeThreadId: "thread_general",
  workspaceWantsNewChat: true,
  resolvedActiveProjectId: "test",
  resolvedActiveProjectName: "Test",
  projectById,
  resolveThreadProjectId,
});
assert.equal(draftSelectionFeedsRightPanel.currentProjectId, "test");
assert.equal(draftSelectionFeedsRightPanel.currentProjectName, "Test");
assert.equal(draftSelectionFeedsRightPanel.source, "draft_selection");
assert.equal(draftSelectionFeedsRightPanel.isFromActiveThread, false);

const upstreamDefaultSelectionFeedsDraft = resolveWorkspaceActiveProject({
  activeThread: null,
  activeThreadId: null,
  workspaceWantsNewChat: true,
  resolvedActiveProjectId: "general",
  resolvedActiveProjectName: "General",
  projectById,
  resolveThreadProjectId,
});
assert.equal(upstreamDefaultSelectionFeedsDraft.currentProjectId, "general");
assert.equal(upstreamDefaultSelectionFeedsDraft.currentProjectName, "General");
assert.equal(upstreamDefaultSelectionFeedsDraft.source, "draft_selection");

const missingActiveThreadProjectDoesNotBecomeDefault = resolveWorkspaceActiveProject({
  activeThread: { id: "thread_missing", project_id: "deleted_project" },
  activeThreadId: "thread_missing",
  workspaceWantsNewChat: false,
  resolvedActiveProjectId: "general",
  resolvedActiveProjectName: "General",
  projectById,
  resolveThreadProjectId,
});
assert.equal(missingActiveThreadProjectDoesNotBecomeDefault.currentProjectId, "deleted_project");
assert.equal(missingActiveThreadProjectDoesNotBecomeDefault.currentProject, null);
assert.equal(missingActiveThreadProjectDoesNotBecomeDefault.currentProjectName, "Loading project");
assert.equal(missingActiveThreadProjectDoesNotBecomeDefault.source, "active_thread");

const threadWithoutExplicitProjectStaysStandalone = resolveWorkspaceActiveProject({
  activeThread: { id: "thread_legacy", project_id: null },
  activeThreadId: "thread_legacy",
  workspaceWantsNewChat: false,
  resolvedActiveProjectId: "test",
  resolvedActiveProjectName: "Test",
  projectById,
  resolveThreadProjectId,
});
assert.equal(threadWithoutExplicitProjectStaysStandalone.currentProjectId, null);
assert.equal(threadWithoutExplicitProjectStaysStandalone.currentProjectName, "");
assert.equal(threadWithoutExplicitProjectStaysStandalone.source, "none");

const noWorkspaceSelectionStaysEmpty = resolveWorkspaceActiveProject({
  activeThread: null,
  activeThreadId: null,
  workspaceWantsNewChat: true,
  resolvedActiveProjectId: null,
  resolvedActiveProjectName: "",
  projectById,
  resolveThreadProjectId,
});
assert.equal(noWorkspaceSelectionStaysEmpty.currentProjectId, null);
assert.equal(noWorkspaceSelectionStaysEmpty.currentProjectName, "");
assert.equal(noWorkspaceSelectionStaysEmpty.source, "none");

console.log("workspace_active_project_coherence_proof: ok");
