/**
 * Read a bounded HTTP request body.
 *
 * Content-Length is used only as an early-rejection hint: the streaming byte
 * counter remains authoritative for chunked requests and misdeclared bodies.
 * Oversized bodies are drained after rejecting so request handlers can return
 * HTTP 413 without buffering the remainder.
 */
export function readRequestBuffer(req, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        throw new TypeError("maxBytes must be a non-negative safe integer")
    }

    return new Promise((resolve, reject) => {
        const contentLength = req.headers["content-length"]
        const declaredLength = contentLength === undefined ? null : Number(contentLength)
        if (Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
            const error = new Error("Request body too large")
            error.statusCode = 413
            req.on("error", () => {})
            req.resume()
            reject(error)
            return
        }

        const chunks = []
        let size = 0
        let settled = false

        const cleanup = () => {
            req.off("data", onData)
            req.off("end", onEnd)
            req.off("error", onError)
        }

        const onData = chunk => {
            if (settled) return
            size += chunk.length

            if (size > maxBytes) {
                settled = true
                cleanup()
                req.on("error", () => {})
                req.resume()
                const error = new Error("Request body too large")
                error.statusCode = 413
                reject(error)
                return
            }

            chunks.push(chunk)
        }

        const onEnd = () => {
            if (settled) return
            settled = true
            cleanup()
            resolve(Buffer.concat(chunks))
        }

        const onError = error => {
            if (settled) return
            settled = true
            cleanup()
            reject(error)
        }

        req.on("data", onData)
        req.on("end", onEnd)
        req.on("error", onError)
    })
}
