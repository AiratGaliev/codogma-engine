/**
 * AI Chat backend for Codogma Engine (v5-style "AI Chat" feature).
 *
 * Plain Node.js mini-service on port 3031. Exposes a minimal chat-completions proxy:
 *
 *   POST /chat   { messages: [{ role, content }, ...] }  ->  { text }
 *   GET  /health -> { ok: true }
 *
 * The Codogma Engine server (server/server.mjs) drives the MCP tool-loop
 * and calls this service for the plain LLM completions.
 *
 * Security posture (this service is a loopback-only helper, never a public API):
 *   - Binds to 127.0.0.1 explicitly (opt-out only via AI_CHAT_HOST).
 *   - Rejects requests whose Host header is not loopback (DNS-rebinding guard).
 *   - Rejects browser requests that carry a non-loopback Origin header
 *     (the supported consumer is server.mjs, which sends no Origin header).
 *   - Caps request body size, message count and message length.
 *   - Rate limits /chat per client address (token bucket).
 *   - Never leaks SDK/upstream error details to the caller; details go to the log.
 */

import { createServer } from "node:http"

const HOST = process.env["AI_CHAT_HOST"] || "127.0.0.1"
const PORT = Number(process.env["AI_CHAT_PORT"] || 3031)

const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_MESSAGES = 64
const MAX_MESSAGE_CHARS = 100_000
const MAX_TOTAL_CHARS = 400_000
const LLM_TIMEOUT_MS = 120_000

const RATE_CAPACITY = 10
const RATE_REFILL_PER_MIN = 30

const ALLOWED_ROLES = new Set(["system", "developer", "user", "assistant"])

let zaiPromise = null

function getZai() {

    if (!zaiPromise) {
        // The optional provider SDK is needed only for /chat, not for starting
        // the local service or enforcing its loopback/Host/Origin boundary.
        zaiPromise = import("z-ai-web-dev-sdk").then(({ default: ZAI }) => ZAI.create())
    }

    return zaiPromise
}

function isLoopbackHostname(hostname) {

    let normalized = hostname.toLowerCase()

    if (normalized.startsWith("[") && normalized.endsWith("]")) {
        normalized = normalized.slice(1, -1)
    }

    if (normalized.endsWith(".")) {
        normalized = normalized.slice(0, -1)
    }

    return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost"
}

/**
 * The service is reachable only from the local machine; any Host header that
 * is not loopback means a rebinding/proxy attempt and is rejected.
 */
function isAllowedHost(hostHeader) {

    if (typeof hostHeader !== "string" || hostHeader.length === 0) return false

    try {
        const parsed = new URL("http://" + hostHeader)

        if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return false

        return isLoopbackHostname(parsed.hostname)
    } catch {
        return false
    }
}

/**
 * Browser requests always carry an Origin header on cross-origin POSTs.
 * The supported consumer (server.mjs) is a Node client and sends none.
 */
function isAllowedOrigin(originHeader) {

    if (originHeader === undefined) return true
    if (typeof originHeader !== "string") return false

    try {
        const origin = new URL(originHeader)
        return origin.protocol === "http:" && isLoopbackHostname(origin.hostname)
    } catch {
        return false
    }
}

function json(res, body, status = 200) {

    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    })

    res.end(JSON.stringify(body))
}

function readBody(req, maxBytes) {

    return new Promise((resolve, reject) => {

        const chunks = []
        let size = 0
        let settled = false

        const fail = error => {

            if (settled) return

            settled = true
            req.resume()
            reject(error)
        }

        req.on("data", chunk => {

            if (settled) return

            size += chunk.length

            if (size > maxBytes) {

                const error = new Error("Request body too large")
                error.statusCode = 413
                fail(error)
                return
            }

            chunks.push(chunk)
        })

        req.on("end", () => {

            if (settled) return

            settled = true
            resolve(Buffer.concat(chunks).toString("utf8"))
        })

        req.on("error", fail)
    })
}

/** Token bucket per client address; protects the LLM quota from local spam. */
const buckets = new Map()

function takeToken(key) {

    const now = Date.now()
    const refillPerMs = RATE_REFILL_PER_MIN / 60000

    let bucket = buckets.get(key)

    if (!bucket) {

        bucket = { tokens: RATE_CAPACITY, last: now }
        buckets.set(key, bucket)
    }

    bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + (now - bucket.last) * refillPerMs)
    bucket.last = now

    if (bucket.tokens < 1) return false

    bucket.tokens -= 1

    return true
}

