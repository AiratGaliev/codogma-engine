/**
 * Path containment helpers for the Codogma Engine local server.
 *
 * These are the security-critical primitives used by every file API method
 * (server.mjs). They live in their own module so they can be unit-tested
 * directly (tests/path-security.test.mjs) without booting the HTTP server.
 *
 * Threat model: the editor API accepts arbitrary relative paths from the
 * browser. A malicious or buggy client must not be able to read, write or
 * delete anything outside the project directory, including through symbolic
 * links created inside the project (symlink escape) and through dangling
 * links (which must fail closed instead of falling back to a parent walk).
 */

import fs from "fs"
import path from "path"

/**
 * True when `target`'s real location is the base itself or inside it.
 *
 * The walk tolerates not-yet-existing leaf components (a write may create
 * them) but fails closed on dangling symlinks: a link whose target does not
 * exist must never be treated as a missing file under a trusted parent.
 */
export function isWithinRealBase(base, target) {
    const realBase = fs.realpathSync(base)
    const isInside = candidate => candidate === realBase || candidate.startsWith(realBase + path.sep)
    let candidate = target

    while (true) {
        try {
            // lstat sees the link itself, unlike realpath. A dangling symlink
            // must fail closed instead of being treated as a missing leaf
            // under an otherwise trusted parent directory.
            const linkOrFile = fs.lstatSync(candidate)

            if (linkOrFile.isSymbolicLink()) {
                return isInside(fs.realpathSync(candidate))
            }

            return isInside(fs.realpathSync(candidate))
        } catch (error) {
            if (error.code !== "ENOENT" && error.code !== "ENOTDIR") return false

            // realpath(2) also reports ENOENT for a dangling symlink. Detect
            // that case before walking up to a parent that may be in-base.
            try {
                if (fs.lstatSync(candidate).isSymbolicLink()) return false
            } catch (lstatError) {
                if (lstatError.code !== "ENOENT" && lstatError.code !== "ENOTDIR") return false
            }

            const parent = path.dirname(candidate)
            if (parent === candidate) return false
            candidate = parent
        }
    }
}

/** Pure containment check against an already-resolved real base. */
export function isInsideBase(realBase, candidate) {
    return candidate === realBase || candidate.startsWith(realBase + path.sep)
}

/**
 * Resolve a client-supplied relative path against `base` and return the
 * absolute path, or null when the path escapes the base lexically (..,
 * absolute input) or through symbolic links.
 */
export function safeJoin(base, relPath) {
    if (typeof relPath !== "string") return null

    const p = path.resolve(base, "." + path.sep + relPath.replace(/^[\\/]+/, ""))
    if (p !== base && !p.startsWith(base + path.sep)) return null

    // A lexical prefix check alone allows paths through symlinks inside the
    // project to read or modify files elsewhere on the user's machine.
    try {
        if (!isWithinRealBase(base, p)) return null
    } catch {
        return null
    }

    return p
}
