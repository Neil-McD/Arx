import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const [rootArg, outputArg] = process.argv.slice(2);
if (!rootArg || !outputArg) {
  throw new Error("usage: node generate-inventory.mjs <repo-root> <output-json>");
}

const root = path.resolve(rootArg);
const outputPath = path.resolve(outputArg);
const requireFromRepo = createRequire(path.join(root, "package.json"));
const ts = requireFromRepo("typescript");

const runGit = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const trackedFiles = runGit("ls-files")
  .split("\n")
  .map((value) => value.trim())
  .filter(Boolean)
  .sort();

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const textExtensions = new Set([
  ...sourceExtensions,
  ".md",
  ".json",
  ".mjs",
  ".cjs",
  ".sh",
  ".toml",
  ".yaml",
  ".yml",
  ".txt",
  ".html",
]);
const sourceRoots = ["convex/", "shared/", "apps/web/src/", "api/", "services/"];

const readText = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const lineNumber = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
const propertyName = (node) => {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return node.getText();
};
const literalValue = (node) => {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return node.getText();
};

const fileRecords = [];
const sourceFileRecords = [];
const topLevelCounts = new Map();
const extensionCounts = new Map();

for (const relativePath of trackedFiles) {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.statSync(absolutePath);
  const extension = path.extname(relativePath) || "[none]";
  const topLevel = relativePath.split("/")[0];
  const isText = textExtensions.has(extension);
  const lines = isText ? readText(relativePath).split("\n").length : null;
  const record = { path: relativePath, topLevel, extension, bytes: stat.size, lines };
  fileRecords.push(record);
  topLevelCounts.set(topLevel, (topLevelCounts.get(topLevel) ?? 0) + 1);
  extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  if (sourceRoots.some((prefix) => relativePath.startsWith(prefix)) && sourceExtensions.has(extension)) {
    sourceFileRecords.push(record);
  }
}

const parseTs = (relativePath) => {
  const sourceText = readText(relativePath);
  return ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
};

const schemaTables = [];
const schemaPath = "convex/schema.ts";
const schemaSource = parseTs(schemaPath);
const schemaText = readText(schemaPath);