// Drop stale buckets so a long-running service does not accumulate state.
setInterval(() => {

    const cutoff = Date.now() - 10 * 60_000

    for (const [key, bucket] of buckets) {

        if (bucket.last < cutoff) buckets.delete(key)
    }

}, 60_000).unref()

/**
 * Copy only well-formed { role, content } pairs; reject the request when any
 * message is malformed, has an unknown role, or exceeds the size caps.
 */
function sanitizeMessages(raw) {

    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null

    const out = []
    let total = 0

    for (const item of raw) {

        if (!item || typeof item !== "object" || Array.isArray(item)) return null

        const role = item.role
        const content = item.content

        if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) return null
        if (typeof content !== "string") return null
        if (content.length > MAX_MESSAGE_CHARS) return null

        total += content.length

        if (total > MAX_TOTAL_CHARS) return null

        out.push({ role, content })
    }

    return out
}

function withTimeout(promise, ms, message) {

    return new Promise((resolve, reject) => {

        const timer = setTimeout(
            () => reject(Object.assign(new Error(message), { code: "LLM_TIMEOUT" })),
            ms)

        promise.then(
            value => {

                clearTimeout(timer)
                resolve(value)
            },
            error => {

                clearTimeout(timer)
                reject(error)
            })
    })
}

const server = createServer(async (req, res) => {

    try {

        if (!isAllowedHost(req.headers.host)) {

            json(res, { error: "forbidden host" }, 403)
            return
        }

        if (!isAllowedOrigin(req.headers.origin)) {

            json(res, { error: "forbidden origin" }, 403)
            return
        }

        const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

        if (req.method === "GET" && url.pathname === "/health") {

            json(res, { ok: true, service: "phaser-editor-ai-chat" })
            return
        }

        if (req.method === "POST" && url.pathname === "/chat") {

            if (!takeToken(req.socket.remoteAddress || "unknown")) {

                json(res, { error: "too many requests, slow down" }, 429)
                return
            }

            const contentType = String(req.headers["content-type"] || "")

            if (!contentType.toLowerCase().startsWith("application/json")) {

                json(res, { error: "content-type must be application/json" }, 415)
                return
            }

            let body

            try {

                body = JSON.parse(await readBody(req, MAX_BODY_BYTES))

            } catch (e) {

                json(res, { error: e.statusCode === 413 ? e.message : "invalid JSON body" }, e.statusCode === 413 ? 413 : 400)
                return
            }

            const messages = sanitizeMessages(body?.messages)

            if (!messages) {

                json(res, {
                    error: `messages must be a non-empty array (max ${MAX_MESSAGES}) of { role, content } objects with string content`
                }, 400)
                return
            }

            try {

                const zai = await getZai()

                const completion = await withTimeout(
                    zai.chat.completions.create({
                        messages,
                        thinking: { type: "disabled" }
                    }),
                    LLM_TIMEOUT_MS,
                    "LLM request timed out")

                const text = completion?.choices?.[0]?.message?.content ?? ""

                json(res, { text })

            } catch (e) {

                // Full details only in the server log; the caller (and the
                // editor chat UI) gets a sanitized, actionable message.
                console.error("chat error:", e?.stack || e?.message || e)

                if (e?.code === "LLM_TIMEOUT") {

                    json(res, { error: e.message }, 504)
                    return
                }

                json(res, { error: "LLM service is temporarily unavailable" }, 502)
            }

            return
        }

        json(res, { error: "not found" }, 404)

    } catch (e) {

        console.error("request error:", e?.stack || e?.message || e)

        json(res, { error: "internal error" }, 500)
    }

})

server.headersTimeout = 10_000
server.requestTimeout = 30_000
server.keepAliveTimeout = 5_000

// AI Chat has no remote authentication protocol and must remain loopback-only.
if (!isLoopbackHostname(HOST.toLowerCase())) {

    console.error("phaser-editor-ai-chat: refusing non-loopback bind host " + HOST + ".")
    process.exitCode = 1

} else {

    server.listen(PORT, HOST, () => {

        console.log(`phaser-editor-ai-chat listening on http://${HOST}:${PORT} (loopback-only by default)`)

    })
}
