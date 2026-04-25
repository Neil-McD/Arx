export type ShellCommandEffect =
  | "read_only"
  | "writes_workspace"
  | "mutates_external"
  | "network"
  | "destructive"
  | "long_running"
  | "unknown";

export type ShellCommandAuditSeverity = "low" | "medium" | "high";

export type ShellCommandPolicyClassification = {
  effect: ShellCommandEffect;
  parallelSafe: boolean;
  auditSeverity: ShellCommandAuditSeverity;
  parsedCommands: string[];
  reasons: string[];
};

type SimpleCommandClassification = {
  effect: ShellCommandEffect;
  reasons: string[];
};

const EFFECT_RANK: Record<ShellCommandEffect, number> = {
  read_only: 0,
  unknown: 1,
  long_running: 2,
  writes_workspace: 3,
  network: 4,
  mutates_external: 5,
  destructive: 6,
};

const READ_ONLY_EXECUTABLES = new Set([
  "cat",
  "cut",
  "echo",
  "false",
  "grep",
  "head",
  "ls",
  "nl",
  "paste",
  "pwd",
  "rg",
  "sed",
  "stat",
  "tail",
  "true",
  "uname",
  "uniq",
  "wc",
  "which",
  "whoami",
]);

const WRITE_EXECUTABLES = new Set([
  "chmod",
  "chown",
  "cp",
  "mkdir",
  "mv",
  "patch",
  "tee",
  "touch",
]);

const NETWORK_EXECUTABLES = new Set(["curl", "fetch", "wget"]);

const DESTRUCTIVE_EXECUTABLES = new Set(["rm", "rmdir", "shred"]);

const SCRIPT_EXECUTABLES = new Set(["bun", "deno", "node", "python", "python3", "ruby", "tsx"]);

const LONG_RUNNING_NPM_COMMANDS = new Set([
  "build",
  "check",
  "dev",
  "preview",
  "start",
  "test",
  "typecheck",
  "watch",
]);

function normalizeExecutable(raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  const basename = value.split(/[\\/]/).pop() ?? value;
  return basename.replace(/\.(exe|cmd|bat|com)$/i, "").toLowerCase();
}

function joinTokens(tokens: string[]): string {
  return tokens.join(" ");
}

function severityForEffect(effect: ShellCommandEffect): ShellCommandAuditSeverity {
  if (effect === "read_only") return "low";
  if (effect === "destructive" || effect === "mutates_external" || effect === "network") {
    return "high";
  }
  return "medium";
}

function pickDominantEffect(effects: ShellCommandEffect[]): ShellCommandEffect {
  return effects.reduce<ShellCommandEffect>((dominant, effect) =>
    EFFECT_RANK[effect] > EFFECT_RANK[dominant] ? effect : dominant,
  "read_only");
}

function hasShellWrapper(tokens: string[]): boolean {
  const executable = normalizeExecutable(tokens[0]);
  return (
    (executable === "bash" || executable === "zsh" || executable === "sh") &&
    (tokens[1] === "-lc" || tokens[1] === "-c") &&
    typeof tokens[2] === "string"
  );
}

function hasOutputRedirection(script: string): boolean {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < script.length; i += 1) {
    const char = script[i];
    const previous = script[i - 1];
    if (quote) {
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ">") return true;
  }
  return false;
}

function hasUnsupportedShellConstruct(script: string): boolean {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < script.length; i += 1) {
    const char = script[i];
    const previous = script[i - 1];
    const next = script[i + 1];
    if (quote) {
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "`" || char === "(" || char === ")" || char === "<") return true;
    if (char === "$" && (next === "(" || next === "{" || next === "[")) return true;
  }
  return false;
}

function tokenizeScript(script: string): { tokens: string[]; operators: string[] } | null {
  const tokens: string[] = [];
  const operators: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  const pushCurrent = () => {
    if (!current) return;
    tokens.push(current);
    current = "";
  };

  for (let i = 0; i < script.length; i += 1) {
    const char = script[i];
    const next = script[i + 1];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && typeof next === "string") {
        current += next;
        i += 1;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }
    if (char === "\\" && typeof next === "string") {
      current += next;
      i += 1;
      continue;
    }
    if (char === "&" && next === "&") {
      pushCurrent();
      operators.push("&&");
      i += 1;
      continue;
    }
    if (char === "|" && next === "|") {
      pushCurrent();
      operators.push("||");
      i += 1;
      continue;
    }
    if (char === "|" || char === ";") {
      pushCurrent();
      operators.push(char);
      continue;
    }
    if (char === "&") return null;
    current += char;
  }
  if (quote) return null;
  pushCurrent();
  return { tokens, operators };
}

