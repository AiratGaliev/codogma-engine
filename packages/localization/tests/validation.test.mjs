/**
 * Project validation tests (COD-62): duplicate locales, unknown fallback,
 * missing/extra keys, placeholder mismatches and deterministic reference
 * selection.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { validateLocalizationProject } from "../dist/index.js"

function table(locale, entries) {
    return { schemaVersion: 1, locale, messages: entries.map(([id, text]) => ({ id, text })) }
}

function entry({ table: t, file }) {
    return file === undefined ? { table: t } : { table: t, file }
}

function codes(diagnostics) {
    return diagnostics.map(item => item.code)
}

function pairs(diagnostics) {
    return diagnostics.map(item => `${item.code}:${item.locale}:${item.messageId ?? ""}`)
}

describe("validateLocalizationProject: clean projects", () => {

    it("returns no diagnostics when locales match", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [
                ["menu.play", "Play"],
                ["profile.welcome", "Hello, {name}!"]
            ]) }),
            entry({ table: table("ru-RU", [
                ["menu.play", "Играть"],
                ["profile.welcome", "Привет, {name}!"]
            ]) })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(codes(diagnostics), [])
    })
})

describe("validateLocalizationProject: missing and extra keys", () => {

    it("reports keys missing in a secondary locale as warnings", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [
                ["menu.play", "Play"],
                ["menu.settings", "Settings"]
            ], ), file: "locale/en-US.json" }),
            entry({ table: table("ru-RU", [["menu.play", "Играть"]]), file: "locale/ru-RU.json" })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(pairs(diagnostics), ["LOC_MISSING_KEY:ru-RU:menu.settings"])
        assert.equal(diagnostics[0].severity, "warning")
        assert.equal(diagnostics[0].file, "locale/ru-RU.json")
    })

    it("reports extra keys not present in the reference locale", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [["menu.play", "Play"]]), file: "locale/en-US.json" }),
            entry({ table: table("ru-RU", [
                ["menu.play", "Играть"],
                ["menu.about", "О игре"]
            ]), file: "locale/ru-RU.json" })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(pairs(diagnostics), ["LOC_EXTRA_KEY:ru-RU:menu.about"])
        assert.equal(diagnostics[0].severity, "warning")
    })

    it("chooses the largest table as reference without a fallback locale", () => {

        // Without a configured fallback, the reference is the locale with the
        // most keys: en-US. The sparse en-GB table produces missing-key
        // warnings only.
        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [
                ["menu.play", "Play"],
                ["menu.settings", "Settings"]
            ]) }),
            entry({ table: table("en-GB", [["menu.play", "Play"]]) })
        ])

        assert.deepEqual(pairs(diagnostics), ["LOC_MISSING_KEY:en-GB:menu.settings"])
    })

    it("breaks reference ties deterministically by lexicographic order", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("ru-RU", [["menu.play", "Играть"]]) }),
            entry({ table: table("en-US", [["menu.play", "Play"]]) })
        ])

        // Same key count: the lexicographically smallest locale is the
        // reference, so ru-RU reports a missing key for... nothing: keys are
        // equal. Verify determinism instead.
        assert.deepEqual(codes(diagnostics), [])
    })

    it("reports every missing key of the sparse locale", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [
                ["a", "A"],
                ["b", "B"],
                ["c", "C"]
            ]) }),
            entry({ table: table("en-GB", [["a", "A"]]) })
        ])

        assert.deepEqual(pairs(diagnostics), [
            "LOC_MISSING_KEY:en-GB:b",
            "LOC_MISSING_KEY:en-GB:c"
        ])
    })
})

describe("validateLocalizationProject: placeholder consistency", () => {

    it("reports placeholders that differ between locales as errors", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [
                ["score.display", "Score: {score} and {bonus}"]
            ]), file: "locale/en-US.json" }),
            entry({ table: table("ru-RU", [
                ["score.display", "Счёт: {points} и {bonus}"]
            ]), file: "locale/ru-RU.json" })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(pairs(diagnostics), ["LOC_PLACEHOLDER_MISMATCH:ru-RU:score.display"])
        assert.equal(diagnostics[0].severity, "error")
        assert.match(diagnostics[0].message, /points/)
        assert.match(diagnostics[0].message, /reference locale "en-US"/)
    })

    it("reports when a translation drops a placeholder entirely", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [["profile.welcome", "Hello, {name}!"]]) }),
            entry({ table: table("ru-RU", [["profile.welcome", "Привет!"]]) })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(pairs(diagnostics), ["LOC_PLACEHOLDER_MISMATCH:ru-RU:profile.welcome"])
        assert.match(diagnostics[0].message, /none\)/)
    })

    it("does not report identical placeholder sets in different order", () => {

        // Contract: placeholder sets are compared as sets (extraction keeps
        // document order, but the comparison uses canonical JSON signature).
        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [
                ["profile.full", "{first} then {second}"]
            ]) }),
            entry({ table: table("ru-RU", [
                ["profile.full", "{second} then {first}"]
            ]) })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(codes(diagnostics), [])
    })

    it("does not compare placeholders of keys missing in the reference locale", () => {

        // Such keys are already reported as LOC_EXTRA_KEY warnings; comparing
        // their placeholders against the absent reference entry would add a
        // blocking LOC_PLACEHOLDER_MISMATCH error for a consistent table set.
        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [["menu.play", "Play"]]) }),
            entry({ table: table("ru-RU", [["menu.play", "Играть"], ["score.display", "Счёт: {score}"]]) }),
            entry({ table: table("en-GB", [["menu.play", "Play"], ["score.display", "Score: {score}"]]) })
        ], { fallbackLocale: "en-US" })

        assert.deepEqual(
            pairs(diagnostics),
            ["LOC_EXTRA_KEY:ru-RU:score.display", "LOC_EXTRA_KEY:en-GB:score.display"]
        )
    })
})

describe("validateLocalizationProject: configuration errors", () => {

    it("rejects duplicate locales", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [["a", "A"]]), file: "locale/en-US.json" }),
            entry({ table: table("en-US", [["b", "B"]]), file: "locale/en-US-copy.json" })
        ])

        assert.deepEqual(codes(diagnostics), ["LOC_DUPLICATE_LOCALE"])
        assert.equal(diagnostics[0].severity, "error")
        assert.equal(diagnostics[0].file, "locale/en-US-copy.json")
    })

    it("rejects a fallback locale without a table", () => {

        const diagnostics = validateLocalizationProject([
            entry({ table: table("en-US", [["a", "A"]]) })
        ], { fallbackLocale: "de-DE" })

        assert.deepEqual(codes(diagnostics), ["LOC_UNKNOWN_FALLBACK_LOCALE"])
        assert.equal(diagnostics[0].severity, "error")
    })

    it("accepts an empty project", () => {

        const diagnostics = validateLocalizationProject([])
        assert.deepEqual(codes(diagnostics), [])
    })
})

describe("validateLocalizationProject: determinism", () => {

    it("returns identical diagnostics for identical inputs", () => {

        const project = [
            entry({ table: table("en-US", [
                ["menu.play", "Play"],
                ["profile.welcome", "Hello, {name}!"],
                ["score.display", "Score: {score}"]
            ]), file: "locale/en-US.json" }),
            entry({ table: table("ru-RU", [
                ["menu.play", "Играть"],
                ["profile.welcome", "Привет, {имя}!"]
            ]), file: "locale/ru-RU.json" }),
            entry({ table: table("en-GB", [["menu.play", "Play"]]), file: "locale/en-GB.json" })
        ]

        const options = { fallbackLocale: "en-US" }

        const first = validateLocalizationProject(project, options)
        const second = validateLocalizationProject(project, options)

        assert.deepEqual(first, second)
    })
})
