import type { RuntimeTimeFrame } from "./common.js";

/** Internal guard shared by services consuming the host-owned frame snapshot. */
export function assertRuntimeTimeFrame(frame: RuntimeTimeFrame, previousFrameIndex?: number): void {
  if (!frame || typeof frame !== "object") {
    throw new TypeError("A runtime service requires a RuntimeTimeFrame.");
  }
  if (!Number.isSafeInteger(frame.frameIndex) || frame.frameIndex < 0) {
    throw new RangeError("RuntimeTimeFrame.frameIndex must be a non-negative safe integer.");
  }
  if (previousFrameIndex !== undefined && frame.frameIndex <= previousFrameIndex) {
    throw new RangeError("RuntimeTimeFrame must advance beyond the previously consumed frame.");
  }
  const values = [
    frame.deltaSeconds,
    frame.unscaledDeltaSeconds,
    frame.elapsedSeconds,
    frame.unscaledElapsedSeconds,
    frame.timeScale,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("RuntimeTimeFrame values must be finite and non-negative.");
  }
  if (typeof frame.isPaused !== "boolean") {
    throw new TypeError("RuntimeTimeFrame.isPaused must be a boolean.");
  }
  if ((frame.isPaused || frame.timeScale === 0) && frame.deltaSeconds !== 0) {
    throw new RangeError("Paused or zero-scale RuntimeTimeFrame must have zero scaled delta.");
  }
}
