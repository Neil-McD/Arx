import assert from "node:assert/strict";

import {
  classifyShellCommand,
  type ShellCommandEffect,
} from "../shared/shellCommandPolicy.ts";

function assertClassification(
  command: string | readonly string[],
  expected: {
    effect: ShellCommandEffect;
    parallelSafe: boolean;
    parsedCommands?: string[];
  },
) {
  const actual = classifyShellCommand(command);
  assert.equal(actual.effect, expected.effect, `${String(command)} effect`);
  assert.equal(actual.parallelSafe, expected.parallelSafe, `${String(command)} parallelSafe`);
  if (expected.parsedCommands) {
    assert.deepEqual(actual.parsedCommands, expected.parsedCommands, `${String(command)} parsedCommands`);
  }
}

function proveReadOnlyDiscoveryCommands() {
  assertClassification('bash -lc "rg communityId convex"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["rg communityId convex"],
  });
  assertClassification(["bash", "-lc", "git status && pwd"], {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["git status", "pwd"],
  });
  assertClassification('bash -lc "git -C . status"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["git -C . status"],
  });
  assertClassification('bash -lc "find . -name \'*.ts\'"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["find . -name *.ts"],
  });
  assertClassification('bash -lc "sed -n \'1,20p\' file.ts"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["sed -n 1,20p file.ts"],
  });
  assertClassification('bash -lc "ls | wc -l"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["ls", "wc -l"],
  });
  assertClassification('bash -lc "base64 file.txt"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["base64 file.txt"],
  });
  assertClassification('bash -lc "fd communityId convex"', {
    effect: "read_only",
    parallelSafe: true,
    parsedCommands: ["fd communityId convex"],
  });
  console.log("PASS: read-only shell discovery commands are parallel-safe");
}

function proveWorkspaceMutationCommands() {
  assertClassification('bash -lc "sed -i \'s/a/b/\' file.ts"', {
    effect: "writes_workspace",
    parallelSafe: false,
  });
  assertClassification('bash -lc "rg foo > out.txt"', {
    effect: "writes_workspace",
    parallelSafe: false,
  });
  assertClassification('bash -lc "git add convex/threads.ts"', {
    effect: "writes_workspace",
    parallelSafe: false,
  });
  assertClassification('bash -lc "base64 -o out.txt file"', {
    effect: "writes_workspace",
    parallelSafe: false,
  });
  assertClassification('bash -lc "base64 --output=out.txt file"', {
    effect: "writes_workspace",
    parallelSafe: false,
  });
  console.log("PASS: workspace-mutating shell commands are serial");
}

function proveDangerousAndUnknownCommands() {
  assertClassification('bash -lc "find . -name \'*.ts\' -delete"', {
    effect: "destructive",
    parallelSafe: false,
  });
  assertClassification('bash -lc "rm -rf ."', {
    effect: "destructive",
    parallelSafe: false,
  });
  assertClassification('bash -lc "npm test"', {
    effect: "long_running",
    parallelSafe: false,
  });
  assertClassification('bash -lc "node scripts/foo.js"', {
    effect: "unknown",
    parallelSafe: false,
  });
  assertClassification('bash -lc "git --git-dir=.evil-git diff HEAD"', {
    effect: "unknown",
    parallelSafe: false,
  });
  assertClassification('bash -lc "fd foo -x rm {}"', {
    effect: "unknown",
    parallelSafe: false,
  });
  assertClassification('bash -lc "fd foo --exec rm {}"', {
    effect: "unknown",
    parallelSafe: false,
  });
  assertClassification('bash -lc "fd foo -X rm"', {
    effect: "unknown",
    parallelSafe: false,
  });
  assertClassification('bash -lc "cd / && cat etc/passwd"', {
    effect: "unknown",
    parallelSafe: false,
  });
  assertClassification('bash -lc "echo $(pwd)"', {
    effect: "unknown",
    parallelSafe: false,
  });
  console.log("PASS: destructive, long-running, and unknown shell commands are serial");
}

function proveNetworkAndExternalMutationCommands() {
  assertClassification('bash -lc "curl https://example.com"', {
    effect: "network",
    parallelSafe: false,
  });
  assertClassification('bash -lc "git push origin main"', {
    effect: "mutates_external",
    parallelSafe: false,
  });
  console.log("PASS: network and external mutation shell commands are classified");
}

proveReadOnlyDiscoveryCommands();
proveWorkspaceMutationCommands();
proveDangerousAndUnknownCommands();
proveNetworkAndExternalMutationCommands();

console.log("shell_command_policy_proof: ok");
