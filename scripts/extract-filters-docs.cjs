#!/usr/bin/env node
/**
 * Extracts JSDoc docs for Phaser.Filters.* classes (Glow, Shadow, etc.)
 * from the Phaser 4.2.1 phaser.d.ts and patches the editor's docs DB
 * (phasereditor2d.resources/_res/phasereditor2d.scene/docs/phaser.json).
 *
 * Usage: node scripts/extract-filters-docs.js <phaser.d.ts> <phaser.json>
 */
const fs = require("fs")

const DTS = process.argv[2] || "/tmp/phaser4/package/types/phaser.d.ts"
const OUT = process.argv[3] || "/home/z/my-project/source/editor/plugins/phasereditor2d.resources/_res/phasereditor2d.scene/docs/phaser.json"

const src = fs.readFileSync(DTS, "utf8").replace(/\r\n/g, "\n")
const lines = src.split("\n")

// find "namespace Filters {" (top-level, 4-space indent)
let nsStart = -1
for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "    namespace Filters {") { nsStart = i; break }
}
if (nsStart < 0) { console.error("namespace Filters not found"); process.exit(1) }

// find namespace end (matching closing brace at 4-space indent)
let nsEnd = -1
for (let i = nsStart + 1; i < lines.length; i++) {
    if (lines[i] === "    }") { nsEnd = i; break }
}

const docs = {}

function extractClass(className, keyPrefix) {
    // find class start within namespace
    let clsStart = -1
    for (let i = nsStart; i <= nsEnd; i++) {
        const re = new RegExp("^        class " + className + "[ {]")
        if (re.test(lines[i])) { clsStart = i; break }
    }
    if (clsStart < 0) { console.error("class " + className + " not found"); return }

    // find class end: "        }" at 8-space indent
    let clsEnd = -1
    for (let i = clsStart + 1; i < lines.length; i++) {
        if (lines[i] === "        }") { clsEnd = i; break }
    }

    // collect members: jsdoc block followed by "name: type;" or "name(args): type;"
    let pending = []
    for (let i = clsStart + 1; i <= clsEnd; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (trimmed.startsWith("/**")) {
            pending = [trimmed]
            if (trimmed.endsWith("*/") && trimmed.length > 4) {
                // single-line jsdoc
                finishMember(i, pending)
                pending = []
            }
        } else if (pending.length > 0) {
            pending.push(trimmed)
            if (trimmed === "*/") {
                finishMember(i, pending)
                pending = []
            }
        }
    }

    function finishMember(afterCommentIdx, commentLines) {
        let j = afterCommentIdx + 1
        while (j < clsEnd && lines[j].trim() === "") j++
        const member = lines[j]
        if (member) {
            const m = member.trim().match(/^(\w+)[:(]/)
            if (m) {
                const jsdoc = commentLines.slice(1)
                    .map(l => l.trim())
                    .filter(l => l !== "*/" && l !== "/**" && l !== "*" && l !== "")
                    .map(l => l.replace(/^\*\s?/, "").replace(/\*\/$/, "").trim())
                    .filter(l => l !== "")
                    .join("\n")
                    .trim()
                if (jsdoc) docs[keyPrefix + m[1]] = jsdoc
            }
        }
    }
}

extractClass("Glow", "Phaser.Filters.Glow.")
extractClass("Shadow", "Phaser.Filters.Shadow.")
extractClass("Blur", "Phaser.Filters.Blur.")
extractClass("Barrel", "Phaser.Filters.Barrel.")
extractClass("Bokeh", "Phaser.Filters.Bokeh.")
extractClass("ColorMatrix", "Phaser.Filters.ColorMatrix.")
extractClass("Blocky", "Phaser.Filters.Blocky.")
extractClass("Displacement", "Phaser.Filters.Displacement.")
extractClass("Blend", "Phaser.Filters.Blend.")
extractClass("Controller", "Phaser.Filters.Controller.")
extractClass("FilterList", "Phaser.GameObjects.Components.FilterList.")

// patch the docs DB
const db = JSON.parse(fs.readFileSync(OUT, "utf8"))
let added = 0, updated = 0
for (const [k, v] of Object.entries(docs)) {
    if (!(k in db)) added++
    else updated++
    db[k] = v
}
// remove stale Phaser.FX.* entries (v3)
for (const k of Object.keys(db)) {
    if (k.startsWith("Phaser.FX.")) delete db[k]
}
fs.writeFileSync(OUT, JSON.stringify(db, null, 1) + "\n")
console.log(`added: ${added}, updated: ${updated}, total keys now: ${Object.keys(db).length}`)
console.log("sample:", JSON.stringify(db["Phaser.Filters.Glow.outerStrength"]))
