export function colorPreview(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${Math.max(0, Math.floor(value)).toString(16).slice(-6).padStart(6, "0")}`;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(normalized)) return normalized;
    const phaserHex = normalized.match(/^0x([\da-f]{1,8})$/i)?.[1];
    if (phaserHex) return `#${phaserHex.slice(-6).padStart(6, "0")}`;
  }

  return "transparent";
}
