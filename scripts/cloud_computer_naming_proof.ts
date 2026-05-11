import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildNextDefaultComputerName,
  formatDefaultComputerName,
  normalizeComputerDisplayName,
  readDefaultComputerNameIndex,
} from "../shared/projectNaming.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

assert.equal(formatDefaultComputerName(1), "Computer 1");
assert.equal(formatDefaultComputerName(5), "Computer 5");
assert.equal(readDefaultComputerNameIndex("Project 1"), 1);
assert.equal(readDefaultComputerNameIndex("Computer 2"), 2);
assert.equal(readDefaultComputerNameIndex("Launch computer"), null);
assert.equal(normalizeComputerDisplayName("Project 1"), "Computer 1");
assert.equal(normalizeComputerDisplayName("Computer 3"), "Computer 3");
assert.equal(normalizeComputerDisplayName("workspace"), "Computer 1");
assert.equal(normalizeComputerDisplayName("Launch"), "Launch");
assert.equal(buildNextDefaultComputerName(["Project 1", "Computer 2", "Launch"]), "Computer 3");
assert.equal(buildNextDefaultComputerName(["Computer 1", "Project 2", "Computer 4"]), "Computer 3");

const daytonaProjectsGateway = read("shared/daytonaCloudProjects.ts");
const convexProjects = read("convex/projects.ts");
const convexThreads = read("convex/threads.ts");
const workspaceSession = read("convex/daytonaWorkspaceSession.ts");
const sidebar = read("apps/web/src/components/WebThreadSidebarPanel.tsx");
const createModal = read("apps/web/src/components/WebCreateProjectModal.tsx");
const deleteModal = read("apps/web/src/components/WebDeleteProjectModal.tsx");
const modalHost = read("apps/web/src/components/WebProjectModalHost.tsx");
const projectUiController = read("apps/web/src/controllers/useWebProjectUiController.ts");
const errorMappings = read("shared/appErrorMappings.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const toolRegistry = read("shared/toolRegistry.ts");
const workspaceProjectState = read("apps/web/src/controllers/useWebWorkspaceProjectStateController.ts");
const workspaceTerminalBackgroundService = read("convex/workspaceTerminalBackgroundService.ts");
const httpDaytona = read("convex/httpDaytona.ts");
const runtimeExecutionSession = read("convex/runtimeExecutionSession.ts");

assert.match(daytonaProjectsGateway, /normalizeComputerDisplayName/, "gateway must normalize legacy project names for display");
assert.doesNotMatch(daytonaProjectsGateway, /Project 1/, "gateway must not expose legacy Project 1 fallback");
assert.match(convexProjects, /formatDefaultComputerName\(1\)/, "default project rows should be named as computers");
assert.match(convexThreads, /formatDefaultComputerName\(1\)/, "thread fallback default rows should be named as computers");
assert.match(workspaceSession, /normalizeComputerDisplayName/, "runtime project labels should be normalized as computers");

const visibleCopy = [
  sidebar,
  createModal,
  deleteModal,
  modalHost,
  projectUiController,
  errorMappings,
].join("\n");
const runtimeAndToolCopy = [
  runtimePrompt,
  toolRegistry,
  workspaceProjectState,
  workspaceTerminalBackgroundService,
  httpDaytona,
  runtimeExecutionSession,
].join("\n");

assert.doesNotMatch(sidebar, />Projects</, "sidebar toolbar should not say Projects");
assert.doesNotMatch(errorMappings, /Projects are capped/, "quota error should not say Projects");

for (const legacyPhrase of [
  "Project 1",
  "New project",
  "Create project",
  "Edit project",
  "Delete project",
  "Project name",
  "Project description",
  "Project imports",
  "project container",
  "project folder",
  "Project options",
  "Pick a project",
  "this project",
  "project details",
]) {
  assert.doesNotMatch(visibleCopy, new RegExp(legacyPhrase), `visible project copy should not include "${legacyPhrase}"`);
}

for (const computerPhrase of [
  "Computers",
  "New computer",
  "Create computer",
  "Edit computer",
  "Delete computer",
  "Computer name",
  "Computer description",
  "Computer imports",
  "Computer options",
  "Pick a computer",
  "this computer",
  "computer details",
]) {
  assert.match(visibleCopy, new RegExp(computerPhrase), `visible computer copy should include "${computerPhrase}"`);
}

for (const legacyPhrase of [
  "Active project",
  "Project description",
  "Project root",
  "active project file tools",
  "project-bound workspace path",
  "bound project workspace",
  "Couldn't load your projects",
  "Project not found.",
  "this project",
  "No active project background sandbox",
]) {
  assert.doesNotMatch(
    runtimeAndToolCopy,
    new RegExp(legacyPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `runtime/tool copy should not include "${legacyPhrase}"`,
  );
}

for (const computerPhrase of [
  "Active computer",
  "Computer description",
  "Computer workspace root",
  "active computer workspace file tools",
  "computer workspace path",
  "bound computer workspace",
  "Couldn't load your computers",
  "Computer not found.",
  "this computer",
  "No active computer background sandbox",
]) {
  assert.match(
    runtimeAndToolCopy,
    new RegExp(computerPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `runtime/tool copy should include "${computerPhrase}"`,
  );
}

console.log("cloud_computer_naming_proof: ok");
