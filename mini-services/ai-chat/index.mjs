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
 */

import { createServer } from "node:http"

import ZAI from "z-ai-web-dev-sdk"

const PORT = 3031

let zaiPromise = null

function getZai() {

    if (!zaiPromise) {
        zaiPromise = ZAI.create()
    }

    return zaiPromise
}

function json(res, body, status = 200) {

    res.writeHead(status, { "Content-Type": "application/json" })

    res.end(JSON.stringify(body))
}

function readBody(req) {

    return new Promise((resolve, reject) => {

        let data = ""

        req.on("data", chunk => data += chunk)

        req.on("end", () => resolve(data))

        req.on("error", reject)
    })
}

createServer(async (req, res) => {

    try {

        const url = new URL(req.url, `http://localhost:${PORT}`)

        if (req.method === "GET" && url.pathname === "/health") {

            json(res, { ok: true, service: "phaser-editor-ai-chat" })

            return
        }

        if (req.method === "POST" && url.pathname === "/chat") {

            try {

                const body = JSON.parse(await readBody(req))

                const messages = Array.isArray(body.messages) ? body.messages : []

                if (messages.length === 0) {

                    json(res, { error: "messages array is required" }, 400)

                    return
                }

                const zai = await getZai()

                const completion = await zai.chat.completions.create({
                    messages,
                    thinking: { type: "disabled" }
                })

                const text = completion?.choices?.[0]?.message?.content ?? ""

                json(res, { text })

            } catch (e) {

                console.error("chat error:", e?.message || e)

                json(res, { error: String(e?.message || e) }, 500)
            }

            return
        }

        json(res, { error: "not found" }, 404)

    } catch (e) {

        console.error("request error:", e?.message || e)

        json(res, { error: String(e?.message || e) }, 500)
    }

}).listen(PORT, () => console.log(`phaser-editor-ai-chat listening on http://localhost:${PORT}`))
