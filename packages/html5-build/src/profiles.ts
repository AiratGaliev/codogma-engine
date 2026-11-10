export const HTML5_TARGET_ID = "html5" as const;
export const HTML5_BROWSER_MATRIX_ID = "html5-es2022-tla-v1" as const;

export const HTML5_BROWSER_MATRIX_V1 = Object.freeze([
  Object.freeze({ browser: "chrome", minimumVersion: "89" }),
  Object.freeze({ browser: "edge", minimumVersion: "89" }),
  Object.freeze({ browser: "firefox", minimumVersion: "89" }),
  Object.freeze({ browser: "safari", minimumVersion: "27.0" }),
  Object.freeze({ browser: "ios-safari", minimumVersion: "27.0" }),
  Object.freeze({ browser: "chrome-android", minimumVersion: "89" }),
] as const);

export type Html5BuildProfileKind = "development" | "release";

export interface Html5BuildProfileV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly kind: Html5BuildProfileKind;
  readonly target: typeof HTML5_TARGET_ID;
  readonly outputDirectory: string;
  readonly minify: boolean;
  readonly sourceMaps: boolean;
  readonly ecmaTarget: "es2022";
  readonly browserMatrixId: typeof HTML5_BROWSER_MATRIX_ID;
}

export interface Html5BuildProfileValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
  readonly value?: Html5BuildProfileV1;
}

const PROFILE_FIELDS = new Set([
  "schemaVersion", "id", "name", "kind", "target", "outputDirectory",
  "minify", "sourceMaps", "ecmaTarget", "browserMatrixId",
]);
const PROFILE_ID = /^[a-z][a-z0-9._-]{0,63}$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isSafeProjectOutputPath(value: unknown): value is string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 240 ||
    value.startsWith("/") || value.includes("\\") || value.includes(":") ||
    value.includes("?") || value.includes("#")
  ) return false;

  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".." && PATH_SEGMENT.test(segment)
  );
}

export function createDefaultHtml5BuildProfile(kind: Html5BuildProfileKind): Html5BuildProfileV1 {
  if (kind !== "development" && kind !== "release") {
    throw new TypeError("HTML5 build profile kind must be development or release.");
  }

  return Object.freeze({
    schemaVersion: 1,
    id: "html5." + kind,
    name: kind === "development" ? "HTML5 Development" : "HTML5 Release",
    kind,
    target: HTML5_TARGET_ID,
    outputDirectory: "build/html5/" + kind,
    minify: kind === "release",
    sourceMaps: kind === "development",
    ecmaTarget: "es2022",
    browserMatrixId: HTML5_BROWSER_MATRIX_ID,
  });
}

export function validateHtml5BuildProfile(value: unknown): Html5BuildProfileValidation {
  const diagnostics: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, diagnostics: ["Build profile must be a plain object."] };
  }

  for (const key of Object.keys(value)) {
    if (!PROFILE_FIELDS.has(key)) diagnostics.push("Unsupported build profile field: " + key + ".");
  }
  if (value.schemaVersion !== 1) diagnostics.push("Build profile schemaVersion must be 1.");
  if (typeof value.id !== "string" || !PROFILE_ID.test(value.id)) {
    diagnostics.push("Build profile id must be a stable lowercase identifier.");
  }
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 80) {
    diagnostics.push("Build profile name must contain between 1 and 80 characters.");
  }
  if (value.kind !== "development" && value.kind !== "release") {
    diagnostics.push("Build profile kind must be development or release.");
  }
  if (value.target !== HTML5_TARGET_ID) diagnostics.push("Build profile target must be html5.");
  if (!isSafeProjectOutputPath(value.outputDirectory)) {
    diagnostics.push("Build profile outputDirectory must be a safe project-relative path.");
  }
  if (typeof value.minify !== "boolean") diagnostics.push("Build profile minify must be boolean.");
  if (typeof value.sourceMaps !== "boolean") diagnostics.push("Build profile sourceMaps must be boolean.");
  if (value.ecmaTarget !== "es2022") diagnostics.push("HTML5 build profile ecmaTarget must be es2022.");
  if (value.browserMatrixId !== HTML5_BROWSER_MATRIX_ID) {
    diagnostics.push("Build profile browserMatrixId is unsupported.");
  }

  if (diagnostics.length > 0) return { valid: false, diagnostics };

  const profile: Html5BuildProfileV1 = Object.freeze({
    schemaVersion: 1,
    id: value.id as string,
    name: value.name as string,
    kind: value.kind as Html5BuildProfileKind,
    target: HTML5_TARGET_ID,
    outputDirectory: value.outputDirectory as string,
    minify: value.minify as boolean,
    sourceMaps: value.sourceMaps as boolean,
    ecmaTarget: "es2022",
    browserMatrixId: HTML5_BROWSER_MATRIX_ID,
  });
  return { valid: true, diagnostics: [], value: profile };
}
