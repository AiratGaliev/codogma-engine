import type { ProjectBuildOutputManifest } from "@codogma/cge";
import { validateHtml5BuildProfile, type Html5BuildProfileV1 } from "./profiles.js";

export interface Html5BuildToolchainV1 {
  readonly name: string;
  readonly version: string;
}

export interface Html5BuildArtifactFileInput {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly brotliBytes?: number;
  readonly sourceModuleIds?: readonly string[];
  readonly includedNodeIds?: readonly string[];
}

export interface Html5BuildArtifactFileV1 {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly gzipBytes: number;
  readonly brotliBytes?: number;
  readonly sourceModuleIds: readonly string[];
  readonly includedNodeIds: readonly string[];
}

export interface Html5BuildManifestV1 {
  readonly schemaVersion: 1;
  readonly target: "html5";
  readonly profile: Html5BuildProfileV1;
  readonly toolchain: Html5BuildToolchainV1;
  readonly files: readonly Html5BuildArtifactFileV1[];
  readonly totals: {
    readonly fileCount: number;
    readonly rawBytes: number;
    readonly gzipBytes: number;
    readonly brotliBytes?: number;
  };
}

export interface Html5BuildDifference {
  readonly kind: "metadata-changed" | "file-added" | "file-removed" | "file-changed";
  readonly path?: string;
  readonly detail: string;
}

export interface Html5BuildComparison {
  readonly reproducible: boolean;
  readonly differences: readonly Html5BuildDifference[];
}

function normalizeOutputPath(value: string): string {
  if (
    value.length === 0 || value.length > 512 || value.startsWith("/") ||
    value.includes("\\") || value.includes(":") || value.includes("?") || value.includes("#")
  ) throw new TypeError("Build output path must be a safe relative POSIX path.");

  if (value.split("/").some((segment) =>
    segment.length === 0 || segment === "." || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment)
  )) throw new TypeError("Build output path contains an unsafe path segment: " + value);
  return value;
}

