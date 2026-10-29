import assert from "node:assert/strict"
import test from "node:test"
import { Readable } from "node:stream"

import { readRequestBuffer } from "../server/request-body.mjs"

function requestStream(chunks, headers = {}) {
    const request = Readable.from(chunks.map(chunk =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    ))
    request.headers = headers
    return request
}

test("readRequestBuffer accepts a chunked body exactly at the configured limit", async () => {
    const request = requestStream(["123", "45"], {})
    const body = await readRequestBuffer(request, 5)
    assert.equal(body.toString("utf8"), "12345")
})

test("readRequestBuffer rejects a chunked body when streamed bytes exceed the limit", async () => {
    const request = requestStream(["123", "456"], {})
    await assert.rejects(
        readRequestBuffer(request, 5),
        error => error?.statusCode === 413 && error.message === "Request body too large"
    )
})

test("readRequestBuffer rejects a body whose actual bytes exceed its declared Content-Length", async () => {
    // Simulate a request abstraction that reports Content-Length = 4 but
    // supplies six bytes. A real HTTP parser may reject this framing earlier;
    // the streaming guard must still be authoritative for every emitted chunk.
    const request = requestStream(["123", "456"], { "content-length": "4" })
    await assert.rejects(
        readRequestBuffer(request, 5),
        error => error?.statusCode === 413 && error.message === "Request body too large"
    )
})

test("readRequestBuffer rejects a declared oversized body before waiting for its payload", async () => {
    const request = requestStream([], { "content-length": "6" })
    await assert.rejects(
        readRequestBuffer(request, 5),
        error => error?.statusCode === 413 && error.message === "Request body too large"
    )
})

test("readRequestBuffer propagates a stream failure without returning partial bytes", async () => {
    const request = new Readable({
        read() {
            this.push(Buffer.from("abc"))
            this.destroy(new Error("simulated network interruption"))
        }
    })
    request.headers = {}

    await assert.rejects(readRequestBuffer(request, 10), /simulated network interruption/)
})

test("readRequestBuffer rejects invalid byte limits", async () => {
    const request = requestStream(["x"])
    assert.throws(() => readRequestBuffer(request, -1), /maxBytes/)
    assert.throws(() => readRequestBuffer(request, 1.5), /maxBytes/)
})
