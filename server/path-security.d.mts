import type { Stats } from "node:fs";

export interface ProjectDirectoryEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  mtimeMs: number;
}

export function safeJoin(base: string, relativePath: string): string | null;
export function readFileSafely(
  base: string,
  target: string,
  encoding: "utf8",
  maxBytes: number,
): string;
export function readProjectDirectoryEntriesSafelySync(
  base: string,
  target: string,
): ProjectDirectoryEntry[] | null;
export function statProjectDirectorySafelySync(
  base: string,
  target: string,
): Stats | null;