const collectObjectKeys = (objectLiteral) =>
  objectLiteral.properties
    .filter((property) => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
    .map((property) => propertyName(property.name))
    .filter(Boolean);

const findDefineTableCall = (expression) => {
  if (!expression) return null;
  if (ts.isParenthesizedExpression(expression)) return findDefineTableCall(expression.expression);
  if (!ts.isCallExpression(expression)) return null;
  if (expression.expression.getText(schemaSource) === "defineTable") return expression;
  if (ts.isPropertyAccessExpression(expression.expression)) {
    return findDefineTableCall(expression.expression.expression);
  }
  return null;
};

const visitSchema = (node) => {
  if (ts.isPropertyAssignment(node)) {
    const defineTableCall = findDefineTableCall(node.initializer);
    if (!defineTableCall) {
      ts.forEachChild(node, visitSchema);
      return;
    }
    const tableName = propertyName(node.name);
    const fieldsArgument = defineTableCall.arguments[0];
    const fields = ts.isObjectLiteralExpression(fieldsArgument)
      ? collectObjectKeys(fieldsArgument)
      : [];
    const indexes = [];
    const nodeText = node.getText(schemaSource);
    const indexPattern = /\.(index|searchIndex)\(\s*["']([^"']+)["']/g;
    for (const match of nodeText.matchAll(indexPattern)) {
      indexes.push({ kind: match[1], name: match[2] });
    }
    schemaTables.push({
      name: tableName,
      line: lineNumber(schemaSource, node),
      fields,
      indexes,
    });
    return;
  }
  ts.forEachChild(node, visitSchema);
};
visitSchema(schemaSource);

const exportedConvexFunctions = [];
const exportedConvexAliases = [];
const convexTsFiles = trackedFiles.filter(
  (relativePath) =>
    relativePath.startsWith("convex/") &&
    relativePath.endsWith(".ts") &&
    !relativePath.startsWith("convex/_generated/"),
);
const convexFunctionCalleePattern = /(?:query|mutation|action|httpAction)$/i;

for (const relativePath of convexTsFiles) {
  const sourceFile = parseTs(relativePath);
  const importedSymbols = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      importedSymbols.set(element.name.text, {
        sourceModule: statement.moduleSpecifier.text,
        sourceName: element.propertyName?.text ?? element.name.text,
      });
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (!isExported) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        let initializer = declaration.initializer;
        while (ts.isParenthesizedExpression(initializer) || ts.isAsExpression(initializer)) initializer = initializer.expression;
        if (ts.isCallExpression(initializer)) {
          const callee = initializer.expression.getText(sourceFile);
          const calleeLeaf = callee.split(".").at(-1) ?? callee;
          if (!convexFunctionCalleePattern.test(calleeLeaf)) continue;
          exportedConvexFunctions.push({
            file: relativePath,
            name: declaration.name.text,
            line: lineNumber(sourceFile, declaration),
            constructor: callee,
            visibility: /^internal/i.test(calleeLeaf) ? "internal" : "public_or_wrapped",
          });
          continue;
        }
        if (ts.isIdentifier(initializer) && importedSymbols.has(initializer.text)) {
          const imported = importedSymbols.get(initializer.text);
          exportedConvexAliases.push({
            file: relativePath,
            name: declaration.name.text,
            line: lineNumber(sourceFile, declaration),
            sourceModule: imported.sourceModule,
            sourceName: imported.sourceName,
            kind: "imported_registered_function_candidate",
          });
        }
      }
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        exportedConvexAliases.push({
          file: relativePath,
          name: element.name.text,
          line: lineNumber(sourceFile, element),
          sourceModule: statement.moduleSpecifier.text,
          sourceName: element.propertyName?.text ?? element.name.text,
          kind: "reexported_registered_function_candidate",
        });
      }
    }
  }
}

function resolveConvexModulePath(fromFile, sourceModule) {
  if (!sourceModule.startsWith(".")) return null;
  const resolved = path.normalize(path.join(path.dirname(fromFile), sourceModule));
  return resolved.endsWith(".ts") ? resolved : `${resolved}.ts`;
}

const directConvexFunctionKeys = new Set(
  exportedConvexFunctions.map((fn) => `${fn.file}:${fn.name}`),
);
const convexAliasByKey = new Map(
  exportedConvexAliases.map((alias) => [`${alias.file}:${alias.name}`, alias]),
);

function resolveConvexAlias(alias, visited = new Set()) {
  const sourceFile = resolveConvexModulePath(alias.file, alias.sourceModule);
  if (!sourceFile) return null;
  const sourceKey = `${sourceFile}:${alias.sourceName}`;
  if (visited.has(sourceKey)) return null;
  if (directConvexFunctionKeys.has(sourceKey)) return sourceKey;
  const next = convexAliasByKey.get(sourceKey);
  if (!next) return null;
  visited.add(sourceKey);
  return resolveConvexAlias(next, visited);
}

const resolvedConvexAliases = exportedConvexAliases.map((alias) => {
  const directTarget = resolveConvexAlias(alias);
  return {
    ...alias,
    resolvesToRegisteredFunction: Boolean(directTarget),
    directTarget,
  };
});

const convexHttpRoutes = [];
for (const httpPath of convexTsFiles) {
  const sourceText = readText(httpPath);
  if (!sourceText.includes(".route(")) continue;
  const sourceFile = parseTs(httpPath);
  const visitHttp = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "route"
    ) {
      const config = node.arguments[0];
      if (ts.isObjectLiteralExpression(config)) {
        const values = Object.fromEntries(
          config.properties
            .filter(ts.isPropertyAssignment)
            .map((property) => [propertyName(property.name), literalValue(property.initializer)]),
        );
        convexHttpRoutes.push({
          file: httpPath,
          line: lineNumber(sourceFile, node),
          path: values.path ?? values.pathPrefix ?? null,
          method: values.method ?? null,
          handler: values.handler ?? null,
        });
      }
    }
    ts.forEachChild(node, visitHttp);
  };
  visitHttp(sourceFile);
}

