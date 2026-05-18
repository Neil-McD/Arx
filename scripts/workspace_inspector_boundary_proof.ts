import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const inspector = read("convex/workspaceInspector.ts");

assert.match(
  inspector,
  /import \{ DAYTONA_WORKSPACE_ROOT \} from "\.\/daytonaSandboxClient"/,
  "workspace inspector must use the canonical Daytona workspace root",
);
assert.match(
  inspector,
  /function normalizeInspectorPath\(raw: unknown\):[\s\S]*WorkspaceInspectorFailure[\s\S]*normalizeWorkspacePath\(candidate \|\| "\."\)/,
  "workspace inspector must normalize user paths into a fail-closed result",
);
assert.match(
  inspector,
  /type WorkspaceInspectorResolvedPath[\s\S]*rootPath: string[\s\S]*resolvedPath: string/,
  "workspace inspector must model the canonical root path and resolved target path",
);
assert.match(
  inspector,
  /async function inspectWorkspacePathBoundary[\s\S]*root_input=\$\{shellQuote\(DAYTONA_WORKSPACE_ROOT\)\}[\s\S]*root="\$\(realpath -- "\$root_input"/,
  "workspace inspector must resolve DAYTONA_WORKSPACE_ROOT before comparing target paths",
);
assert.match(
  inspector,
  /if \[ -L "\$abs" \]; then printf symlink; exit 0; fi;/,
  "workspace inspector must reject symlink components before listing or previewing",
);
assert.match(
  inspector,
  /resolved="\$\(realpath -- "\$abs"[\s\S]*readlink -f -- "\$abs"/,
  "workspace inspector must resolve the target runtime path before trusting it",
);
assert.match(
  inspector,
  /case "\$resolved" in "\$root"\|"\$root"\/\*\) ;; \*\) printf outside; exit 0;; esac;/,
  "workspace inspector must fail closed when the resolved path escapes the workspace root",
);
assert.match(
  inspector,
  /path: \{[\s\S]*rootPath,[\s\S]*resolvedPath,[\s\S]*\}/,
  "workspace inspector boundary must return the canonical root and resolved target path",
);
assert.match(
  inspector,
  /function buildGuardedResolvedPathPrelude[\s\S]*safe_path=\$\{shellQuote\(path\.resolvedPath\)\}[\s\S]*resolved_again="\$\(realpath -- "\$safe_path"[\s\S]*if \[ "\$resolved_again" != "\$safe_path" \]/,
  "workspace inspector read commands must revalidate the resolved path immediately before reading",
);
assert.match(
  inspector,
  /code: "workspace_symlink_not_supported"/,
  "workspace inspector must surface symlink paths as unsupported instead of reading through them",
);
assert.match(
  inspector,
  /const boundaryResult = await inspectWorkspacePathBoundary\(\{ session: session\.session, relPath \}\);[\s\S]*const boundary = boundaryResult\.path;[\s\S]*if \(boundary\.kind !== "directory"\)[\s\S]*buildGuardedResolvedPathPrelude\(boundary\)/,
  "directory listing must pass through the runtime boundary guard and require a directory",
);
assert.match(
  inspector,
  /const boundaryResult = await inspectWorkspacePathBoundary\(\{ session: session\.session, relPath \}\);[\s\S]*const boundary = boundaryResult\.path;[\s\S]*if \(boundary\.kind === "missing"\)[\s\S]*if \(boundary\.kind === "directory"\)[\s\S]*if \(boundary\.kind !== "file"\)[\s\S]*readWorkspacePathSize\(\{ session: session\.session, path: boundary \}\)/,
  "file preview must use the runtime boundary guard for missing, directory, file, and other path kinds",
);
assert.match(
  inspector,
  /base64 -w 0 \\"?\$safe_path[\s\S]*head -c \$\{TEXT_PREVIEW_MAX_BYTES\} "\$safe_path"/,
  "file preview content reads must use the guarded resolved path",
);
assert.doesNotMatch(
  inspector,
  /readDaytonaWorkspaceFile/,
  "workspace inspector must not list directories through the older relative-path file reader",
);
assert.doesNotMatch(
  inspector,
  /readWorkspacePathKind/,
  "workspace inspector must not keep the old unguarded kind probe",
);

console.log("workspace_inspector_boundary_proof: ok");
