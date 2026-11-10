import ts from "typescript";
import { validateComponentTypeSchema } from "../packages/cge/dist/index.js";

function unwrapExpression(input) {
  let node = input;
  while (
    ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isSatisfiesExpression(node)
    || ts.isParenthesizedExpression(node)
    || ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function schemaDiagnostic(message, path) {
  return {
    code: "COMPONENT_INVALID_SCHEMA",
    severity: "error",
    message,
    path,
  };
}

/**
 * Read and validate only the static componentDefinition.schema expression.
 * Project code is parsed as TypeScript syntax and is never evaluated/imported.
 */
export function parseComponentSchemaSource(source, fileName, expectedTypeId, expectedVersion) {
  const scriptKind = fileName.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const parseDiagnostics = sourceFile.parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    return {
      valid: false,
      diagnostics: parseDiagnostics.map((item) => schemaDiagnostic(
        ts.flattenDiagnosticMessageText(item.messageText, "\n"),
        fileName,
      )),
    };
  }

  const declarations = new Map();
  let schemaExpression;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      declarations.set(declaration.name.text, declaration);
      if (!isExported || declaration.name.text !== "componentDefinition") continue;

      const definition = unwrapExpression(declaration.initializer);
      if (!ts.isObjectLiteralExpression(definition)) {
        return {
          valid: false,
          diagnostics: [schemaDiagnostic("componentDefinition must be a static object literal.", fileName)],
        };
      }

      for (const property of definition.properties) {
        if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) continue;
        const propertyName = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
        if (propertyName === "schema") {
          schemaExpression = property.initializer;
          break;
        }
      }
    }
  }

  if (!schemaExpression) {
    return {
      valid: false,
      diagnostics: [schemaDiagnostic("The module must export a componentDefinition constant with a static schema.", fileName)],
    };
  }

  function evaluate(input, resolving = new Set()) {
    const node = unwrapExpression(input);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!Number.isFinite(value)) throw new Error("Schema contains a non-finite numeric literal.");
      return value;
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (
      ts.isPrefixUnaryExpression(node)
      && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
      && ts.isNumericLiteral(node.operand)
    ) {
      const value = Number(node.operand.text) * (node.operator === ts.SyntaxKind.MinusToken ? -1 : 1);
      if (!Number.isFinite(value)) throw new Error("Schema contains a non-finite numeric literal.");
      return value;
    }
    if (ts.isIdentifier(node)) {
      if (resolving.has(node.text)) throw new Error("Schema constant references contain a cycle.");
      const declaration = declarations.get(node.text);
      if (!declaration?.initializer) throw new Error("Schema identifier " + node.text + " is not a local constant.");
      const next = new Set(resolving);
      next.add(node.text);
      return evaluate(declaration.initializer, next);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map((element) => {
        if (ts.isSpreadElement(element)) throw new Error("Schema arrays cannot contain spreads.");
        return evaluate(element, resolving);
      });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const result = Object.create(null);
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
          throw new Error("Schema objects may contain only explicit, static property assignments.");
        }
        const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
          ? property.name.text
          : undefined;
        if (name === undefined) throw new Error("Schema object property names must be identifiers or string literals.");
        if (Object.hasOwn(result, name)) throw new Error("Schema object contains duplicate property " + name + ".");
        Object.defineProperty(result, name, {
          value: evaluate(property.initializer, resolving),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    throw new Error("Schema must use static JSON literals; calls, imports, spreads and computed values are not evaluated.");
  }

  try {
    const validated = validateComponentTypeSchema(evaluate(schemaExpression));
    if (!validated.valid || !validated.value) {
      return {
        valid: false,
        diagnostics: validated.diagnostics.map((item) => ({
          ...item,
          path: item.path ?? fileName,
        })),
      };
    }
    if (validated.value.typeId !== expectedTypeId) {
      return {
        valid: false,
        diagnostics: [schemaDiagnostic(
          `Schema typeId "${validated.value.typeId}" does not match Project module "${expectedTypeId}".`,
          `${fileName}:componentDefinition.schema.typeId`,
        )],
      };
    }
    if (validated.value.version !== expectedVersion) {
      return {
        valid: false,
        diagnostics: [schemaDiagnostic(
          `Schema version "${validated.value.version}" does not match Project module version "${expectedVersion}".`,
          `${fileName}:componentDefinition.schema.version`,
        )],
      };
    }
    return validated;
  } catch (error) {
    return {
      valid: false,
      diagnostics: [schemaDiagnostic(
        error instanceof Error ? error.message : String(error),
        `${fileName}:componentDefinition.schema`,
      )],
    };
  }
}
