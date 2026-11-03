export interface TypeScriptSourceDiagnostic {
  code: number;
  severity: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
}

export interface TypeScriptSourceCheckResult {
  output: string;
  diagnostics: TypeScriptSourceDiagnostic[];
}

/**
 * Runs the pinned TypeScript compiler's single-file transpile diagnostics.
 * This reports parse/emit diagnostics, not project-wide semantic type errors.
 * Full project checking remains the user's configured tsc/build command.
 */
export async function checkTypeScriptSource(
  fileName: string,
  source: string,
): Promise<TypeScriptSourceCheckResult> {
  const ts = await import("typescript");
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      strict: true,
      experimentalDecorators: true,
      noEmitOnError: false,
    },
  });

  const diagnostics = (result.diagnostics ?? [])
    .filter((diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error ||
      diagnostic.category === ts.DiagnosticCategory.Warning,
    )
    .map((diagnostic): TypeScriptSourceDiagnostic => {
      const position = diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined;
      return {
        code: diagnostic.code,
        severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ...(position === undefined ? {} : {
          line: position.line + 1,
          column: position.character + 1,
        }),
      };
    });

  return { output: result.outputText, diagnostics };
}
