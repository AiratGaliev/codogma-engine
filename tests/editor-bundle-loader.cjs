/**
 * Loads the compiled editor bundles (Phaser runtime + all plugins, in the
 * server's plugin.json priority order) into the current Node process with a
 * minimal DOM shim. Used by the codegen/data regression tests to exercise the
 * REAL editor classes without a browser.
 */
const fs = require("fs")
const vm = require("vm")
const path = require("path")
const noop = () => {}

const el = () => ({
    style: {}, classList: { add: noop, remove: noop }, appendChild: noop, removeChild: noop,
    setAttribute: noop, addEventListener: noop, append: noop, remove: noop,
    querySelector: () => null, querySelectorAll: () => []
})
const ctx2d = () => ({
    canvas: null, fillStyle: "", strokeStyle: "", font: "", globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: true,
    measureText: t => ({ width: String(t || "").length * 7 }),
    fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop, resetTransform: noop,
    drawImage: noop,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    setLineDash: noop, getLineDash: () => [], clip: noop, rect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, fillText: noop, strokeText: noop,
    ellipse: noop, roundRect: noop, isPointInPath: () => false
})
const canvasEl = () => Object.assign(el(), {
    width: 300, height: 150, toDataURL: () => "data:image/png;base64,",
    getContext: () => ctx2d()
})

const storage = { getItem: () => null, setItem: noop, removeItem: noop }

function autoStub() {
    const target = function () { }
    return new Proxy(target, {
        get(t, prop) {
            if (prop === Symbol.toPrimitive) return () => ""
            if (prop in t) return t[prop]
            const value = autoStub()
            t[prop] = value
            return value
        },
        set(t, prop, value) { t[prop] = value; return true },
        apply() { return autoStub() },
        construct() { return autoStub() }
    })
}

Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node", vendor: "" }, configurable: true })
global.window = {
    devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop,
    innerWidth: 1280, innerHeight: 800, navigator: globalThis.navigator,
    localStorage: storage, sessionStorage: storage, location: { href: "http://127.0.0.1:3000/editor/" },
    requestAnimationFrame: cb => setTimeout(cb, 16), setTimeout, clearTimeout,
    URL, document: null
}
global.document = {
    createElement: tag => (tag === "canvas" ? canvasEl() : el()),
    createTextNode: () => ({}), head: el(), body: el(),
    documentElement: Object.assign(el(), { firstElementChild: el() }),
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => []
}
global.window.document = global.document
global.localStorage = storage
global.sessionStorage = storage
global.requestAnimationFrame = cb => setTimeout(cb, 16)
global.location = global.window.location
global.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 0) } }
global.HTMLCanvasElement = class extends global.Image { }
global.HTMLImageElement = global.Image
global.HTMLElement = class { }
global.HTMLVideoElement = class { }
global.CanvasRenderingContext2D = class { }
global.WebGLRenderingContext = class { }
global.Blob = global.Blob || class { }
global.atob = global.atob || (b => Buffer.from(b, "base64").toString("binary"))
global.btoa = global.btoa || (s => Buffer.from(s, "binary").toString("base64"))
global.DOMParser = class { parseFromString() { return document } }
global.FileReader = class { }
global.XMLHttpRequest = class { open() { } send() { } addEventListener() { } setRequestHeader() { } }
global.CustomEvent = class { constructor(type, opts) { this.type = type; Object.assign(this, opts) } }
global.Event = class { constructor(type) { this.type = type } }
global.fetch = global.fetch || (async () => { throw new Error("no fetch in test shim") })

function loadEditorBundles(pluginsDir) {
    const nodeRequire = require

    global.require = name => {
        if (name === "Phaser") return global.Phaser
        if (name.startsWith(".")) return global.CodeMirror
        return nodeRequire(name)
    }

    vm.runInThisContext(fs.readFileSync(path.join(pluginsDir, "phasereditor2d.phaser/scripts/phaser.min.js"), "utf8"), { filename: "phaser.min.js" })

    global.CodeMirror = autoStub()
    global.CodeMirror.modeInfo = []

    const plugins = []
    for (const d of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const pj = path.join(pluginsDir, d.name, "plugin.json")
        if (!fs.existsSync(pj)) continue
        try {
            plugins.push({ folder: d.name, meta: JSON.parse(fs.readFileSync(pj, "utf8")) })
        } catch (e) { /* ignore bad manifest */ }
    }
    plugins.sort((a, b) => {
        const pa = a.meta.priority ?? 0, pb = b.meta.priority ?? 0
        return pa !== pb ? pa - pb : a.folder.localeCompare(b.folder)
    })

    const chain = []
    for (const { folder, meta } of plugins) {
        for (const s of (meta.scripts || [])) {
            const rel = folder + "/" + s
            if (s.endsWith(".js") && !chain.includes(rel)) chain.push(rel)
        }
    }
    for (const f of chain) {
        vm.runInThisContext(fs.readFileSync(path.join(pluginsDir, f), "utf8"), { filename: f })
    }
    return chain.length
}

module.exports = { loadEditorBundles }