function splitSimpleCommands(script: string): string[][] | null {
  const splitCommands: string[][] = [];
  let current: string[] = [];
  let quote: "'" | '"' | null = null;
  let currentToken = "";

  const emitToken = () => {
    if (!currentToken) return;
    current.push(currentToken);
    currentToken = "";
  };

  for (let i = 0; i < script.length; i += 1) {
    const char = script[i];
    const next = script[i + 1];
    if (quote) {
      if (char === quote) quote = null;
      else currentToken += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      emitToken();
      continue;
    }
    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      emitToken();
      if (current.length > 0) splitCommands.push(current);
      current = [];
      i += 1;
      continue;
    }
    if (char === "|" || char === ";") {
      emitToken();
      if (current.length > 0) splitCommands.push(current);
      current = [];
      continue;
    }
    if (char === "\\" && typeof next === "string") {
      currentToken += next;
      i += 1;
      continue;
    }
    currentToken += char;
  }
  emitToken();
  if (current.length > 0) splitCommands.push(current);
  return splitCommands.length > 0 ? splitCommands : null;
}

function argsContainOption(args: readonly string[], options: readonly string[]): boolean {
  return args.some((arg) => options.some((option) => arg === option || arg.startsWith(`${option}=`)));
}

function gitGlobalOptionRequiresConservativeClassification(arg: string): boolean {
  return (
    arg === "-c" ||
    arg.startsWith("-c") ||
    arg === "--config-env" ||
    arg.startsWith("--config-env=") ||
    arg === "--exec-path" ||
    arg.startsWith("--exec-path=") ||
    arg === "--git-dir" ||
    arg.startsWith("--git-dir=") ||
    arg === "--namespace" ||
    arg.startsWith("--namespace=") ||
    arg === "--super-prefix" ||
    arg.startsWith("--super-prefix=") ||
    arg === "--work-tree" ||
    arg.startsWith("--work-tree=")
  );
}

function findGitSubcommand(tokens: readonly string[]): { index: number; subcommand: string } | null {
  let skipNext = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const arg = tokens[index] ?? "";
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (gitGlobalOptionRequiresConservativeClassification(arg)) return null;
    if (arg === "-C") {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("-C") && arg.length > 2) continue;
    if (arg === "--") continue;
    if (arg.startsWith("-")) continue;
    return { index, subcommand: arg };
  }
  return null;
}

function classifyGitCommand(tokens: string[]): SimpleCommandClassification {
  const found = findGitSubcommand(tokens);
  if (!found) {
    return { effect: "unknown", reasons: ["git subcommand is missing or uses unsafe global options"] };
  }
  const subcommand = found.subcommand;
  const args = tokens.slice(found.index + 1);
  if (["status", "log", "diff", "show"].includes(subcommand)) {
    if (argsContainOption(args, ["--output"])) {
      return { effect: "writes_workspace", reasons: ["git output flag writes workspace"] };
    }
    return { effect: "read_only", reasons: [`git ${subcommand} is read-only`] };
  }
  if (subcommand === "branch" && args.every((arg) => arg === "--show-current" || arg === "-a" || arg === "-r" || arg === "-v" || arg === "-vv")) {
    return { effect: "read_only", reasons: ["git branch read-only flags"] };
  }
  if (["push", "pull", "fetch"].includes(subcommand)) {
    return { effect: "mutates_external", reasons: [`git ${subcommand} mutates or reads external remote state`] };
  }
  if (["add", "commit", "checkout", "clean", "merge", "rebase", "reset", "restore", "switch"].includes(subcommand)) {
    return { effect: "writes_workspace", reasons: [`git ${subcommand} mutates workspace state`] };
  }
  return { effect: "unknown", reasons: ["git subcommand is not classified as read-only"] };
}

function classifyPackageManagerCommand(tokens: string[]): SimpleCommandClassification {
  const executable = normalizeExecutable(tokens[0]);
  const command = tokens[1] === "run" ? tokens[2] : tokens[1];
  if (["install", "add", "remove", "update", "upgrade"].includes(String(command))) {
    return { effect: "network", reasons: [`${executable} ${command} can write dependencies and use network`] };
  }
  if (LONG_RUNNING_NPM_COMMANDS.has(String(command))) {
    return { effect: "long_running", reasons: [`${executable} ${command} can be long-running or resource intensive`] };
  }
  return { effect: "unknown", reasons: [`${executable} command is not classified as read-only`] };
}