function normalizeIdentityList(values: readonly string[] | undefined, label: string): readonly string[] {
  const list = values ?? [];
  if (list.some((value) =>
    typeof value !== "string" || value.length === 0 || value.length > 512 ||
    /[\u0000-\u001f]/.test(value)
  )) throw new TypeError(label + " must contain non-empty stable identities.");
  return Object.freeze([...new Set(list)].sort((left, right) => left.localeCompare(right)));
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copyBuffer(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function gzipSize(bytes: Uint8Array): Promise<number> {
  const stream = new Blob([copyBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

export async function createHtml5BuildManifest(input: {
  readonly profile: Html5BuildProfileV1;
  readonly toolchain: Html5BuildToolchainV1;
  readonly files: readonly Html5BuildArtifactFileInput[];
}): Promise<Html5BuildManifestV1> {
  const validation = validateHtml5BuildProfile(input.profile);
  if (!validation.valid || !validation.value) {
    throw new TypeError("Invalid HTML5 build profile: " + validation.diagnostics.join(" "));
  }
  if (
    typeof input.toolchain?.name !== "string" || input.toolchain.name.trim().length === 0 ||
    typeof input.toolchain.version !== "string" || input.toolchain.version.trim().length === 0
  ) throw new TypeError("Build manifest requires a named, versioned toolchain.");
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new TypeError("Build manifest requires at least one emitted artifact file.");
  }

  const seenPaths = new Set<string>();
  const files: Html5BuildArtifactFileV1[] = [];
  for (const file of input.files) {
    const path = normalizeOutputPath(file.path);
    if (seenPaths.has(path)) throw new TypeError("Duplicate build output path: " + path);
    seenPaths.add(path);
    if (!(file.contents instanceof Uint8Array)) {
      throw new TypeError("Build output contents must be Uint8Array values: " + path);
    }

    if (file.brotliBytes !== undefined && (!Number.isSafeInteger(file.brotliBytes) || file.brotliBytes < 0)) {
      throw new TypeError("Brotli byte count must be a non-negative safe integer: " + path);
    }
    const contents = new Uint8Array(file.contents);
    const [hash, compressedBytes] = await Promise.all([sha256(contents), gzipSize(contents)]);
    files.push(Object.freeze({
      path,
      sizeBytes: contents.byteLength,
      sha256: hash,
      gzipBytes: compressedBytes,
      ...(file.brotliBytes === undefined ? {} : { brotliBytes: file.brotliBytes }),
      sourceModuleIds: normalizeIdentityList(file.sourceModuleIds, "sourceModuleIds"),
      includedNodeIds: normalizeIdentityList(file.includedNodeIds, "includedNodeIds"),
    }));
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  const rawBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  const gzipBytes = files.reduce((total, file) => total + file.gzipBytes, 0);
  const brotliComplete = files.every((file) => file.brotliBytes !== undefined);
  const brotliBytes = brotliComplete
    ? files.reduce((total, file) => total + (file.brotliBytes ?? 0), 0)
    : undefined;
  if (
    !Number.isSafeInteger(rawBytes) ||
    !Number.isSafeInteger(gzipBytes) ||
    (brotliBytes !== undefined && !Number.isSafeInteger(brotliBytes))
  ) {
    throw new RangeError("HTML5 build artifact totals exceed the safe integer range.");
  }

  return Object.freeze({
    schemaVersion: 1,
    target: "html5",
    profile: validation.value,
    toolchain: Object.freeze({ name: input.toolchain.name.trim(), version: input.toolchain.version.trim() }),
    files: Object.freeze(files),
    totals: Object.freeze({
      fileCount: files.length,
      rawBytes,
      gzipBytes,
      ...(brotliBytes === undefined ? {} : { brotliBytes }),
    }),
  });
}

export function compareHtml5BuildManifests(
  left: Html5BuildManifestV1,
  right: Html5BuildManifestV1,
): Html5BuildComparison {
  const differences: Html5BuildDifference[] = [];
  if (JSON.stringify(left.profile) !== JSON.stringify(right.profile)) {
    differences.push({ kind: "metadata-changed", detail: "Build profile differs." });
  }
  if (
    left.schemaVersion !== right.schemaVersion || left.target !== right.target ||
    left.toolchain.name !== right.toolchain.name || left.toolchain.version !== right.toolchain.version
  ) differences.push({ kind: "metadata-changed", detail: "Build target, manifest schema or toolchain differs." });

  const leftFiles = new Map(left.files.map((file) => [file.path, file] as const));
  const rightFiles = new Map(right.files.map((file) => [file.path, file] as const));
  const paths = [...new Set([...leftFiles.keys(), ...rightFiles.keys()])].sort((a, b) => a.localeCompare(b));

  for (const path of paths) {
    const first = leftFiles.get(path);
    const second = rightFiles.get(path);
    if (!first) {
      differences.push({ kind: "file-added", path, detail: "Output file appears only in the second build." });
      continue;
    }
    if (!second) {
      differences.push({ kind: "file-removed", path, detail: "Output file appears only in the first build." });
      continue;
    }
    if (
      first.sizeBytes !== second.sizeBytes || first.sha256 !== second.sha256 ||
      first.gzipBytes !== second.gzipBytes ||
      first.brotliBytes !== second.brotliBytes ||
      JSON.stringify(first.sourceModuleIds) !== JSON.stringify(second.sourceModuleIds) ||
      JSON.stringify(first.includedNodeIds) !== JSON.stringify(second.includedNodeIds)
    ) differences.push({ kind: "file-changed", path, detail: "Output bytes or module composition differ." });
  }

  return Object.freeze({ reproducible: differences.length === 0, differences: Object.freeze(differences) });
}

export function toProjectBuildOutputManifest(manifest: Html5BuildManifestV1): ProjectBuildOutputManifest {
  return {
    production: manifest.profile.kind === "release",
    target: manifest.target,
    toolchain: manifest.toolchain.name + "@" + manifest.toolchain.version,
    files: manifest.files.map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes,
      gzipBytes: file.gzipBytes,
      ...(file.brotliBytes === undefined ? {} : { brotliBytes: file.brotliBytes }),
      includesNodeIds: file.includedNodeIds,
    })),
  };
}
