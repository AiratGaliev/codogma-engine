/**
 * Project diagnostics CLI tests (COD-64).
 *
 * Runs the same executable used by local development and CI against isolated
 * temporary project folders. This verifies CLI output and exit codes instead
 * of relying only on a developer's manual shell checks.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { spawnSync } from "node:child_process"
import {
    mkdtempSync,
    mkdirSync,
    rmSync,
    writeFileSync
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CLI_PATH = path.join(PACKAGE_ROOT, "bin", "validate-localization.mjs")

function createProject(t, { withLocaleDir = true } = {}) {
    const root = mkdtempSync(path.join(os.tmpdir(), "codogma-localization-cli-"))

    if (withLocaleDir) {
        mkdirSync(path.join(root, "locale"), { recursive: true })
    }

    t.after(() => rmSync(root, { recursive: true, force: true }))
    return root
}

function writeTable(projectDir, filename, value) {
    writeFileSync(
        path.join(projectDir, "locale", filename),
        typeof value === "string" ? value : JSON.stringify(value),
        "utf8"
    )
}

function runCli(projectDir, ...args) {
    return spawnSync(process.execPath, [CLI_PATH, projectDir, ...args], {
        cwd: PACKAGE_ROOT,
        encoding: "utf8"
    })
}

function validTable(locale) {
    return {
        schemaVersion: 1,
        locale,
        messages: [
            { id: "menu.play", text: locale === "ru-RU" ? "Играть" : "Play" },
            { id: "profile.welcome", text: locale === "ru-RU" ? "Привет, {name}!" : "Hello, {name}!" }
        ]
    }
}

describe("validate-localization CLI (COD-64)", () => {

    it("returns exit 0 and structured empty diagnostics for a valid project", t => {

        const projectDir = createProject(t)
        writeTable(projectDir, "en-US.json", validTable("en-US"))
        writeTable(projectDir, "ru-RU.json", validTable("ru-RU"))

        const result = runCli(projectDir, "--fallback", "en-US", "--json")

        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        const output = JSON.parse(result.stdout)
        assert.deepEqual(output.diagnostics, [])
        assert.deepEqual(output.validLocales, ["en-US", "ru-RU"])
    })

    it("returns exit 1 with file context for invalid localization JSON", t => {

        const projectDir = createProject(t)
        writeTable(projectDir, "en-US.json", "{ broken json")

        const result = runCli(projectDir, "--fallback", "en-US", "--json")

        assert.equal(result.status, 1, result.stderr)
        const output = JSON.parse(result.stdout)
        const parseDiagnostic = output.diagnostics.find(item => item.code === "LOC_PARSE_ERROR")
        assert.ok(parseDiagnostic)
        assert.equal(parseDiagnostic.severity, "error")
        assert.equal(parseDiagnostic.file, "locale/en-US.json")
    })

    it("returns exit 2 and a structured file diagnostic when locale directory is missing", t => {

        const projectDir = createProject(t, { withLocaleDir: false })

        const result = runCli(projectDir, "--json")

        assert.equal(result.status, 2)
        const output = JSON.parse(result.stdout)
        assert.equal(output.diagnostics[0].code, "LOC_FILE_ERROR")
        assert.equal(output.diagnostics[0].severity, "error")
        assert.equal(output.diagnostics[0].file, "locale/")
        assert.equal(output.validLocales.length, 0)
    })

    it("ignores directories ending in .json instead of reading them as files", t => {

        const projectDir = createProject(t)
        writeTable(projectDir, "en-US.json", validTable("en-US"))
        mkdirSync(path.join(projectDir, "locale", "ignored.json"))

        const result = runCli(projectDir, "--fallback", "en-US")

        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /checked 1 table file\(s\), 1 valid/)
    })
})
