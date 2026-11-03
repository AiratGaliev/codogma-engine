import type { ContractVersion, ContractVersionSet, ValidationIssue, VersionRange } from "./types.js";

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export const PROTOCOL_VERSION = "1.0.0" as const;
export const SCHEMA_VERSION = "1.0.0" as const;

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return { major, minor, patch };
}

export function isContractVersion(value: unknown): value is ContractVersion {
  return typeof value === "string" && parseVersion(value) !== null;
}

export function compareContractVersions(left: ContractVersion, right: ContractVersion): number {
  const a = parseVersion(left);
  const b = parseVersion(right);

  if (!a || !b) {
    throw new RangeError("Contract versions must use the numeric major.minor.patch format.");
  }

  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

export function isValidVersionRange(range: VersionRange): boolean {
  const minimum = parseVersion(range.minimum);
  const maximum = parseVersion(range.maximumExclusive);

  if (!minimum || !maximum) return false;
  if (compareContractVersions(range.minimum, range.maximumExclusive) >= 0) return false;

  return maximum.major === minimum.major ||
    (maximum.major === minimum.major + 1 && maximum.minor === 0 && maximum.patch === 0);
}

export function isVersionInRange(version: ContractVersion, range: VersionRange): boolean {
  if (!parseVersion(version) || !isValidVersionRange(range)) return false;

  return compareContractVersions(version, range.minimum) >= 0 &&
    compareContractVersions(version, range.maximumExclusive) < 0;
}

export interface VersionCompatibilityResult {
  compatible: boolean;
  issues: readonly ValidationIssue[];
}

export function negotiateContractVersions(
  local: ContractVersionSet,
  remote: ContractVersionSet,
): VersionCompatibilityResult {
  const issues: ValidationIssue[] = [];
  const dimensions = [
    {
      label: "protocol",
      localVersion: local.protocolVersion,
      remoteVersion: remote.protocolVersion,
      localRange: local.supportedProtocolVersions,
      remoteRange: remote.supportedProtocolVersions,
    },
    {
      label: "schema",
      localVersion: local.schemaVersion,
      remoteVersion: remote.schemaVersion,
      localRange: local.supportedSchemaVersions,
      remoteRange: remote.supportedSchemaVersions,
    },
  ] as const;

  for (const dimension of dimensions) {
    if (!isVersionInRange(dimension.localVersion, dimension.remoteRange)) {
      issues.push({
        code: "VERSION_NOT_SUPPORTED",
        path: "/" + dimension.label + "Version",
        message: "The peer does not declare support for the local " + dimension.label + " version.",
      });
    }

    if (!isVersionInRange(dimension.remoteVersion, dimension.localRange)) {
      issues.push({
        code: "VERSION_NOT_SUPPORTED",
        path: "/supported" + dimension.label[0]?.toUpperCase() + dimension.label.slice(1) + "Versions",
        message: "The local implementation does not declare support for the peer " + dimension.label + " version.",
      });
    }
  }

  return { compatible: issues.length === 0, issues };
}
