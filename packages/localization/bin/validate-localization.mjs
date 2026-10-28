#!/usr/bin/env node
/**
 * Project localization diagnostics entry point (COD-64).
 *
 * Usage:
 *   node packages/localization/bin/validate-localization.mjs <projectDir> [--fallback <locale>] [--json]
 *
 * Reads `<projectDir>/locale/*.json` (sorted), runs the structural parser and
 * the cross-locale validator of `@codogma/localization` and prints the
 * structured diagnostics (code, severity, file, locale, messageId, message).
 *
 * Exit codes: 0 when there are no error-severity diagnostics (warnings are
 * allowed and reported), 1 when errors were found or the locale directory is
 * missing/unreadable. The imported module is the documented public entry
 * point of the package (self-reference via its own `exports` field), so the
 * compiled `dist/` must exist before this script runs.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

// Public entry point of the package itself, not an internal dist path.
import { validateLocalizationSources } from "@codogma/localization"

function usage() {
    console.error("Usage: node packages/localization/bin/validate-localization.mjs <projectDir> [--fallback <locale>] [--json]")
    process.exit(1)
}

const args = process.argv.slice(2)

if (args.length === 0) {
    usage()
}

const projectDir = path.resolve(args[0])
let fallbackLocale
let asJson = false

for (let i = 1; i < args.length; i++) {

    if (args[i] === "--fallback") {

        fallbackLocale = args[i + 1]

        if (fallbackLocale === undefined) {
            usage()
        }

        i += 1

    } else if (args[i] === "--json") {
        asJson = true

    } else {
        usage()
    }
}

const localeDir = path.join(projectDir, "locale")

if (!existsSync(localeDir) || !statSync(localeDir).isDirectory()) {
    console.error(`No locale directory: ${localeDir}`)
    process.exit(1)
}

const files = readdirSync(localeDir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => ({
        path: `locale/${name}`,
        text: readFileSync(path.join(localeDir, name), "utf8")
    }))

const { diagnostics, tables } = validateLocalizationSources(
    files,
    fallbackLocale === undefined ? {} : { fallbackLocale }
)

if (asJson) {
    console.log(JSON.stringify({ diagnostics, validLocales: tables.map(table => table.locale) }, null, 4))
} else {

    for (const item of diagnostics) {

        const where = [item.file, item.locale, item.messageId].filter(part => part !== undefined).join(", ")

        console.log(`[${item.severity}] ${item.code}${where === "" ? "" : ` (${where})`}: ${item.message}`)
    }

    console.log(`\nchecked ${files.length} table file(s), ${tables.length} valid, ${diagnostics.length} diagnostic(s)`)
}

if (diagnostics.some(item => item.severity === "error")) {
    console.error("Localization tables have errors; they must not be loaded as valid translations.")
    process.exit(1)
}

if (!asJson) {
    console.log("Localization tables are valid (warnings do not block).")
}
