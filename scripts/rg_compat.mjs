#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

const options = {
  caseInsensitive: false,
  fixedStrings: false,
  filesWithMatches: false,
  invert: false,
  lineNumbers: false,
  maxPerFile: Number.POSITIVE_INFINITY,
  multiline: false,
  smartCase: false,
  globs: [],
  pattern: null,
  targets: [],
};

function takeNext(index, optionName) {
  if (index + 1 >= args.length) {
    console.error(`rg_compat: missing value for ${optionName}`);
    process.exit(2);
  }
  return args[index + 1];
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--") {
    for (let j = i + 1; j < args.length; j += 1) {
      if (options.pattern === null) options.pattern = args[j];
      else options.targets.push(args[j]);
    }
    break;
  }
  if (arg === "-n") {
    options.lineNumbers = true;
    continue;
  }
  if (arg === "-l" || arg === "--files-with-matches") {
    options.filesWithMatches = true;
    continue;
  }
  if (arg === "-i") {
    options.caseInsensitive = true;
    continue;
  }
  if (arg === "-S" || arg === "--smart-case") {
    options.smartCase = true;
    continue;
  }
  if (arg === "--hidden" || arg === "--no-heading" || arg === "--pcre2") {
    continue;
  }
  if (arg === "-U" || arg === "--multiline") {
    options.multiline = true;
    continue;
  }
  if (arg === "--fixed-strings" || arg === "-F") {
    options.fixedStrings = true;
    continue;
  }
  if (arg === "-v" || arg === "--invert-match") {
    options.invert = true;
    continue;
  }
  if (arg === "--glob" || arg === "-g") {
    options.globs.push(takeNext(i, arg));
    i += 1;
    continue;
  }
  if (arg === "-m" || arg === "--max-count") {
    options.maxPerFile = Number(takeNext(i, arg));
    i += 1;
    continue;
  }
  if (arg.startsWith("-m") && /^-m\d+$/.test(arg)) {
    options.maxPerFile = Number(arg.slice(2));
    continue;
  }
  if (arg.startsWith("-")) {
    continue;
  }
  if (options.pattern === null) options.pattern = arg;
  else options.targets.push(arg);
}

