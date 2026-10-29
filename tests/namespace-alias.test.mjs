/**
 * Regression tests for the namespace-alias emission bug (node:test).
 *
 * 'import x = phasereditor2d.<leaf>' statements emit 'var x =
 * phasereditor2d.<leaf>' assignments that run when the importing bundle
 * loads. When the leaf plugin's bundle loads later (bundle order is
 * alphabetical within a priority), the alias is captured as undefined and
 * stays undefined forever — every use then throws
 * "Cannot read properties of undefined (reading 'core')" (caught and logged
 * by the caller, breaking the feature silently).
 *
 * Found at runtime: selecting files in the Files view crashed
 * ManyImageFilePreviewSection.canEditFile, because phasereditor2d.pack.js
 * loaded before phasereditor2d.webContentTypes.js. The fix (mirroring
 * commit 868e561) removes the alias imports; bare 'webContentTypes'
 * references resolve through the enclosing namespace scope and the compiler
 * emits fully-qualified, load-order-safe property reads.
 *
 * The source scan fails fast in CI without a build; the bundle check locks
 * the compiled output and is skipped when the editor has not been built yet.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PACK_SRC = path.join(ROOT, "source/editor/plugins/phasereditor2d.pack/src")
const PACK_BUNDLE = path.join(ROOT, "source/editor/plugins/phasereditor2d.pack/_out/phasereditor2d.pack.js")

const STALE_ALIAS_IMPORT = /import\s+webContentTypes\s*=\s*phasereditor2d\.webContentTypes\s*;/
const STALE_ALIAS_EMISSION = /var\s+webContentTypes\s*=\s*phasereditor2d\.webContentTypes\s*;/

function* walkTypeScriptFiles(dir) {

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {

        const full = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            yield* walkTypeScriptFiles(full)
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
            yield full
        }
    }
}

test("pack plugin sources do not alias phasereditor2d.webContentTypes", () => {

    const offenders = []

    for (const file of walkTypeScriptFiles(PACK_SRC)) {

        const text = fs.readFileSync(file, "utf8")

        if (STALE_ALIAS_IMPORT.test(text)) {
            offenders.push(path.relative(ROOT, file))
        }
    }

    assert.deepEqual(
        offenders,
        [],
        "namespace-alias imports of a later-loading plugin are captured as undefined at bundle load time; "
        + "use the bare namespace reference (resolved fully qualified by the compiler) instead")
})

test("built pack bundle does not capture webContentTypes at load time", (t) => {

    if (!fs.existsSync(PACK_BUNDLE)) {
        t.skip("editor bundle not built yet (run npm run build); nothing to assert")
        return
    }

    const bundle = fs.readFileSync(PACK_BUNDLE, "utf8")

    assert.doesNotMatch(
        bundle,
        STALE_ALIAS_EMISSION,
        "the compiled bundle must not assign phasereditor2d.webContentTypes to a load-time alias; "
        + "references must stay fully qualified (late-bound)")
})
