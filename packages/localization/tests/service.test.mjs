/**
 * Runtime service tests (COD-62): key lookup, locale switching, parameter
 * substitution, deterministic fallback and diagnostic deduplication.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LocalizationService, parseLocalizationTable } from "../dist/index.js"

function table(locale, entries) {
    return { schemaVersion: 1, locale, messages: entries.map(([id, text]) => ({ id, text })) }
}

function codes(diagnostics) {
    return diagnostics.map(item => item.code)
}

describe("LocalizationService: lookup and parameters", () => {

    it("resolves a key with the active locale text", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US"
        })

        assert.equal(service.t("menu.play"), "Play")
        assert.deepEqual(codes(service.getDiagnostics()), [])
    })

    it("substitutes named parameters of any type", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [
                ["profile.welcome", "Hello, {name}!"],
                ["score.display", "Score: {score}"]
            ])],
            locale: "en-US"
        })

        assert.equal(service.t("profile.welcome", { name: "Alex" }), "Hello, Alex!")
        assert.equal(service.t("score.display", { score: 120 }), "Score: 120")
    })

    it("keeps a missing parameter visible and reports LOC_MISSING_PARAM", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["profile.welcome", "Hello, {name}!"]])],
            locale: "en-US"
        })

        assert.equal(service.t("profile.welcome"), "Hello, {name}!")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_MISSING_PARAM"])
        assert.equal(service.getDiagnostics()[0].messageId, "profile.welcome")
    })

    it("keeps unsupported brace groups as literal text", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["game.braces", "Score {1} and {oops and {} stay"]])],
            locale: "en-US"
        })

        assert.equal(service.t("game.braces"), "Score {1} and {oops and {} stay")
    })

    it("passes UTF-8 text through unchanged", () => {

        const service = new LocalizationService({
            tables: [table("ru-RU", [["profile.welcome", "Добро пожаловать, {name}!"]])],
            locale: "ru-RU"
        })

        assert.equal(service.t("profile.welcome", { name: "Алексей" }), "Добро пожаловать, Алексей!")
    })
})

describe("LocalizationService: locale switching", () => {

    it("switches locale and resolves the translated text", () => {

        const service = new LocalizationService({
            tables: [
                table("en-US", [["menu.play", "Play"]]),
                table("ru-RU", [["menu.play", "Играть"]])
            ],
            locale: "en-US"
        })

        assert.equal(service.t("menu.play"), "Play")

        service.setLocale("ru-RU")
        assert.equal(service.getLocale(), "ru-RU")
        assert.equal(service.t("menu.play"), "Играть")
    })

    it("rejects switching to an unknown locale and keeps the current one", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US"
        })

        service.setLocale("de-DE")

        assert.equal(service.getLocale(), "en-US")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_UNKNOWN_LOCALE"])
    })

    it("reports an initial locale without a table", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "de-DE"
        })

        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_UNKNOWN_LOCALE"])
        // Deterministic behavior without a table: the marker is returned.
        assert.equal(service.t("menu.play"), "[[menu.play]]")
    })

    it("registers a lazily loaded table and then allows switching", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US"
        })

        service.setLocale("de-DE")
        assert.equal(service.getLocale(), "en-US")

        service.registerTable(table("de-DE", [["menu.play", "Spielen"]]))
        service.setLocale("de-DE")

        assert.equal(service.getLocale(), "de-DE")
        assert.equal(service.t("menu.play"), "Spielen")
    })

    it("warns and keeps the first table when a locale is registered twice", () => {

        const service = new LocalizationService({
            tables: [
                table("en-US", [["menu.play", "Play"]]),
                table("en-US", [["menu.play", "PLAY!"]])
            ],
            locale: "en-US"
        })

        assert.equal(service.t("menu.play"), "Play")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_DUPLICATE_REGISTRATION"])

        service.registerTable(table("en-US", [["menu.play", "PLAY!"]]))

        assert.equal(service.t("menu.play"), "Play")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_DUPLICATE_REGISTRATION"])
    })

    it("exposes hasLocale and hasMessage", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US"
        })

        assert.equal(service.hasLocale("en-US"), true)
        assert.equal(service.hasLocale("ru-RU"), false)
        assert.equal(service.hasMessage("menu.play"), true)
        assert.equal(service.hasMessage("menu.quit"), false)
    })
})

describe("LocalizationService: deterministic fallback", () => {

    it("falls back to the configured locale and reports LOC_FALLBACK_USED", () => {

        const service = new LocalizationService({
            tables: [
                table("en-US", [
                    ["menu.play", "Play"],
                    ["menu.settings", "Settings"]
                ]),
                table("en-GB", [["menu.play", "Play, mate"]])
            ],
            locale: "en-GB",
            fallbackLocale: "en-US"
        })

        assert.equal(service.t("menu.play"), "Play, mate")
        assert.equal(service.t("menu.settings"), "Settings")

        const used = service.getDiagnostics().filter(item => item.code === "LOC_FALLBACK_USED")
        assert.equal(used.length, 1)
        assert.equal(used[0].locale, "en-GB")
        assert.equal(used[0].messageId, "menu.settings")
        assert.match(used[0].message, /fallback locale "en-US" was used/)
    })

    it("uses the fallback locale parameters, not the active locale", () => {

        const service = new LocalizationService({
            tables: [
                table("en-US", [["profile.welcome", "Hello, {name}!"]]),
                table("en-GB", [])
            ],
            locale: "en-GB",
            fallbackLocale: "en-US"
        })

        assert.equal(service.t("profile.welcome", { name: "Alex" }), "Hello, Alex!")
    })

    it("returns the [[id]] marker when neither locale has the key", () => {

        const service = new LocalizationService({
            tables: [
                table("en-US", [["menu.play", "Play"]]),
                table("ru-RU", [["menu.play", "Играть"]])
            ],
            locale: "ru-RU",
            fallbackLocale: "en-US"
        })

        assert.equal(service.t("menu.quit"), "[[menu.quit]]")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_MISSING_TRANSLATION"])
        assert.match(service.getDiagnostics()[0].message, /nor in fallback locale "en-US"/)
    })

    it("marks missing translation also when fallback is disabled", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US",
            fallbackLocale: null
        })

        assert.equal(service.t("menu.quit"), "[[menu.quit]]")
        assert.match(service.getDiagnostics()[0].message, /no fallback locale is configured/)
    })

    it("activates the fallback once its table is registered later", () => {

        const service = new LocalizationService({
            tables: [table("ru-RU", [["menu.play", "Играть"]])],
            locale: "ru-RU",
            fallbackLocale: "en-US"
        })

        // Before registration: warning, marker, no fallback use.
        assert.equal(service.getFallbackLocale(), "en-US")
        assert.equal(service.t("menu.quit"), "[[menu.quit]]")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_UNKNOWN_FALLBACK_LOCALE", "LOC_MISSING_TRANSLATION"])

        // Lazy registration re-enables fallback without recreating the service.
        service.registerTable(table("en-US", [["menu.play", "Play"], ["menu.quit", "Quit"]]))

        assert.equal(service.t("menu.quit"), "Quit")
        assert.deepEqual(
            codes(service.getDiagnostics()),
            ["LOC_UNKNOWN_FALLBACK_LOCALE", "LOC_MISSING_TRANSLATION", "LOC_FALLBACK_USED"]
        )
    })

    it("is deterministic: two identical runs give identical results", () => {

        const make = () => {

            const service = new LocalizationService({
                tables: [
                    table("en-US", [
                        ["menu.play", "Play"],
                        ["profile.welcome", "Hello, {name}!"]
                    ]),
                    table("ru-RU", [["menu.play", "Играть"]])
                ],
                locale: "ru-RU",
                fallbackLocale: "en-US"
            })

            return [
                service.t("menu.play"),
                service.t("profile.welcome", { name: "Alex" }),
                service.t("missing.key"),
                service.getDiagnostics().map(item => [item.code, item.severity, item.locale, item.messageId])
            ]
        }

        assert.deepEqual(make(), make())
    })
})

describe("Locale case policy (COD-64)", () => {

    it("accepts a canonical table and rejects a non-canonical duplicate", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["a", "A"]])],
            locale: "en-US"
        })

        assert.equal(service.t("a"), "A")

        // Non-canonical tag is rejected at registration time.
        service.registerTable({
            schemaVersion: 1,
            locale: "ru-ru",
            messages: [{ id: "a", text: "А" }]
        })
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_INVALID_LOCALE"])
    })

    it("matches active locale exactly by canonical case", () => {

        const service = new LocalizationService({
            tables: [table("en-GB", [["a", "GB"]]), table("en-US", [["a", "US"]])],
            locale: "en-GB",
            fallbackLocale: "en-US"
        })

        assert.equal(service.t("a"), "GB")
        assert.equal(service.getLocale(), "en-GB")
    })

    it("setLocale rejects a non-canonical tag and keeps the previous locale", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["a", "A"]])],
            locale: "en-US"
        })

        service.setLocale("en-us")
        assert.equal(service.getLocale(), "en-US")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_INVALID_LOCALE"])
    })

    it("rejects a non-canonical initial locale without choosing by table order", () => {

        const tables = [table("en-US", [["a", "A"]]), table("ru-RU", [["a", "А"]])]
        const service = new LocalizationService({ tables, locale: "en-us" })
        const reversed = new LocalizationService({ tables: [...tables].reverse(), locale: "en-us" })

        for (const instance of [service, reversed]) {
            assert.equal(instance.getLocale(), "en-us")
            assert.equal(instance.t("a"), "[[a]]")
            assert.deepEqual(codes(instance.getDiagnostics()), [
                "LOC_INVALID_LOCALE",
                "LOC_MISSING_TRANSLATION"
            ])
        }

        assert.deepEqual(service.getDiagnostics(), reversed.getDiagnostics())
    })

    it("uses only a registered configured fallback to recover from an invalid initial locale", () => {

        const tables = [table("ru-RU", [["a", "А"]]), table("en-US", [["a", "A"]])]
        const service = new LocalizationService({
            tables,
            locale: "en-us",
            fallbackLocale: "en-US"
        })
        const reversed = new LocalizationService({
            tables: [...tables].reverse(),
            locale: "en-us",
            fallbackLocale: "en-US"
        })

        for (const instance of [service, reversed]) {
            assert.equal(instance.getLocale(), "en-US")
            assert.equal(instance.t("a"), "A")
            assert.deepEqual(codes(instance.getDiagnostics()), ["LOC_INVALID_LOCALE"])
        }

        assert.deepEqual(service.getDiagnostics(), reversed.getDiagnostics())
    })

    it("disables a non-canonical fallback locale with an error diagnostic", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["a", "A"]]), table("ru-RU", [])],
            locale: "ru-RU",
            fallbackLocale: "en-us"
        })

        assert.equal(service.getFallbackLocale(), null)
        assert.equal(service.t("a"), "[[a]]")
        assert.deepEqual(codes(service.getDiagnostics()), [
            "LOC_INVALID_LOCALE",
            "LOC_MISSING_TRANSLATION"
        ])
    })
})

describe("LocalizationService: diagnostic deduplication", () => {

    it("reports a missing translation once per locale and key", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US"
        })

        for (let i = 0; i < 10; i++) {
            assert.equal(service.t("menu.quit"), "[[menu.quit]]")
        }

        const missing = service.getDiagnostics().filter(item => item.code === "LOC_MISSING_TRANSLATION")
        assert.equal(missing.length, 1)
    })

    it("reports fallback usage once per locale and key, not once per call", () => {

        const service = new LocalizationService({
            tables: [
                table("en-US", [["menu.settings", "Settings"]]),
                table("en-GB", [["menu.play", "Play"]])
            ],
            locale: "en-GB",
            fallbackLocale: "en-US"
        })

        for (let i = 0; i < 10; i++) {
            service.t("menu.settings")
        }

        const used = service.getDiagnostics().filter(item => item.code === "LOC_FALLBACK_USED")
        assert.equal(used.length, 1)
    })

    it("allows the same key to be reported again after clearing diagnostics", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["menu.play", "Play"]])],
            locale: "en-US"
        })

        assert.equal(service.t("menu.quit"), "[[menu.quit]]")
        assert.equal(service.getDiagnostics().length, 1)

        service.clearDiagnostics()
        assert.equal(service.t("menu.quit"), "[[menu.quit]]")
        assert.equal(service.getDiagnostics().length, 1)
    })
})

describe("parse + service integration", () => {

    it("never registers a table that failed structural validation", () => {

        const parse = parseLocalizationTable(JSON.stringify({
            schemaVersion: 1,
            locale: "en-US",
            messages: [
                { id: "menu.play", text: "Play" },
                { id: "menu.play", text: "Start" }
            ]
        }))

        assert.equal(parse.table, undefined)

        // The game must treat the rejected table as absent data.
        const service = new LocalizationService({
            tables: parse.table === undefined ? [] : [parse.table],
            locale: "en-US"
        })

        assert.equal(service.t("menu.play"), "[[menu.play]]")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_UNKNOWN_LOCALE", "LOC_MISSING_TRANSLATION"])
    })
})

describe("Placeholder inheritance regression (COD-64)", () => {

    it("ignores inherited toString and constructor properties", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["label.greet", "Hello, {name}!"]])],
            locale: "en-US"
        })

        // Empty object has `toString` and `constructor` on its prototype.
        assert.equal(service.t("label.greet", {}), "Hello, {name}!")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_MISSING_PARAM"])
        assert.equal(service.getDiagnostics()[0].messageId, "label.greet")
    })

    it("treats an inherited property as missing, not a value", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["label.info", "Info: {value}"]])],
            locale: "en-US"
        })

        const obj = Object.create({ value: "polluted" })

        assert.equal(service.t("label.info", obj), "Info: {value}")
        assert.deepEqual(codes(service.getDiagnostics()), ["LOC_MISSING_PARAM"])
    })

    it("substitutes explicitly provided parameters, including falsy ones", () => {

        const service = new LocalizationService({
            tables: [table("en-US", [["label.score", "Score: {score}"]])],
            locale: "en-US"
        })

        assert.equal(service.t("label.score", { score: 0 }), "Score: 0")
        assert.equal(service.t("label.score", { score: "" }), "Score: ")
        assert.deepEqual(codes(service.getDiagnostics()), [])
    })
})
