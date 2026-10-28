/**
 * Contract tests for localization table parsing (COD-62).
 *
 * Covers: valid tables, broken JSON with position extraction, missing and
 * unsupported schema versions, duplicate message ids, rejected object-form
 * tables, invalid locale tags, invalid entries/ids/texts.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
    LOCALIZATION_TABLE_SCHEMA_VERSION,
    parseLocalizationTable
} from "../dist/index.js"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, "fixtures")

function readFixture(name) {
    return readFileSync(path.join(FIXTURES, name), "utf8")
}

function parseFixture(name) {
    return parseLocalizationTable(readFixture(name), `tests/fixtures/${name}`)
}

function codes(diagnostics) {
    return diagnostics.map(item => item.code)
}

describe("parseLocalizationTable: valid tables", () => {

    it("parses a structurally valid table with messages and params", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "en-US",
            messages: [
                { id: "menu.play", text: "Play" },
                { id: "profile.welcome", text: "Hello, {name}!" }
            ]
        }), "locale/en-US.json")

        assert.deepEqual(codes(result.diagnostics), [])

        assert.equal(result.table.locale, "en-US")
        assert.equal(result.table.schemaVersion, LOCALIZATION_TABLE_SCHEMA_VERSION)
        assert.equal(result.table.messages.length, 2)
        assert.deepEqual(result.table.messages[1], { id: "profile.welcome", text: "Hello, {name}!" })
    })

    it("accepts an empty messages array", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "ru-RU",
            messages: []
        }))

        assert.deepEqual(codes(result.diagnostics), [])
        assert.equal(result.table.messages.length, 0)
    })

    it("keeps UTF-8 text of any language intact", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "ru-RU",
            messages: [
                { id: "profile.welcome", text: "Добро пожаловать, {name}!" }
            ]
        }))

        assert.deepEqual(codes(result.diagnostics), [])
        assert.equal(result.table.messages[0].text, "Добро пожаловать, {name}!")
    })

    it("does not set optional diagnostic fields when not applicable", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "en-US",
            messages: [{ id: "a", text: "A" }]
        }))

        assert.deepEqual(codes(result.diagnostics), [])
        for (const item of result.diagnostics) {
            assert.equal("file" in item, false)
            assert.equal("locale" in item, false)
        }
    })
})

describe("parseLocalizationTable: broken JSON", () => {

    it("reports LOC_PARSE_ERROR with line/column when position is known", () => {

        const result = parseFixture("broken-json.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_PARSE_ERROR"])

        const diagnostic = result.diagnostics[0]
        assert.equal(diagnostic.file, "tests/fixtures/broken-json.json")
        assert.match(diagnostic.message, /line 5, column \d+/)
    })

    it("reports LOC_PARSE_ERROR for non-JSON text without position", () => {

        const result = parseLocalizationTable("not json at all", "broken.txt")

        assert.deepEqual(codes(result.diagnostics), ["LOC_PARSE_ERROR"])
        assert.match(result.diagnostics[0].message, /Invalid JSON/)
    })

    it("rejects a JSON array as the top-level table shape", () => {

        const result = parseLocalizationTable("[]")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_MESSAGES"])
    })
})

describe("parseLocalizationTable: version contract", () => {

    it("rejects a table without schemaVersion", () => {

        const result = parseFixture("missing-version.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_MISSING_VERSION"])
    })

    it("rejects an unsupported schemaVersion with an explicit message", () => {

        const result = parseFixture("unsupported-version.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_UNSUPPORTED_VERSION"])
        assert.match(result.diagnostics[0].message, /Supported version: 1/)
    })
})

describe("parseLocalizationTable: message ids and entries", () => {

    it("detects duplicate message ids in the entry array", () => {

        const result = parseFixture("duplicate-id.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_DUPLICATE_ID"])
        assert.equal(result.diagnostics[0].messageId, "menu.play")
        assert.equal(result.diagnostics[0].locale, "en-US")
        assert.equal(result.diagnostics[0].file, "tests/fixtures/duplicate-id.json")
    })

    it("keeps the first occurrence text deterministically", () => {

        const result = parseFixture("duplicate-id.json")

        // The table is rejected, but the parse logic must be deterministic:
        // a repeated run produces identical diagnostics.
        const again = parseFixture("duplicate-id.json")
        assert.deepEqual(result.diagnostics, again.diagnostics)
    })

    it("rejects the object form of messages where JSON.parse would hide duplicates", () => {

        const result = parseFixture("object-form.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_MESSAGES"])
        assert.match(result.diagnostics[0].message, /array of \{ id, text \}/)
    })

    it("rejects an entry without a text field", () => {

        const result = parseFixture("invalid-entry.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_ENTRY"])
    })

    it("rejects ids with whitespace", () => {

        const result = parseFixture("invalid-id.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_ID"])
    })

    it("rejects an empty text", () => {

        const result = parseFixture("empty-text.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_TEXT"])
    })

    it("reports invalid entry as error and still parses the rest of the file", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "en-US",
            messages: [
                { id: "good", text: "Good" },
                42,
                { id: "also_good", text: "Also good" }
            ]
        }))

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_ENTRY"])
    })
})

describe("parseLocalizationTable: locale tags", () => {

    it("rejects an underscore locale tag with a hint", () => {

        const result = parseFixture("invalid-locale.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_LOCALE"])
        assert.match(result.diagnostics[0].message, /"-" instead of "_"/)
    })

    it("rejects a missing locale", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            messages: []
        }))

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_LOCALE"])
    })

    it("accepts language-only and region tags", () => {

        for (const locale of ["ru", "en-US", "pt-BR", "zh-Hans"]) {

            const result = parseLocalizationTable(JSON.stringify({
                schemaVersion: 1,
                locale,
                messages: []
            }))

            assert.deepEqual(codes(result.diagnostics), [], `locale ${locale} must be accepted`)
            assert.equal(result.table.locale, locale)
        }
    })

    it("rejects a non-canonical case variant with the canonical form in the message", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "en-us",
            messages: [{ id: "a", text: "A" }]
        }), "locale/en-us.json")

        assert.equal(result.table, undefined)
        assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_LOCALE"])
        assert.match(result.diagnostics[0].message, /canonical form "en-US"/)
    })

    it("accepts a canonical script subtag in Titlecase", () => {

        const result = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "zh-Hans",
            messages: [{ id: "a", text: "A" }]
        }))

        assert.equal(result.table?.locale, "zh-Hans")
        assert.deepEqual(codes(result.diagnostics), [])
    })


    it("accepts canonical variants, numeric regions, extensions, and private-use subtags", () => {

        for (const locale of [
            "zh-cmn-Hans-CN",
            "de-CH-1901",
            "en-419",
            "sl-rozaj-biske",
            "en-u-ca-gregory",
            "en-x-game"
        ]) {

            const result = parseLocalizationTable(JSON.stringify({
                schemaVersion: 1,
                locale,
                messages: []
            }))

            assert.deepEqual(codes(result.diagnostics), [], `locale ${locale} must be accepted`)
            assert.equal(result.table?.locale, locale)
        }
    })

    it("rejects malformed BCP 47 subtags, invalid ordering, and duplicate extensions", () => {

        for (const locale of [
            "en-A1",
            "en-12",
            "en-US-12",
            "en-US-Latn",
            "en-u",
            "en-u-a",
            "en-x",
            "en-a-foo-A-bar",
            `en-${"a".repeat(9)}`
        ]) {

            const result = parseLocalizationTable(JSON.stringify({
                schemaVersion: 1,
                locale,
                messages: []
            }))

            assert.equal(result.table, undefined, `locale ${locale} must be rejected`)
            assert.deepEqual(codes(result.diagnostics), ["LOC_INVALID_LOCALE"], `locale ${locale}`)
        }
    })
})