function classifySimpleCommand(tokens: string[]): SimpleCommandClassification {
  const executable = normalizeExecutable(tokens[0]);
  const args = tokens.slice(1);
  if (!executable) return { effect: "unknown", reasons: ["empty command"] };
  if (DESTRUCTIVE_EXECUTABLES.has(executable)) {
    return { effect: "destructive", reasons: [`${executable} is destructive`] };
  }
  if (NETWORK_EXECUTABLES.has(executable)) {
    return { effect: "network", reasons: [`${executable} uses network`] };
  }
  if (WRITE_EXECUTABLES.has(executable)) {
    return { effect: "writes_workspace", reasons: [`${executable} writes workspace state`] };
  }
  if (["npm", "pnpm", "yarn"].includes(executable)) {
    return classifyPackageManagerCommand(tokens);
  }
  if (SCRIPT_EXECUTABLES.has(executable)) {
    return { effect: "unknown", reasons: [`${executable} script execution is not classified as read-only`] };
  }
  if (executable === "git") return classifyGitCommand(tokens);
  if (executable === "find") {
    if (args.some((arg) => ["-delete"].includes(arg))) {
      return { effect: "destructive", reasons: ["find -delete is destructive"] };
    }
    if (args.some((arg) => ["-exec", "-execdir", "-ok", "-okdir"].includes(arg))) {
      return { effect: "unknown", reasons: ["find can execute arbitrary commands"] };
    }
    if (args.some((arg) => ["-fls", "-fprint", "-fprint0", "-fprintf"].includes(arg))) {
      return { effect: "writes_workspace", reasons: ["find output option writes workspace state"] };
    }
    return { effect: "read_only", reasons: ["find invocation has no known mutating options"] };
  }
  if (executable === "sed") {
    if (args.some((arg) => arg === "-i" || arg.startsWith("-i"))) {
      return { effect: "writes_workspace", reasons: ["sed -i writes workspace state"] };
    }
    if (args[0] === "-n") return { effect: "read_only", reasons: ["sed -n is read-only"] };
    return { effect: "unknown", reasons: ["sed without -n is not classified as read-only"] };
  }
  if (executable === "rg") {
    if (args.some((arg) => arg === "--pre" || arg.startsWith("--pre=") || arg === "--hostname-bin" || arg.startsWith("--hostname-bin=") || arg === "-z" || arg === "--search-zip")) {
      return { effect: "unknown", reasons: ["rg option can execute external helpers or inspect archives"] };
    }
    return { effect: "read_only", reasons: ["rg invocation has no known mutating options"] };
  }
  if (executable === "fd") {
    if (args.some((arg) => arg === "-x" || arg === "--exec" || arg === "-X" || arg === "--exec-batch")) {
      return { effect: "unknown", reasons: ["fd option can execute arbitrary commands"] };
    }
    return { effect: "read_only", reasons: ["fd invocation has no known mutating options"] };
  }
  if (executable === "base64") {
    if (args.some((arg) => arg === "-o" || arg === "--output" || arg.startsWith("--output=") || (arg.startsWith("-o") && arg !== "-o"))) {
      return { effect: "writes_workspace", reasons: ["base64 output option writes workspace state"] };
    }
    return { effect: "read_only", reasons: ["base64 invocation has no known mutating options"] };
  }
  if (executable === "cd") {
    return { effect: "unknown", reasons: ["cd changes shell working directory; use explicit cwd instead"] };
  }
  if (READ_ONLY_EXECUTABLES.has(executable)) {
    return { effect: "read_only", reasons: [`${executable} is read-only`] };
  }
  return { effect: "unknown", reasons: [`${executable} is not in the shell policy allowlist`] };
}

export function classifyShellCommand(command: string | readonly string[]): ShellCommandPolicyClassification {
  const commandArray = Array.isArray(command) ? Array.from(command) : null;
  const rawCommand = commandArray ? joinTokens(commandArray) : String(command ?? "");
  const wrapperTokens = commandArray ?? tokenizeScript(rawCommand.trim())?.tokens ?? [];
  const script = hasShellWrapper(wrapperTokens) ? wrapperTokens[2] ?? "" : rawCommand.trim();
  if (!script) {
    return {
      effect: "unknown",
      parallelSafe: false,
      auditSeverity: "medium",
      parsedCommands: [],
      reasons: ["empty shell command"],
    };
  }
  if (hasOutputRedirection(script)) {
    return {
      effect: "writes_workspace",
      parallelSafe: false,
      auditSeverity: "medium",
      parsedCommands: [script],
      reasons: ["output redirection writes workspace state"],
    };
  }
  if (hasUnsupportedShellConstruct(script)) {
    return {
      effect: "unknown",
      parallelSafe: false,
      auditSeverity: "medium",
      parsedCommands: [script],
      reasons: ["shell construct is not classified as safe"],
    };
  }

  const commands = splitSimpleCommands(script);
  if (!commands || commands.length === 0) {
    return {
      effect: "unknown",
      parallelSafe: false,
      auditSeverity: "medium",
      parsedCommands: [script],
      reasons: ["could not parse shell command"],
    };
  }

  const classifications = commands.map(classifySimpleCommand);
  const effect = pickDominantEffect(classifications.map((classification) => classification.effect));
  const parsedCommands = commands.map(joinTokens);
  const reasons = Array.from(new Set(classifications.flatMap((classification) => classification.reasons)));
  return {
    effect,
    parallelSafe: effect === "read_only",
    auditSeverity: severityForEffect(effect),
    parsedCommands,
    reasons,
  };
}