const apiRouteFiles = trackedFiles
  .filter((relativePath) => relativePath.startsWith("api/") && /\.(ts|js)$/.test(relativePath))
  .map((relativePath) => ({
    file: relativePath,
    route: `/${relativePath.replace(/\.(ts|js)$/, "").replace(/\/index$/, "")}`,
  }));

const scheduledJobs = [];
const cronsPath = "convex/crons.ts";
if (trackedFiles.includes(cronsPath)) {
  const sourceFile = parseTs(cronsPath);
  const scheduleMethods = new Set(["interval", "hourly", "daily", "weekly", "monthly", "cron"]);
  const visitCrons = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      scheduleMethods.has(node.expression.name.text)
    ) {
      scheduledJobs.push({
        line: lineNumber(sourceFile, node),
        schedule: node.expression.name.text,
        name: literalValue(node.arguments[0]),
        cadence: literalValue(node.arguments[1]),
        function: literalValue(node.arguments[2]),
      });
    }
    ts.forEachChild(node, visitCrons);
  };
  visitCrons(sourceFile);
}

const environmentVariables = new Map();
const environmentPatterns = [
  /(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)/g,
  /(?:process|import\.meta)\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g,
  /Deno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /\breadEnv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /\breadEnv\(\s*["'][A-Z][A-Z0-9_]*["']\s*,\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /\benv\.([A-Z][A-Z0-9_]*)/g,
];

for (const record of sourceFileRecords) {
  const sourceText = readText(record.path);
  for (const pattern of environmentPatterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const name = match[1];
      if (!environmentVariables.has(name)) environmentVariables.set(name, new Set());
      environmentVariables.get(name).add(record.path);
    }
  }
}

const environmentTemplateFiles = trackedFiles.filter((relativePath) =>
  /(^|\/)\.env(?:\.[^/]+)?\.example$|(^|\/)\.env\.example$/.test(relativePath),
);
for (const relativePath of environmentTemplateFiles) {
  for (const line of readText(relativePath).split("\n")) {
    const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match) continue;
    const name = match[1];
    if (!environmentVariables.has(name)) environmentVariables.set(name, new Set());
    environmentVariables.get(name).add(relativePath);
  }
}

const importBoundaryCounts = new Map();
for (const record of sourceFileRecords.filter((record) => /\.(ts|tsx)$/.test(record.path))) {
  const sourceFile = parseTs(record.path);
  const fromBoundary = record.path.split("/")[0];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const resolved = path.normalize(path.join(path.dirname(record.path), specifier));
    const toBoundary = resolved.split(path.sep)[0];
    const edge = `${fromBoundary}->${toBoundary}`;
    importBoundaryCounts.set(edge, (importBoundaryCounts.get(edge) ?? 0) + 1);
  }
}