if (options.pattern === null) {
  console.error("rg_compat: missing pattern");
  process.exit(2);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePattern(pattern) {
  if (options.fixedStrings) return escapeRegex(pattern);
  return pattern
    .replace(/\[\[:space:\]\]/g, "\\s")
    .replace(/\[\[:digit:\]\]/g, "\\d")
    .replace(/\[\[:alnum:\]\]/g, "[A-Za-z0-9]")
    .replace(/\[\[:alpha:\]\]/g, "[A-Za-z]");
}

function makeRegex(pattern) {
  const normalizedPattern = normalizePattern(pattern);
  const shouldIgnoreCase = options.smartCase ? !/[A-Z]/.test(pattern) : options.caseInsensitive;
  const flags = `${shouldIgnoreCase ? "i" : ""}${options.multiline ? "ms" : "m"}`;
  try {
    return new RegExp(normalizedPattern, flags);
  } catch (error) {
    console.error(`rg_compat: invalid regex: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const regex = makeRegex(options.pattern);

function globToRegex(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        source += ".*";
        i += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if (char === "{") {
      const end = glob.indexOf("}", i + 1);
      if (end !== -1) {
        const choices = glob
          .slice(i + 1, end)
          .split(",")
          .map((part) => escapeRegex(part))
          .join("|");
        source += `(?:${choices})`;
        i = end;
        continue;
      }
    }
    source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
}

const includeGlobs = [];
const excludeGlobs = [];
for (const rawGlob of options.globs) {
  const exclude = rawGlob.startsWith("!");
  const glob = exclude ? rawGlob.slice(1) : rawGlob;
  const entry = {
    raw: glob,
    regex: globToRegex(glob),
    basenameRegex: glob.includes("/") ? null : globToRegex(glob),
  };
  if (exclude) excludeGlobs.push(entry);
  else includeGlobs.push(entry);
}

function toRelativePosix(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function matchesGlobEntry(entry, relPath) {
  if (entry.regex.test(relPath)) return true;
  if (entry.basenameRegex && entry.basenameRegex.test(path.posix.basename(relPath))) return true;
  if (entry.raw.endsWith("/**")) {
    const prefix = entry.raw.slice(0, -3);
    return relPath === prefix || relPath.startsWith(`${prefix}/`);
  }
  return false;
}

function isExcluded(relPath) {
  return excludeGlobs.some((entry) => matchesGlobEntry(entry, relPath));
}

function isIncluded(relPath) {
  if (includeGlobs.length === 0) return true;
  return includeGlobs.some((entry) => matchesGlobEntry(entry, relPath));
}

let searchError = false;

const defaultSkippedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

function listFiles(target) {
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) {
    console.error(`rg: ${target}: No such file or directory`);
    searchError = true;
    return [];
  }
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    const relPath = toRelativePosix(absolute);
    return isExcluded(relPath) || !isIncluded(relPath) ? [] : [absolute];
  }
  if (!stat.isDirectory()) return [];

  const files = [];
  const stack = [absolute];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relPath = toRelativePosix(entryPath);
      if (isExcluded(relPath)) continue;
      if (entry.isDirectory()) {
        if (defaultSkippedDirectories.has(entry.name)) continue;
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && isIncluded(relPath)) files.push(entryPath);
    }
  }
  return files;
}

function readUtf8(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

let printed = false;

function printMatch(prefix, lineNumber, line) {
  printed = true;
  const number = options.lineNumbers ? `${lineNumber}:` : "";
  if (prefix) console.log(`${prefix}:${number}${line}`);
  else console.log(`${number}${line}`);
}

function searchText(text, prefix = "") {
  let fileMatches = 0;
  if (options.multiline && !options.invert) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (!match) return;
    const start = match.index;
    const lineNumber = text.slice(0, start).split("\n").length;
    const line = text.split(/\r?\n/)[lineNumber - 1] ?? "";
    printMatch(prefix, lineNumber, line);
    return;
  }

  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "" && /\r?\n$/.test(text)) {
    lines.pop();
  }
  for (let index = 0; index < lines.length; index += 1) {
    regex.lastIndex = 0;
    const matched = regex.test(lines[index]);
    if (options.invert ? matched : !matched) continue;
    printMatch(prefix, index + 1, lines[index]);
    fileMatches += 1;
    if (fileMatches >= options.maxPerFile) break;
  }
}

function textHasMatch(text) {
  if (options.multiline && !options.invert) {
    regex.lastIndex = 0;
    return regex.test(text);
  }

  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "" && /\r?\n$/.test(text)) {
    lines.pop();
  }
  return lines.some((line) => {
    regex.lastIndex = 0;
    const matched = regex.test(line);
    return options.invert ? !matched : matched;
  });
}

function searchFiles() {
  const targets = options.targets.length > 0 ? options.targets : ["."];
  const files = targets.flatMap((target) => listFiles(target));
  const singleExplicitFile =
    options.targets.length === 1 &&
    fs.existsSync(path.resolve(options.targets[0])) &&
    fs.statSync(path.resolve(options.targets[0])).isFile();
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readUtf8(file);
    if (text === null) continue;
    if (options.filesWithMatches) {
      if (textHasMatch(text)) {
        printed = true;
        console.log(toRelativePosix(file));
      }
      continue;
    }
    searchText(text, singleExplicitFile ? "" : toRelativePosix(file));
  }
}

function readStdin() {
  try {
    const stat = fs.fstatSync(0);
    if (stat.isFIFO() || stat.isFile()) {
      return fs.readFileSync(0, "utf8");
    }
  } catch {
    return null;
  }
  return null;
}

if (options.targets.length === 0) {
  const stdin = readStdin();
  if (stdin !== null) searchText(stdin);
  else searchFiles();
} else {
  searchFiles();
}

if (searchError) process.exit(2);
process.exit(printed ? 0 : 1);
