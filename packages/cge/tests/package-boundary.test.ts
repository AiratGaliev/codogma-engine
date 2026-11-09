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

function collectExternalImportViolations(source: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: string[] = [];

  const recordSpecifier = (specifier: string, syntax: string): void => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      violations.push(fileName + ": " + syntax + " " + JSON.stringify(specifier));
    }
  };

  const isRequireCall = (expression: ts.Expression): boolean =>
    (ts.isIdentifier(expression) && expression.text === "require") ||
    (ts.isPropertyAccessExpression(expression) && expression.name.text === "require");

  const inspect = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier)) {
        recordSpecifier(
          moduleSpecifier.text,
          ts.isImportDeclaration(node) ? "import" : "export",
        );
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        if (expression !== undefined && ts.isStringLiteral(expression)) {
          recordSpecifier(expression.text, "import = require()");
        } else {
          violations.push(fileName + ": import = require() must use a literal relative specifier");
        }
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isStringLiteral(argument)) {
        recordSpecifier(argument.text, "dynamic import");
      } else {
        violations.push(fileName + ": dynamic import must use a literal relative specifier");
      }
    } else if (ts.isCallExpression(node) && isRequireCall(node.expression)) {
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isStringLiteral(argument)) {
        recordSpecifier(argument.text, "require()");
      } else {
        violations.push(fileName + ": require() must use a literal relative specifier");
      }
    } else if (ts.isImportTypeNode(node)) {
      if (
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        recordSpecifier(node.argument.literal.text, "import type");
      } else {
        violations.push(fileName + ": import type must use a literal relative specifier");
      }
    }

    ts.forEachChild(node, inspect);
  };

  inspect(sourceFile);
  return violations;
}

test("Core source rejects ESM, dynamic, CommonJS and import-equals external dependencies", () => {
  const fixture = [
    'import "./internal.js";',
    'export * from "../shared.js";',
    'import "node:fs";',
    'export { value } from "@scope/external";',
    'void import("external-dynamic");',
    'require("external-commonjs");',
    'import legacy = require("external-import-equals");',
    'void import("./" + suffix);',
    'module.require("external-module-require");',
  ].join("\n");

  assert.deepEqual(
    collectExternalImportViolations(fixture, "fixture.ts"),
    [
      'fixture.ts: import "node:fs"',
      'fixture.ts: export "@scope/external"',
      'fixture.ts: dynamic import "external-dynamic"',
      'fixture.ts: require() "external-commonjs"',
      'fixture.ts: import = require() "external-import-equals"',
      "fixture.ts: dynamic import must use a literal relative specifier",
      'fixture.ts: require() "external-module-require"',
    ],
  );
});

test("Core source has no external module imports or runtime npm dependencies", () => {
  const packageRoot = process.cwd();
  const sourceRoot = resolve(packageRoot, "src");
  const sourceFiles = collectTypeScriptFiles(sourceRoot);
  assert.ok(sourceFiles.length > 0, "Core source files must be present.");

  const violations = sourceFiles.flatMap((filePath) =>
    collectExternalImportViolations(readFileSync(filePath, "utf8"), filePath),
  );
  assert.deepEqual(violations, [], "Core imports must stay inside the package source tree.");

  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const lockfile = JSON.parse(readFileSync(resolve(packageRoot, "../../package-lock.json"), "utf8")) as {
    packages?: Record<string, { name?: string; dependencies?: Record<string, string> }>;
  };
  const workspaceRecord = lockfile.packages?.["packages/cge"];
  assert.equal(workspaceRecord?.name, manifest.name);
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
  assert.deepEqual(Object.keys(workspaceRecord?.dependencies ?? {}), []);
});