const frontendRouteLiterals = new Set();
const routePattern = /["'`]\/(?!\/)([A-Za-z0-9_@:[\].~!$&()*+,;=%?/#-]{1,159})["'`]/g;
for (const record of sourceFileRecords.filter((record) => record.path.startsWith("apps/web/src/"))) {
  const sourceText = readText(record.path);
  for (const match of sourceText.matchAll(routePattern)) {
    const candidate = `/${match[1]}`;
    if (!candidate.startsWith("/assets/") && !candidate.startsWith("/images/")) {
      frontendRouteLiterals.add(candidate);
    }
  }
}

const documentation = [];
for (const relativePath of trackedFiles.filter((value) => value.endsWith(".md"))) {
  const lines = readText(relativePath).split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() ?? null;
  const statusLine = lines.slice(0, 40).find((line) => /^(Status:|status:)/.test(line.trim()));
  const frontmatterStatus = lines.slice(0, 40).find((line) => /^status:\s*/.test(line.trim()));
  const status = (statusLine ?? frontmatterStatus ?? "")
    .replace(/^(Status:|status:)\s*/, "")
    .trim() || null;
  documentation.push({ file: relativePath, title, status });
}

const markerCounts = [];
const markerPattern = /\b(TODO|FIXME|deprecated|legacy)\b/gi;
for (const record of sourceFileRecords) {
  const matches = [...readText(record.path).matchAll(markerPattern)];
  if (!matches.length) continue;
  const counts = {};
  for (const match of matches) {
    const marker = match[1].toLowerCase();
    counts[marker] = (counts[marker] ?? 0) + 1;
  }
  markerCounts.push({ file: record.path, ...counts });
}

const firstPartyReferenceRoots = ["convex/", "shared/", "apps/web/src/", "api/", "services/"];
const searchableTrackedFiles = trackedFiles.filter((relativePath) =>
  textExtensions.has(path.extname(relativePath)) &&
  !relativePath.startsWith("convex/_generated/") &&
  !relativePath.startsWith("docs/system-map/"),
);
const searchableText = new Map(searchableTrackedFiles.map((relativePath) => [relativePath, readText(relativePath)]));

function referenceBuckets(files) {
  return {
    firstPartyFiles: files.filter((file) => firstPartyReferenceRoots.some((prefix) => file.startsWith(prefix))).sort(),
    proofOrMaintenanceFiles: files.filter((file) => file.startsWith("scripts/")).sort(),
    documentationFiles: files.filter((file) => file.endsWith(".md")).sort(),
  };
}

const schemaTableReferences = schemaTables.map((table) => {
  const pattern = new RegExp(`\\b${table.name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`);
  const files = [...searchableText.entries()]
    .filter(([file, sourceText]) => file !== "convex/schema.ts" && pattern.test(sourceText))
    .map(([file]) => file);
  return { name: table.name, ...referenceBuckets(files) };
});

const convexFunctionReferences = exportedConvexFunctions.map((fn) => {
  const moduleName = path.basename(fn.file, path.extname(fn.file));
  const needles = [`.${moduleName}.${fn.name}`, `${moduleName}:${fn.name}`, `/${moduleName}:${fn.name}`];
  const files = [...searchableText.entries()]
    .filter(([file, sourceText]) => file !== fn.file && needles.some((needle) => sourceText.includes(needle)))
    .map(([file]) => file);
  return {
    file: fn.file,
    name: fn.name,
    constructor: fn.constructor,
    ...referenceBuckets(files),
  };
});

const packageJson = JSON.parse(readText("package.json"));
const packageScripts = Object.entries(packageJson.scripts ?? {})
  .map(([name, command]) => ({ name, command }))
  .sort((a, b) => a.name.localeCompare(b.name));
const dependencies = Object.entries({
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
})
  .map(([name, version]) => ({ name, version }))
  .sort((a, b) => a.name.localeCompare(b.name));
const packageManifestPaths = trackedFiles.filter((relativePath) => relativePath.endsWith("package.json"));
const packageManifests = packageManifestPaths.map((relativePath) => {
  const manifest = JSON.parse(readText(relativePath));
  return {
    file: relativePath,
    name: manifest.name ?? null,
    private: manifest.private ?? null,
    type: manifest.type ?? null,
    engines: manifest.engines ?? {},
    scripts: Object.entries(manifest.scripts ?? {})
      .map(([name, command]) => ({ name, command }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    dependencies: Object.entries(manifest.dependencies ?? {})
      .map(([name, version]) => ({ name, version, kind: "runtime" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    devDependencies: Object.entries(manifest.devDependencies ?? {})
      .map(([name, version]) => ({ name, version, kind: "development" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    overrides: manifest.overrides ?? {},
  };
});
const packageLocks = trackedFiles
  .filter((relativePath) => relativePath.endsWith("package-lock.json"))
  .map((relativePath) => ({ file: relativePath, bytes: fs.statSync(path.join(root, relativePath)).size }));

const generatedAt = new Date().toISOString();
const head = runGit("rev-parse", "HEAD");
const branch = runGit("branch", "--show-current");
const upstream = runGit("rev-parse", "@{upstream}");
const workingTreeStatus = runGit("status", "--porcelain=v1").split("\n").filter(Boolean);

const inventory = {
  schemaVersion: 1,
  generatedAt,
  generator: {
    kind: "read-only-static-analysis",
    typescriptVersion: ts.version,
    source: path.relative(root, fileURLToPath(import.meta.url)),
  },
  snapshot: {
    root,
    branch,
    head,
    upstream,
    workingTreeStatus,
  },
  coverage: {
    trackedFileCount: fileRecords.length,
    sourceFileCount: sourceFileRecords.length,
    sourceLineCount: sourceFileRecords.reduce((sum, record) => sum + (record.lines ?? 0), 0),
    schemaTableCount: schemaTables.length,
    exportedConvexFunctionCount: exportedConvexFunctions.length,
    exportedConvexAliasCandidateCount: exportedConvexAliases.length,
    resolvedExportedConvexAliasCount: resolvedConvexAliases.filter((alias) => alias.resolvesToRegisteredFunction).length,
    convexHttpRouteCount: convexHttpRoutes.length,
    apiRouteFileCount: apiRouteFiles.length,
    scheduledJobCount: scheduledJobs.length,
    packageScriptCount: packageScripts.length,
    totalPackageScriptCount: packageManifests.reduce((sum, manifest) => sum + manifest.scripts.length, 0),
    packageManifestCount: packageManifests.length,
    packageLockCount: packageLocks.length,
    checkScriptCount: packageScripts.filter((script) => script.name.startsWith("check:")).length,
    environmentVariableNameCount: environmentVariables.size,
    documentationFileCount: documentation.length,
  },
  trackedFiles: fileRecords,
  sourceHotspots: [...sourceFileRecords]
    .sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0))
    .slice(0, 100),
  fileCountsByTopLevel: Object.fromEntries([...topLevelCounts.entries()].sort()),
  fileCountsByExtension: Object.fromEntries([...extensionCounts.entries()].sort()),
  importBoundaryCounts: Object.fromEntries([...importBoundaryCounts.entries()].sort()),
  schemaTables: schemaTables.sort((a, b) => a.line - b.line),
  exportedConvexFunctions: exportedConvexFunctions.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  ),
  exportedConvexAliases: resolvedConvexAliases.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  ),
  convexHttpRoutes: convexHttpRoutes.sort((a, b) => a.line - b.line),
  apiRouteFiles,
  scheduledJobs: scheduledJobs.sort((a, b) => a.line - b.line),
  frontendRouteLiterals: [...frontendRouteLiterals].sort(),
  environmentVariables: [...environmentVariables.entries()]
    .map(([name, files]) => ({ name, files: [...files].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  packageScripts,
  dependencies,
  packageManifests,
  packageLocks,
  documentation: documentation.sort((a, b) => a.file.localeCompare(b.file)),
  explicitDebtMarkers: markerCounts.sort((a, b) => a.file.localeCompare(b.file)),
  schemaTableReferences,
  convexFunctionReferences,
  limitations: [
    "Static inventory only; it does not prove runtime liveness, authority, deadness, or ownership.",
    "String-dispatched, generated, indirect, and dynamic call paths require later reconciliation.",
    "Frontend route literals are candidates, not a canonical route table.",
    "Environment variable names are recorded; values are never read.",
    "Untracked mapping artifacts are listed in snapshot status but are not treated as source snapshot inputs.",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, coverage: inventory.coverage }, null, 2));
