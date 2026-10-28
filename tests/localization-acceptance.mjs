/**
 * COD-62 runtime acceptance check: localization tables + fallback.
 *
 * Boots the local editor server on a free port with the default fixture
 * project, fetches the fixture locale files through the play-mode route
 * (`/editor/external/...`) exactly as a browser game would, then runs the
 * compiled `@codogma/localization` runtime service against the real data:
 *
 * - en-US / ru-RU resolve the same keys to their own translations (UTF-8);
 * - en-GB is sparse: missing keys come from the fallback locale and are
 *   reported as deduplicated diagnostics;
 * - an unknown key returns the visible `[[id]]` marker with a diagnostic;
 * - a structurally broken table is rejected and never served as translation.
 *
 * Requires the compiled package (`npm run test:localization` builds it).
 * Usage: node tests/localization-acceptance.mjs
 */

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
    LocalizationService,
    parseLocalizationTable,
    validateLocalizationProject
} from "@codogma/localization"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PROJECT_DIR = path.join(ROOT, "tests", "workspace", "test-typescript")

function freePort() {
    const server = net.createServer()
    server.listen(0, "127.0.0.1")
    return new Promise((resolve, reject) => {
        server.once("listening", () => {
            const { port } = server.address()
            server.close(error => error ? reject(error) : resolve(port))
        })
        server.once("error", reject)
    })
}

async function main() {

    const port = await freePort()

    const child = spawn(process.execPath, [path.join(ROOT, "server", "server.mjs")], {
        cwd: ROOT,
        env: {
            ...process.env,
            PORT: String(port),
            PROJECT_DIR
        },
        stdio: ["ignore", "pipe", "pipe"]
    })

    let serverLogs = ""
    child.stdout.on("data", chunk => { serverLogs += chunk })
    child.stderr.on("data", chunk => { serverLogs += chunk })

    try {

        // --- wait for the server -------------------------------------------------

        const deadline = Date.now() + 10000
        let up = false

        while (Date.now() < deadline && !up) {

            if (child.exitCode !== null) {
                throw new Error(`Editor server exited early (${child.exitCode}):\n${serverLogs}`)
            }

            try {
                const response = await fetch(`http://127.0.0.1:${port}/editor/product.json`)
                up = response.ok
            } catch {
                // still starting
            }

            if (!up) {
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }

        if (!up) {
            throw new Error(`Editor server did not start in time:\n${serverLogs}`)
        }

        console.log(`server is up on port ${port}`)

        // --- load fixture tables through the play-mode route --------------------

        const base = `http://127.0.0.1:${port}/editor/external/locale`

        const tableFiles = ["en-US.json", "ru-RU.json", "en-GB.json"]
        const parseResults = []

        for (const file of tableFiles) {

            const response = await fetch(`${base}/${file}`)

            assert.equal(response.status, 200, `locale file must be served: ${file}`)

            const contentType = response.headers.get("content-type") ?? ""
            assert.match(contentType, /application\/json/, `locale file must be served as JSON: ${file}`)

            const text = await response.text()

            const parsed = parseLocalizationTable(text, `locale/${file}`)
            assert.deepEqual(
                parsed.diagnostics,
                [],
                `fixture table must be structurally valid: ${file}: ${parsed.diagnostics[0]?.message}`
            )

            parseResults.push(parsed)
            console.log(`fetched and parsed locale/${file} (locale=${parsed.table.locale}, messages=${parsed.table.messages.length})`)
        }

        // --- project validation over the real fixture data -----------------------

        const diagnostics = validateLocalizationProject(
            parseResults.map(result => ({ table: result.table })),
            { fallbackLocale: "en-US" }
        )

        const errors = diagnostics.filter(item => item.severity === "error")
        assert.deepEqual(errors, [], "the fixture project must produce no validation errors")

        // The sparse en-GB table is expected to produce missing-key warnings only.
        assert.deepEqual(
            diagnostics.map(item => `${item.code}:${item.locale}`),
            [
                "LOC_MISSING_KEY:en-GB",
                "LOC_MISSING_KEY:en-GB",
                "LOC_MISSING_KEY:en-GB"
            ]
        )
        console.log("project validation: 3 expected en-GB missing-key warnings, 0 errors")

        // --- runtime behaviour ----------------------------------------------------

        const tables = parseResults.map(result => result.table)
        const service = new LocalizationService({ tables, locale: "en-US", fallbackLocale: "en-US" })

        assert.equal(service.t("menu.play"), "Play")
        assert.equal(service.t("profile.welcome", { name: "Alex" }), "Hello, Alex!")
        assert.equal(service.t("score.display", { score: 120 }), "Score: 120")

        service.setLocale("ru-RU")
        assert.equal(service.t("menu.play"), "Играть")
        assert.equal(service.t("profile.welcome", { name: "Алексей" }), "Привет, Алексей!")
        console.log("runtime: en-US and ru-RU resolve identical keys to their own UTF-8 texts")

        // Sparse locale falls back to en-US.
        service.setLocale("en-GB")
        assert.equal(service.t("menu.play"), "Play")
        assert.equal(service.t("menu.settings"), "Settings")

        const fallbackUsed = service.getDiagnostics().filter(item => item.code === "LOC_FALLBACK_USED")
        assert.equal(fallbackUsed.length, 1, "fallback usage must be reported once per key")
        assert.equal(fallbackUsed[0].locale, "en-GB")
        assert.equal(fallbackUsed[0].messageId, "menu.settings")
        console.log("runtime: en-GB fallback to en-US is deterministic and diagnosed")

        // Missing translation: visible marker + deduplicated diagnostics.
        assert.equal(service.t("game.unknown.key"), "[[game.unknown.key]]")
        for (let i = 0; i < 25; i++) {
            service.t("game.unknown.key")
        }

        const missing = service.getDiagnostics().filter(item => item.code === "LOC_MISSING_TRANSLATION")
        assert.equal(missing.length, 1, "missing-translation diagnostics must be deduplicated")
        console.log("runtime: unknown key returns [[game.unknown.key]], diagnostics deduplicated")

        // --- broken table is rejected, never served as translations ----------------

        const broken = parseLocalizationTable(
            JSON.stringify({
                schemaVersion: 1,
                locale: "en-US",
                messages: [
                    { id: "menu.play", text: "Play" },
                    { id: "menu.play", text: "Start" }
                ]
            }),
            "broken.json"
        )

        assert.notEqual(broken.diagnostics.length, 0)
        assert.equal(broken.table, undefined, "a table with duplicate ids must be rejected")
        console.log("runtime: duplicate-id table is rejected by the parser")

        console.log("\nLocalization runtime acceptance passed.")
        console.log("Note: this check covers server->HTTP->service behavior.")
        console.log("In-browser rendering acceptance with the editor UI remains a separate manual step.")

    } finally {

        const exited = once(child, "exit").catch(() => undefined)
        child.kill()
        await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))])
    }
}

main().catch(error => {
    console.error("Localization acceptance FAIL:", error.stack || error.message)
    process.exitCode = 1
})
