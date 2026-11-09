/** Rejects promise-returning callbacks at synchronous runtime service boundaries. */
export function assertSynchronousResult(result: unknown, owner: string): void {
  if (result === null || (typeof result !== "object" && typeof result !== "function")) return;
  if (typeof (result as { then?: unknown }).then !== "function") return;
  void Promise.resolve(result).catch(() => undefined);
  throw new TypeError(owner + " must complete synchronously; Promise results are not supported.");
}
