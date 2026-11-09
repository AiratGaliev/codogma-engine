import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import * as ts from "typescript";

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(absolutePath);
    return entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ? [absolutePath]
      : [];
  });
}

test("Core source has no external module imports or runtime npm dependencies", () => {
  const packageRoot = process.cwd();
  const sourceRoot = resolve(packageRoot, "src");
  const sourceFiles = collectTypeScriptFiles(sourceRoot);
  assert.ok(sourceFiles.length > 0, "Core source files must be present.");

  const violations: string[] = [];
  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.ES2022,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const inspect = (node: ts.Node): void => {
      let specifier: string | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier)) {
          specifier = moduleSpecifier.text;
        }
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] !== undefined &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifier = node.arguments[0].text;
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        specifier = node.argument.literal.text;
      }

      if (
        specifier !== undefined &&
        !specifier.startsWith("./") &&
        !specifier.startsWith("../")
      ) {
        violations.push(filePath + " imports " + JSON.stringify(specifier));
      }
      ts.forEachChild(node, inspect);
    };
    inspect(sourceFile);
  }

  assert.deepEqual(violations, [], "Core imports must stay inside the package source tree.");

  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const lockfile = JSON.parse(readFileSync(resolve(packageRoot, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { dependencies?: Record<string, string> }>;
  };
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
  assert.deepEqual(Object.keys(lockfile.packages?.[""]?.dependencies ?? {}), []);
});
