/**
 * Fixture tests (COD-62): the game fixture project must contain structurally
 * valid localization tables, and its data must work end-to-end with the
 * runtime service.
 *
 * Fixture layout (tests/workspace/test-typescript/locale/):
 * - en-US.json / ru-RU.json — complete translations of the same key set.
 * - en-GB.json — deliberately sparse table used to verify the fallback path.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
    LocalizationService,
    parseLocalizationTable,
    validateLocalizationProject
} from "../dist/index.js"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_LOCALE_DIR = path.join(HERE, "..", "..", "..", "tests", "workspace", "test-typescript", "locale")

const TABLE_FILES = ["en-US.json", "ru-RU.json", "en-GB.json"]

function loadProjectTables() {

    return TABLE_FILES.map(file => {

        const sourceText = readFileSync(path.join(FIXTURE_LOCALE_DIR, file), "utf8")

        return parseLocalizationTable(sourceText, `locale/${file}`)
    })
}

describe("fixture: game project localization tables", () => {

    it("exists in the fixture project", () => {

        const tables = loadProjectTables()
        assert.equal(tables.length, TABLE_FILES.length)
    })

    it("contains structurally valid tables for every locale file", () => {

        for (const result of loadProjectTables()) {

            assert.deepEqual(
                result.diagnostics,
                [],
                `fixture table must be structurally valid: ${result.diagnostics[0]?.message}`
            )
            assert.notEqual(result.table, undefined)
        }
    })

    it("defines the same locales as the contract files", () => {

        const locales = loadProjectTables().map(result => result.table.locale).sort()

        assert.deepEqual(locales, ["en-GB", "en-US", "ru-RU"])
    })

    it("passes project validation with only the expected en-GB fallback warnings", () => {

        const tables = loadProjectTables().map(result => ({ table: result.table }))

        const diagnostics = validateLocalizationProject(tables, { fallbackLocale: "en-US" })

        // en-GB is deliberately sparse: every key except menu.play must be
        // reported as a missing-key warning. No errors and no extra keys are
        // expected in the fixture.
        assert.equal(diagnostics.some(item => item.severity === "error"), false)
        assert.deepEqual(
            diagnostics.map(item => [item.code, item.locale]),
            [
                ["LOC_MISSING_KEY", "en-GB"],
                ["LOC_MISSING_KEY", "en-GB"],
                ["LOC_MISSING_KEY", "en-GB"]
            ]
        )
    })

    it("resolves en-US and ru-RU texts for the same keys", () => {

        const tables = loadProjectTables().map(result => result.table)
        const keys = tables.find(table => table.locale === "en-US").messages.map(entry => entry.id)

        const enService = new LocalizationService({ tables, locale: "en-US" })
        const ruService = new LocalizationService({ tables, locale: "ru-RU" })

        for (const key of keys) {

            // Provide all placeholders so a clean fixture stays clean.
            const params = {}
            for (const name of enService.getMessagePlaceholders(key)) {
                params[name] = `param-${name}`
            }

            assert.notEqual(enService.t(key, params), `[[${key}]]`, `en-US must have "${key}"`)
            assert.notEqual(ruService.t(key, params), `[[${key}]]`, `ru-RU must have "${key}"`)

            const enText = enService.t(key, params)
            const ruText = ruService.t(key, params)

            assert.notEqual(enText, ruText, `text of "${key}" must differ between locales`)
        }

        assert.deepEqual(
            [...enService.getDiagnostics(), ...ruService.getDiagnostics()],
            [],
            "a clean fixture project must not produce runtime diagnostics for existing keys"
        )
    })

    it("falls back from en-GB to en-US for keys the sparse table lacks", () => {

        const tables = loadProjectTables().map(result => result.table)
        const service = new LocalizationService({ tables, locale: "en-GB", fallbackLocale: "en-US" })

        // menu.play exists in en-GB itself.
        const enGbOnly = service.t("menu.play")

        assert.notEqual(enGbOnly, "[[menu.play]]")
        assert.equal(
            service.getDiagnostics().some(item => item.code === "LOC_FALLBACK_USED" && item.messageId === "menu.play"),
            false
        )

        // Other keys come from the fallback locale and are reported once.
        const usTable = tables.find(table => table.locale === "en-US")

        for (const { id } of usTable.messages) {

            if (id === "menu.play") {
                continue
            }

            assert.notEqual(service.t(id), `[[${id}]]`)
        }

        const fallbackUsed = service.getDiagnostics().filter(item => item.code === "LOC_FALLBACK_USED")
        assert.equal(fallbackUsed.length, usTable.messages.length - 1)

        for (const item of fallbackUsed) {
            assert.equal(item.locale, "en-GB")
        }
    })

    it("switches locale at runtime and keeps parameters", () => {

        const tables = loadProjectTables().map(result => result.table)
        const service = new LocalizationService({ tables, locale: "en-US", fallbackLocale: "en-US" })

        const welcomeKey = "profile.welcome"

        const enText = service.t(welcomeKey, { name: "Alex" })

        service.setLocale("ru-RU")
        const ruText = service.t(welcomeKey, { name: "Алексей" })

        assert.notEqual(enText, ruText)
        assert.match(ruText, /Алексей/)
        assert.deepEqual(service.getDiagnostics(), [])
    })
})
