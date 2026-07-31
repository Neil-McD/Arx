import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const apiDeclarationPath = resolve(root, "convex/_generated/api.d.ts");
const runtimeRoots = ["shared", "apps/web/src", "api", "services", "src"]
  .map((path) => resolve(root, path))
  .filter((path) => existsSync(path));
const ignoredDirectories = new Set(["node_modules", "dist", "_generated"]);
const clientMethods = new Set(["query", "mutation", "action", "watchQuery"]);
type ClientOperationKind = "query" | "mutation" | "action";

function listRuntimeSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeSourceFiles(path));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const runtimeFiles = runtimeRoots.flatMap(listRuntimeSourceFiles);
const program = ts.createProgram({
  rootNames: [...runtimeFiles, apiDeclarationPath],
  options: {
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  },
});
const checker = program.getTypeChecker();
const apiSource = program.getSourceFile(apiDeclarationPath);
if (!apiSource) throw new Error("convex_generated_api_declaration_missing");

let apiDeclaration: ts.VariableDeclaration | null = null;
for (const statement of apiSource.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.name.text === "api") {
      apiDeclaration = declaration;
      break;
    }
  }
  if (apiDeclaration) break;
}
if (!apiDeclaration) throw new Error("convex_generated_api_symbol_missing");

const apiType = checker.getTypeAtLocation(apiDeclaration.name);
const violations: string[] = [];
const validatedRoutes = new Set<string>();
let clientCallSites = 0;
let validatedReferences = 0;

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function readApiReference(expression: ts.Expression): string | null {
  const parts: string[] = [];
  let current = unwrapExpression(expression);
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = unwrapExpression(current.expression);
  }
  if (!ts.isIdentifier(current) || current.text !== "api" || parts.length !== 2) {
    return null;
  }
  return `${parts[0]}:${parts[1]}`;
}

function finiteStringValues(expression: ts.Expression): string[] | null {
  const type = checker.getTypeAtLocation(unwrapExpression(expression));
  const members = type.isUnion() ? type.types : [type];
  if (members.length === 0 || members.some((member) => !member.isStringLiteral())) {
    return null;
  }
  return members.map((member) => member.value);
}

function readSourcePublicOperationKind(
  moduleName: string,
  functionName: string,
): ClientOperationKind | null {
  const sourcePath = [
    resolve(root, "convex", `${moduleName}.ts`),
    resolve(root, "convex", `${moduleName}.js`),
  ].find((path) => existsSync(path));
  if (!sourcePath) return null;
  const source = program.getSourceFile(sourcePath)
    ?? ts.createSourceFile(
      sourcePath,
      readFileSync(sourcePath, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name)
        || declaration.name.text !== functionName
        || !declaration.initializer
      ) {
        continue;
      }
      const initializer = unwrapExpression(declaration.initializer);
      if (!ts.isCallExpression(initializer)) return null;
      const callee = unwrapExpression(initializer.expression);
      if (
        ts.isIdentifier(callee)
        && (callee.text === "query" || callee.text === "mutation" || callee.text === "action")
      ) {
        return callee.text;
      }
      return null;
    }
  }
  return null;
}

function validateRoute(params: {
  file: ts.SourceFile;
  node: ts.Node;
  expectedKind: "query" | "mutation" | "action";
  route: string;
}): void {
  const match = /^([A-Za-z0-9_/-]+):([A-Za-z0-9_]+)$/.exec(params.route);
  const location = `${relative(root, params.file.fileName)}:${params.file.getLineAndCharacterOfPosition(params.node.getStart(params.file)).line + 1}`;
  if (!match) {
    violations.push(`${location} invalid Convex operation reference '${params.route}'`);
    return;
  }

  const [, moduleName, functionName] = match;
  const moduleSymbol = checker.getPropertyOfType(apiType, moduleName);
  let actualKind: ClientOperationKind | null = null;
  if (moduleSymbol) {
    const moduleType = checker.getTypeOfSymbolAtLocation(moduleSymbol, apiDeclaration!.name);
    const functionSymbol = checker.getPropertyOfType(moduleType, functionName);
    if (functionSymbol) {
      const functionType = checker.getTypeOfSymbolAtLocation(functionSymbol, apiDeclaration!.name);
      const kindSymbol = checker.getPropertyOfType(functionType, "_type");
      const kindType = kindSymbol
        ? checker.getTypeOfSymbolAtLocation(kindSymbol, apiDeclaration!.name)
        : null;
      actualKind = kindType?.isStringLiteral()
        && (kindType.value === "query" || kindType.value === "mutation" || kindType.value === "action")
        ? kindType.value
        : null;
    }
  }
  actualKind ??= readSourcePublicOperationKind(moduleName, functionName);
  if (!actualKind) {
    violations.push(`${location} Convex operation '${params.route}' is not in the candidate public API`);
    return;
  }
  if (actualKind !== params.expectedKind) {
    violations.push(
      `${location} Convex operation '${params.route}' is ${actualKind ?? "unknown"}, expected ${params.expectedKind}`,
    );
    return;
  }

  validatedRoutes.add(params.route);
  validatedReferences += 1;
}

function visit(file: ts.SourceFile, node: ts.Node): void {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    const receiverText = node.expression.expression.getText(file).toLowerCase();
    if (clientMethods.has(methodName) && receiverText.includes("client")) {
      clientCallSites += 1;
      const expectedKind = methodName === "watchQuery" ? "query" : methodName;
      const firstArgument = node.arguments[0];
      const location = `${relative(root, file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
      if (!firstArgument) {
        violations.push(`${location} Convex client call has no operation reference`);
      } else {
        const unwrapped = unwrapExpression(firstArgument);
        if (ts.isStringLiteralLike(unwrapped)) {
          validateRoute({ file, node: firstArgument, expectedKind, route: unwrapped.text });
        } else {
          const apiReference = readApiReference(firstArgument);
          if (apiReference) {
            validateRoute({ file, node: firstArgument, expectedKind, route: apiReference });
          } else {
            const values = finiteStringValues(firstArgument);
            if (!values) {
              violations.push(
                `${location} Convex client operation must be a generated api reference or a finite string-literal union`,
              );
            } else {
              for (const route of values) {
                validateRoute({ file, node: firstArgument, expectedKind, route });
              }
            }
          }
        }
      }
    }
  }
  ts.forEachChild(node, (child) => visit(file, child));
}

for (const filePath of runtimeFiles) {
  const file = program.getSourceFile(filePath)
    ?? ts.createSourceFile(
      filePath,
      readFileSync(filePath, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    );
  visit(file, file);
}

if (clientCallSites === 0) {
  throw new Error("convex_client_operation_call_sites_missing");
}
if (violations.length > 0) {
  console.error("FAIL: first-party Convex client operations do not match the candidate public API.");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `PASS: ${clientCallSites} first-party Convex client call sites resolve through ${validatedReferences} checked references to ${validatedRoutes.size} candidate public operations.`,
);
