/**
 * Minimal image dimension parser (no dependencies).
 * Supports PNG, JPEG, GIF, BMP, WEBP (VP8/VP8L/VP8X), SVG (width/height attrs).
 * Returns { width, height } or null.
 */

export function parseImageSize(buf) {

    if (!buf || buf.length < 8) return null

    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        if (buf.length >= 24) {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
        }
        return null
    }

    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
        if (buf.length >= 10) {
            return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
        }
        return null
    }

    // BMP
    if (buf[0] === 0x42 && buf[1] === 0x4d) {
        if (buf.length >= 26) {
            return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) }
        }
        return null
    }

    // WEBP
    if (buf.length >= 30
        && buf.toString("ascii", 0, 4) === "RIFF"
        && buf.toString("ascii", 8, 12) === "WEBP") {

        const fmt = buf.toString("ascii", 12, 16)

        if (fmt === "VP8 ") {
            return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
        }
        if (fmt === "VP8L") {
            const b = buf.readUInt32LE(21)
            return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
        }
        if (fmt === "VP8X") {
            const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16))
            const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
            return { width: w, height: h }
        }
        return null
    }

    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        let offset = 2
        while (offset + 9 < buf.length) {
            if (buf[offset] !== 0xff) { offset++; continue }
            const marker = buf[offset + 1]
            // SOF0..SOF15 (except DHT/JPG/DAC)
            if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
            }
            const size = buf.readUInt16BE(offset + 2)
            offset += 2 + size
        }
        return null
    }

    // SVG (text based)
    const head = buf.toString("utf8", 0, Math.min(buf.length, 1024)).toLowerCase()
    if (head.includes("<svg")) {
        const w = head.match(/width\s*=\s*["']?([\d.]+)/)
        const h = head.match(/height\s*=\s*["']?([\d.]+)/)
        const vb = head.match(/viewbox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/)
        if (w && h) return { width: Math.round(parseFloat(w[1])), height: Math.round(parseFloat(h[1])) }
        if (vb) return { width: Math.round(parseFloat(vb[1])), height: Math.round(parseFloat(vb[2])) }
        return { width: 300, height: 150 }
    }

    return null
}
