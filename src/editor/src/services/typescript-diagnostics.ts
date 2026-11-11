import { checkProjectTypeScript } from "./editor-api";
export type { TypeScriptSourceDiagnostic, TypeScriptSourceCheckResult } from "./editor-api";

/** Run semantic TypeScript diagnostics against the active native Project. */
export async function checkTypeScriptSource(
  relativePath: string,
  source: string,
) {
  return checkProjectTypeScript(relativePath, source);
}
