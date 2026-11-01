/**
 * Codogma Engine — MCP Server + Editor Bridge.
 *
 * Mirrors the official Phaser Editor v5 MCP integration
 * (github.com/phaserjs/editor-mcp-server + docs.phaser.io/phaser-editor/ai/mcp-server):
 *
 *   - POST /editor/mcp          Model Context Protocol (Streamable HTTP, JSON-RPC 2.0)
 *   - GET  /editor/mcp-bridge/events   SSE channel to the running editor client
 *   - POST /editor/mcp-bridge/result   editor client posts command results back
 *   - POST /editor/mcp-bridge   official-style bridge entry: { tool, args } -> result
 *                               (used by server/mcp-stdio.mjs and the AI Chat)
 *
 * Tools that operate purely on project files are executed server-side.
 * Tools that need the running editor UI (open scene, screenshots, active scene)
 * are forwarded to the editor over the SSE bridge — exactly like the official
 * server forwards to the desktop editor instance.
 */

import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import crypto from "crypto"
import { parseImageSize } from "./imgsize.mjs"
import { ensureProjectDirectorySafely, ensureProjectDirectorySafelySync, openSafeProjectFileForWrite, readFileSafely, readProjectDirectoryEntriesSafelySync, removeProjectEntrySafely, writeFileSafely, writeNewFileSafely, statProjectFileSafely } from "./path-security.mjs"

let PROJECT_DIR = null
let log = () => {}

export function initMcp(options) {
    PROJECT_DIR = options.projectDir
    log = options.log || (() => {})
}

/** Official asset tools pass `{ texture: { key, frame } }`; accept flat `{ key }` too. */
function textureKeyOf(args) {
    const key = args.key ?? args.texture?.key
    if (typeof key !== "string" || key.trim().length === 0) {
        throw new Error('Missing or invalid texture key: pass a non-empty string as { "key" } or { "texture": { "key" } }.')
    }
    return key
}

/* ============================== path helpers ============================== */

function isWithinRealBase(base, target) {
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

function safeJoin(base, relPath) {
    if (typeof relPath !== "string") return null

    const p = path.resolve(base, "." + path.sep + relPath.replace(/^[\\/]+/, ""))
    if (p !== base && !p.startsWith(base + path.sep)) return null

    // Prevent a project-local symlink from escaping the selected project root.
    try {
        if (!isWithinRealBase(base, p)) return null
    } catch {
        return null
    }

    return p
}

/**
 * Client file paths include the project root folder name as the first
 * segment ("test-typescript/scenes/Level.scene"); normalize them.
 */
function normPath(p) {
    if (typeof p !== "string" || p.length === 0) return p
    const parts = p.split(/[\\/]/).filter(Boolean)
    if (parts.length > 1 && parts[0] === path.basename(PROJECT_DIR)) {
        return parts.slice(1).join("/")
    }
    return p
}

function walkFiles(dir, relPrefix, out = []) {
    const entries = readProjectDirectoryEntriesSafelySync(PROJECT_DIR, dir)
    if (!entries) return out

    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const rel = relPrefix ? relPrefix + "/" + entry.name : entry.name
        const full = path.join(dir, entry.name)
        if (entry.isDirectory) walkFiles(full, rel, out)
        else if (entry.isFile) out.push(rel)
    }
    return out
}

/* ============================== scene helpers ============================= */

function sceneFiles() {
    return walkFiles(PROJECT_DIR, "").filter(f => f.toLowerCase().endsWith(".scene"))
}

function readSceneFile(rel) {
    const full = safeJoin(PROJECT_DIR, rel)
    if (!full) return null
    try {
        return JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 4 * 1024 * 1024))
    } catch (e) {
        return null
    }
}

function writeSceneFile(rel, data, options = {}) {
    const full = safeJoin(PROJECT_DIR, rel)
    if (!full) throw new Error("invalid scene path: " + rel)
    if (!ensureProjectDirectorySafelySync(PROJECT_DIR, path.dirname(full))) throw new Error("invalid scene path: " + rel)
    const serialized = JSON.stringify(data, null, 4)
    const written = options.exclusive
        ? writeNewFileSafely(PROJECT_DIR, full, serialized)
        : writeFileSafely(PROJECT_DIR, full, serialized)
    if (!written) {
        throw new Error(options.exclusive
            ? "scene file already exists or cannot be created safely: " + rel
            : "invalid scene path: " + rel)
    }
    notifyFilesChanged()
}

/** Tell all connected editor sessions that project files changed on disk. */
function notifyFilesChanged() {
    const payload = "event: files-changed\ndata: {}\n\n"
    for (const client of bridgeClients.values()) {
        try { client.res.write(payload) } catch (e) { removeBridgeClient(client.clientId, client) }
    }
}

function newSceneDoc(name) {
    return {
        id: crypto.randomUUID(),
        sceneType: "SCENE",
        settings: {
            preloadPackFiles: [],
            createMethodName: "editorCreate",
            sceneKey: name,
            compilerOutputLanguage: "TYPE_SCRIPT"
        },
        displayList: [],
        plainObjects: [],
        meta: {
            app: "Codogma Engine - Scene Editor",
            url: "https://codogma.com",
            contentType: "phasereditor2d.core.scene.SceneContentType",
            version: 5
        }
    }
}

/**
 * Resolve a scene by scenePath / sceneId / sceneKey (like the official tools
 * which use the scene `id`, while also accepting friendlier references).
 */
function resolveScene(args) {
    const scenes = sceneFiles()
    if (args.scenePath) {
        const rel = normPath(args.scenePath)
        const found = scenes.find(f => f === rel || f === rel + ".scene" || f.replace(/\.scene$/, "") === rel.replace(/\.scene$/, ""))
        if (found) return { file: found, doc: readSceneFile(found) }
    }
    if (args.sceneId) {
        for (const f of scenes) {
            const doc = readSceneFile(f)
            if (doc && doc.id === args.sceneId) return { file: f, doc }
        }
    }
    if (args.sceneKey || args.sceneName) {
        const key = args.sceneKey || args.sceneName
        const found = scenes.find(f => path.basename(f, ".scene") === key)
        if (found) return { file: found, doc: readSceneFile(found) }
    }
    if (scenes.length === 1) return { file: scenes[0], doc: readSceneFile(scenes[0]) }
    return null
}

function requireScene(args) {
    const r = resolveScene(args)
    if (!r || !r.doc) throw new Error(`Scene not found. Provide "sceneId", "scenePath" ("scenes/MyScene.scene") or "sceneKey". Available scenes: ${sceneFiles().join(", ") || "(none)"}`)
    return r
}

const OBJECT_TYPES = [
    "Image", "Sprite", "Text", "BitmapText", "Container", "Layer", "TileSprite",
    "NineSlice", "ThreeSlice", "Rectangle", "Ellipse", "Triangle", "Polygon",
    "ParticleEmitter", "Tilemap", "TilemapLayer", "ScriptNode", "SpineGameObject", "Video"
]

const TEXTURE_TYPES = new Set(["Image", "Sprite", "TileSprite", "NineSlice", "ThreeSlice"])

// Keep the upstream MCP argument names, but serialize them using the names
// actually consumed by the current Codogma ArcadeComponent implementation.
const ARCADE_PROPERTY_ALIASES = {
    "Arcade.active": "ArcadeComponent.active",
    "body.physicsType": "physicsType",
    "body.geometry": "bodyGeometry",
    "body.radius": "radius",
    "body.allowGravity": "allowGravity",
    "body.immovable": "immovable",
    "body.mass": "mass",
    "body.collideWorldBounds": "collideWorldBounds",
    "body.angularVelocity": "angularVelocity",
    "body.angularAcceleration": "angularAcceleration",
    "body.angularDrag": "angularDrag",
    "body.maxAngular": "maxAngular",
    "body.enable": "enable",
    "body.moves": "moves",
    "body.maxSpeed": "maxSpeed",
    "body.useDamping": "useDamping",
    "body.allowDrag": "allowDrag",
    "body.onWorldBounds": "onWorldBounds",
    "body.allowRotation": "allowRotation",
    "body.pushable": "pushable",
    "body.overlapX": "overlapX",
    "body.overlapY": "overlapY",
    "body.overlapR": "overlapR"
}

function setSceneObjectProperty(obj, name, value) {
    obj[ARCADE_PROPERTY_ALIASES[name] ?? name] = value
}

const ARCADE_CAPABLE_TYPES = new Set([
    "Image", "Sprite", "BitmapText", "Container", "TileSprite", "NineSlice", "ThreeSlice",
    "Text", "Rectangle", "Ellipse", "Triangle", "Polygon", "SpineGameObject",
    "ArcadeImage", "ArcadeSprite"
])

const TYPE_PROPERTY_KEYS = {
    Sprite: [
        "animationPlayMethod", "animationKey", "animationCustomConfig",
        "animationFrameRate", "animationDelay", "animationRepeat", "animationRepeatDelay",
        "animationYoyo", "animationShowBeforeDelay", "animationShowOnStart",
        "animationHideOnComplete", "animationStartFrame", "animationTimeScale"
    ],
    TileSprite: ["tilePositionX", "tilePositionY", "tileScaleX", "tileScaleY"],
    NineSlice: ["leftWidth", "rightWidth", "topHeight", "bottomHeight"],
    ThreeSlice: ["leftWidth", "rightWidth"],
    Text: [
        "fixedWidth", "fixedHeight", "paddingLeft", "paddingTop", "paddingRight", "paddingBottom",
        "baselineX", "baselineY", "wordWrapUseAdvanced"
    ],
    BitmapText: ["font", "dropShadowX", "dropShadowY", "dropShadowAlpha", "dropShadowColor"],
    Ellipse: ["smoothness"],
    Triangle: ["x1", "y1", "x2", "y2", "x3", "y3"],
    Polygon: ["points"],
    Video: ["url", "loop", "mute", "autoplay"],
    ParticleEmitter: [
        "configTexture", "configFrame", "blendMode", "colorEase", "tintFill", "duration",
        "stopAfter", "frequency", "timeScale", "gravityX", "gravityY", "radial",
        "maxAliveParticles", "maxParticles", "advance", "particleBringToTop", "sortOrderAsc",
        "sortProperty", "follow", "trackVisible", "previewAdvance", "previewActive", "animationKey",
        ...["x", "y", "moveToX", "moveToY", "scale", "scaleX", "scaleY", "angle", "rotate",
            "accelerationX", "accelerationY", "maxVelocityX", "maxVelocityY", "speed", "speedX",
            "speedY", "delay", "hold", "lifespan", "quantity", "tint", "alpha", "color"]
            .flatMap(name => ["_type", "_value", "_values", "_start", "_end", "_randomFlag",
                "_random", "_interpolation", "_ease", "_steps", "_yoyo", "_min", "_max",
                "_int", "_onEmit", "_onUpdate"].map(suffix => name + suffix))
    ]
}

const PARTICLE_EMITTER_PROPERTY_SETS = [
    "x", "y", "moveToX", "moveToY", "scale", "scaleX", "scaleY", "angle", "rotate",
    "accelerationX", "accelerationY", "maxVelocityX", "maxVelocityY", "speed", "speedX",
    "speedY", "delay", "hold", "lifespan", "quantity", "tint", "alpha", "color"
]

const PARTICLE_EMITTER_SIMPLE_KEYS = [
    "blendMode", "colorEase", "tintFill", "duration", "stopAfter", "frequency", "timeScale",
    "gravityX", "gravityY", "radial", "maxAliveParticles", "maxParticles", "advance",
    "particleBringToTop", "sortOrderAsc", "sortProperty", "follow", "trackVisible", "animationKey"
]

function setParticleEmitterOperation(target, name, value) {
    if (value === undefined || value === null) return
    const prefix = name + "_"

    if (Array.isArray(value)) {
        target[prefix + "type"] = "Random"
        target[prefix + "random"] = value
        return
    }

    if (typeof value !== "object") {
        target[prefix + "type"] = "Static"
        target[prefix + "value"] = value
        return
    }

    const type = value.type
    if (type === "None") return

    if (type === "Static" || Object.hasOwn(value, "value")) {
        target[prefix + "type"] = "Static"
        if (value.value !== undefined) target[prefix + "value"] = value.value
    } else if (type === "Random" || Array.isArray(value.random)) {
        target[prefix + "type"] = "Random"
        if (value.random !== undefined) target[prefix + "random"] = value.random
    } else if (type === "Interpolation" || Object.hasOwn(value, "values")) {
        target[prefix + "type"] = "Interpolation"
        if (value.values !== undefined) target[prefix + "values"] = value.values
        if (value.interpolation !== undefined) target[prefix + "interpolation"] = value.interpolation
        if (value.ease !== undefined) target[prefix + "ease"] = value.ease
    } else if (type === "Stepped" || Object.hasOwn(value, "steps")) {
        target[prefix + "type"] = "Stepped"
        for (const key of ["steps", "start", "end", "yoyo"]) {
            if (value[key] !== undefined) target[prefix + key] = value[key]
        }
    } else if (type === "MinMax" || Object.hasOwn(value, "min") || Object.hasOwn(value, "max")) {
        target[prefix + "type"] = "MinMax"
        for (const key of ["min", "max", "int"]) {
            if (value[key] !== undefined) target[prefix + key] = value[key]
        }
    } else if (type === "StartEndRandom" || Object.hasOwn(value, "start") || Object.hasOwn(value, "end")) {
        target[prefix + "type"] = "StartEndRandom"
        for (const key of ["start", "end", "ease", "randomFlag"]) {
            if (value[key] !== undefined) target[prefix + key] = value[key]
        }
        if (value.random !== undefined && value.randomFlag === undefined) {
            target[prefix + "randomFlag"] = value.random
        }
    } else if (type === "CustomUpdate" || Object.hasOwn(value, "onUpdate")) {
        target[prefix + "type"] = "CustomUpdate"
        if (value.onEmit !== undefined) target[prefix + "onEmit"] = value.onEmit
        if (value.onUpdate !== undefined) target[prefix + "onUpdate"] = value.onUpdate
    } else if (type === "CustomEmit" || Object.hasOwn(value, "onEmit")) {
        target[prefix + "type"] = "CustomEmit"
        target[prefix + "onEmit"] = value.onEmit
    } else {
        throw new Error(`Unsupported ParticleEmitter operation type for "${name}".`)
    }
}

function applyParticleEmitterConfig(target, props) {
    const config = props.config && typeof props.config === "object" && !Array.isArray(props.config)
        ? props.config
        : {}

    const texture = props.texture ?? config.texture
    if (typeof texture === "string") {
        target.configTexture = texture
    } else if (texture && typeof texture === "object" && typeof texture.key === "string") {
        target.configTexture = texture.key
        if (texture.frame !== undefined && texture.frame !== null) {
            target.configFrame = Array.isArray(texture.frame) ? texture.frame : [texture.frame]
        }
    }
    if (typeof config.configTexture === "string") target.configTexture = config.configTexture

    const frame = props.frame ?? config.frame ?? config.configFrame
    if (frame !== undefined) {
        target.configFrame = Array.isArray(frame) ? frame : (frame === null ? [] : [frame])
    }

    const aliases = {
        _duration: "duration",
        _stopAfter: "stopAfter",
        _frequency: "frequency",
        _timeScale: "timeScale",
        _maxAliveParticles: "maxAliveParticles",
        _maxParticles: "maxParticles",
        _advance: "advance"
    }

    for (const [key, value] of Object.entries(config)) {
        if (key === "texture" || key === "frame" || key === "configTexture" || key === "configFrame") continue
        if (key === "_anim") {
            if (typeof value === "string") target.animationKey = value
            else if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") target.animationKey = value[0]
            else if (Array.isArray(value) && value.length > 1) {
                throw new Error("This Codogma Editor build supports one ParticleEmitter animationKey; multiple _anim entries are not supported.")
            }
            continue
        }
        const name = aliases[key] ?? key
        if (PARTICLE_EMITTER_PROPERTY_SETS.includes(name)) {
            setParticleEmitterOperation(target, name, value)
        } else if (PARTICLE_EMITTER_SIMPLE_KEYS.includes(name) && value !== undefined) {
            target[name] = value
        }
    }
}

function genLabel(doc, type) {
    const base = type.charAt(0).toLowerCase() + type.slice(1)
    const existing = new Set()
    const visit = list => (list || []).forEach(o => {
        existing.add(o.label)
        ;(o.children || []).forEach(c => existing.add(c.label))
    })
    visit(doc.displayList)
    let i = 1
    while (existing.has(base + "_" + i)) i++
    return base + "_" + i
}

/** Map MCP object properties to the Codogma Engine scene JSON object. */
function buildObjectJson(type, props, doc) {
    const obj = {
        type,
        id: crypto.randomUUID(),
        label: props.label || genLabel(doc, type)
    }
    if (props.scope) obj.scope = props.scope
    if (props.prefabId) {
        obj.prefabId = props.prefabId
        if (props.unlock) obj.unlock = props.unlock
        if (props.prefabProps) Object.assign(obj, props.prefabProps)
    }
    if (props.allowAppendChildren !== undefined) obj.allowAppendChildren = props.allowAppendChildren

    const copyKeys = [
        "x", "y", "scaleX", "scaleY", "angle", "originX", "originY",
        "flipX", "flipY", "visible", "alpha", "alphaTopLeft", "alphaTopRight",
        "alphaBottomLeft", "alphaBottomRight", "tintFill", "tintTopLeft",
        "tintTopRight", "tintBottomLeft", "tintBottomRight", "blendMode",
        "text", "fontFamily", "fontSize", "fontStyle", "color", "stroke",
        "strokeThickness", "backgroundColor", "paddingX", "paddingY", "align",
        "wordWrap", "wordWrapWidth", "lineSpacing", "maxLines", "resolution",
        "letterSpacing", "displayWidth", "displayHeight", "width", "height",
        "radius", "isFilled", "isStroked", "fillColor", "fillAlpha", "strokeColor", "strokeAlpha",
        "strokeWidth", "lineWidth",
        "list", "scrollFactorX", "scrollFactorY",
        "dataKey", "atlasKey", "skinName", "bpType", "bpSkin", "bpAnimation", "bpTimeStep",
        "animationMixes", "defaultMix", "timeScale",
        "skeleton", "skin", "animation", "boundsProviderType",
        "fixedWidth", "fixedHeight", "paddingLeft", "paddingTop", "paddingRight", "paddingBottom",
        "baselineX", "baselineY", "wordWrapUseAdvanced",
        "dropShadowX", "dropShadowY", "dropShadowAlpha", "dropShadowColor",
        "tilePositionX", "tilePositionY", "tileScaleX", "tileScaleY",
        "leftWidth", "rightWidth", "topHeight", "bottomHeight",
        "smoothness", "x1", "y1", "x2", "y2", "x3", "y3", "points",
        "font", "url", "loop", "mute", "autoplay"
    ]
    for (const k of copyKeys) {
        if (props[k] !== undefined) obj[k] = props[k]
    }
    for (const k of TYPE_PROPERTY_KEYS[type] || []) {
        if (props[k] !== undefined) obj[k] = props[k]
    }

    if (type === "ParticleEmitter") {
        applyParticleEmitterConfig(obj, props)
    }

    // Spine game object: auto-generate a label from the data key if omitted
    if (type === "SpineGameObject") {
        if (!props.label && props.dataKey) obj.label = props.dataKey + "_1"
    }

    if (props.texture && TEXTURE_TYPES.has(type)) {
        obj.texture = { key: props.texture.key }
        if (props.texture.frame !== undefined && props.texture.frame !== null) {
            obj.texture.frame = props.texture.frame
        }
    }

    if (props.hitArea && typeof props.hitArea === "object" && !Array.isArray(props.hitArea)) {
        const allowedHitAreaKeys = new Set([
            "shape", "x", "y", "width", "height", "radius", "points", "alphaTolerance"
        ])
        for (const [key, value] of Object.entries(props.hitArea)) {
            if (allowedHitAreaKeys.has(key) && value !== undefined) {
                obj[`hitArea.${key}`] = value
            }
        }
    }

    if (type === "Text" && props.style) {
        // Allow `style: {...}` shorthand as well as flat props, but map
        // nested style members to the editor's persisted dotted properties.
        const style = { ...props.style }
        if (style.shadow && typeof style.shadow === "object" && !Array.isArray(style.shadow)) {
            for (const [key, value] of Object.entries(style.shadow)) {
                obj[`shadow.${key}`] = value
            }
            delete style.shadow
        }
        if (style.padding && typeof style.padding === "object" && !Array.isArray(style.padding)) {
            for (const key of ["left", "top", "right", "bottom"]) {
                if (style.padding[key] !== undefined) obj[`padding${key[0].toUpperCase()}${key.slice(1)}`] = style.padding[key]
            }
            delete style.padding
        }
        for (const [k, v] of Object.entries(style)) obj[k] = v
    }
    if (type === "Text" && props.shadow && typeof props.shadow === "object" && !Array.isArray(props.shadow)) {
        for (const [key, value] of Object.entries(props.shadow)) obj[`shadow.${key}`] = value
    }

    // component activation + dotted component properties pass-through
    const componentKeys = [
        "Arcade.active", "ArcadeComponent.active",
        "body.physicsType", "body.geometry", "body.radius", "body.width", "body.height",
        "body.offset.x", "body.offset.y",
        "body.velocity.x", "body.velocity.y", "body.maxVelocity.x", "body.maxVelocity.y",
        "body.acceleration.x", "body.acceleration.y", "body.drag.x", "body.drag.y",
        "body.bounce.x", "body.bounce.y", "body.gravity.x", "body.gravity.y",
        "body.allowGravity", "body.immovable", "body.mass", "body.collideWorldBounds",
        "body.angularVelocity", "body.angularAcceleration", "body.angularDrag",
        "body.maxAngular", "body.enable", "body.moves", "body.maxSpeed",
        "body.friction.x", "body.friction.y", "body.useDamping", "body.allowDrag",
        "body.onWorldBounds", "body.allowRotation", "body.pushable",
        "body.checkCollision.none", "body.checkCollision.up", "body.checkCollision.down",
        "body.checkCollision.left", "body.checkCollision.right",
        "body.overlapX", "body.overlapY", "body.overlapR",
        "ScrollFactorX", "ScrollFactorY",
        "hitArea.shape", "hitArea.x", "hitArea.y", "hitArea.width", "hitArea.height",
        "hitArea.radius", "hitArea.points", "hitArea.alphaTolerance"
    ]
    for (const k of componentKeys) {
        if (props[k] !== undefined) setSceneObjectProperty(obj, k, props[k])
    }

    // arcade shortcut: props.arcade = {...} enables the editor's ArcadeComponent.
    if (props.arcade && typeof props.arcade === "object") {
        setSceneObjectProperty(obj, "Arcade.active", true)
        const map = {
            physicsType: "body.physicsType", geometry: "body.geometry", radius: "body.radius",
            width: "body.width", height: "body.height",
            velocityX: "body.velocity.x", velocityY: "body.velocity.y",
            maxVelocityX: "body.maxVelocity.x", maxVelocityY: "body.maxVelocity.y",
            accelerationX: "body.acceleration.x", accelerationY: "body.acceleration.y",
            dragX: "body.drag.x", dragY: "body.drag.y",
            bounceX: "body.bounce.x", bounceY: "body.bounce.y",
            gravityX: "body.gravity.x", gravityY: "body.gravity.y",
            frictionX: "body.friction.x", frictionY: "body.friction.y",
            offsetX: "body.offset.x", offsetY: "body.offset.y",
            collideWorldBounds: "body.collideWorldBounds", immovable: "body.immovable",
            allowGravity: "body.allowGravity", moves: "body.moves", maxSpeed: "body.maxSpeed",
            mass: "body.mass", enable: "body.enable", useDamping: "body.useDamping",
            allowDrag: "body.allowDrag", onWorldBounds: "body.onWorldBounds",
            allowRotation: "body.allowRotation", pushable: "body.pushable",
            angularVelocity: "body.angularVelocity", angularAcceleration: "body.angularAcceleration",
            angularDrag: "body.angularDrag", maxAngular: "body.maxAngular",
            overlapX: "body.overlapX", overlapY: "body.overlapY", overlapR: "body.overlapR",
            checkCollisionNone: "body.checkCollision.none",
            checkCollisionUp: "body.checkCollision.up",
            checkCollisionDown: "body.checkCollision.down",
            checkCollisionLeft: "body.checkCollision.left",
            checkCollisionRight: "body.checkCollision.right"
        }
        for (const [k, v] of Object.entries(props.arcade)) {
            if (!Object.hasOwn(map, k)) {
                throw new Error(`Unsupported arcade shortcut property: "${k}".`)
            }
            setSceneObjectProperty(obj, map[k], v)
        }
    }

    // user components
    if (Array.isArray(props.components) && props.components.length > 0) {
        obj.components = props.components
    }
    // any other dotted component property (e.g. "PushOnClick.pushScale")
    for (const [k, v] of Object.entries(props)) {
        if (k.includes(".") && !componentKeys.includes(k) && !k.endsWith(".active")) {
            obj[k] = v
            const compId = k.split(".")[0]
            if (!obj.components) obj.components = []
            if (!obj.components.includes(compId) && !["body", "Arcade", "ScrollFactorX", "ScrollFactorY"].includes(compId)) {
                obj.components.push(compId)
            }
        }
    }

    return obj
}

function flatObjects(doc) {
    const out = []
    const visit = (list, parent) => (list || []).forEach(o => {
        out.push({ obj: o, parent })
        visit(o.children, o)
    })
    visit(doc.displayList, null)
    return out
}

function findObjects(doc, ids, labels) {
    const idSet = new Set(ids || [])
    const labelSet = new Set(labels || [])
    return flatObjects(doc).filter(({ obj }) => idSet.has(obj.id) || (labelSet.has(obj.label)))
}

function cleanPublic(objJson) {
    // return a copy of the scene object data without internal-only noise
    const copy = JSON.parse(JSON.stringify(objJson))
    return copy
}

/* ============================== asset helpers ============================= */

function findAssetPacks() {
    return walkFiles(PROJECT_DIR, "").filter(f => /pack.*\.json$/i.test(f) || f.toLowerCase().endsWith("asset-pack.json"))
}

function parseAssetPacks() {
    const packs = []
    for (const rel of findAssetPacks()) {
        try {
            const full = safeJoin(PROJECT_DIR, rel)
            if (!full) continue
            const data = JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 8 * 1024 * 1024))
            const entries = []
            for (const section of Object.values(data)) {
                if (section && Array.isArray(section.files)) {
                    for (const e of section.files) entries.push(e)
                }
            }
            packs.push({ file: rel, entries })
        } catch (e) { /* ignore broken packs */ }
    }
    return packs
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"])

/* ================================ tools ================================== */

const TOOLS = new Map()

function defTool(name, description, inputSchema, exec) {
    TOOLS.set(name, { name, description, inputSchema, exec })
}

const sceneIdProps = {
    sceneId: { type: "string", description: "The `id` of the scene (from ide-get-all-scenes-in-project / scene-get-scene-data)." },
    scenePath: { type: "string", description: "Alternative to sceneId: project-relative path of the scene file, e.g. 'scenes/Level.scene'." },
    sceneKey: { type: "string", description: "Alternative to sceneId: the scene key (file name without extension)." }
}
const sceneIdSchema = {
    type: "object",
    properties: sceneIdProps,
    anyOf: [{ required: ["sceneId"] }, { required: ["scenePath"] }, { required: ["sceneKey"] }]
}

/* ------------------------------- IDE tools ------------------------------- */

defTool(
    "ide-get-all-scenes-in-project",
    "Get all scenes in the project.",
    { type: "object", properties: {} },
    async () => {
        const scenes = sceneFiles().map(f => ({
            scenePath: f,
            sceneKey: path.basename(f, ".scene"),
            id: (readSceneFile(f) || {}).id
        }))
        return text(JSON.stringify({ scenes }, null, 2))
    }
)

defTool(
    "ide-create-new-scene",
    "Create a new scene file. This tool only creates the scene file. If the user wants to show the scene in the game, add the scene to the game instance (e.g. game.scene.add(...) in main.ts/game.js).",
    {
        type: "object",
        properties: {
            name: { type: "string", description: "The name of the scene file. It is not a full path, just the name. The extension will be added automatically." },
            folder: { type: "string", description: "Optional project-relative folder, default 'scenes'." }
        },
        required: ["name"]
    },
    async ({ name, folder }) => {
        const clean = String(name).replace(/\.scene$/i, "").replace(/[^\w-]/g, "_")
        const dir = normPath(folder || "scenes")
        const rel = path.posix.join(dir, clean + ".scene")
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error("invalid folder")
        writeSceneFile(rel, newSceneDoc(clean), { exclusive: true })
        return text(`Scene file created: ${rel} (sceneKey "${clean}")`)
    }
)

defTool(
    "ide-get-active-scene",
    "Get the scene that has the focus in the editor (the scene the user is working on). May fail if no scene editor is open.",
    { type: "object", properties: {} },
    async () => forwardToEditor("ide-get-active-scene", {})
)

defTool(
    "ide-open-scene",
    "Open the scene in the editor.",
    {
        type: "object",
        properties: { ...sceneIdProps },
        anyOf: [{ required: ["sceneId"] }, { required: ["scenePath"] }, { required: ["sceneKey"] }]
    },
    async (args) => {
        const { file } = requireScene(args)
        return forwardToEditor("ide-open-scene", { scenePath: file })
    }
)

defTool(
    "ide-save-scene",
    "Save the editor of the given scene. When the scene is saved, the editor generates its code. Use this to sync scene content and code after editing the scene through the editor UI.",
    {
        type: "object",
        properties: { ...sceneIdProps },
        anyOf: [{ required: ["sceneId"] }, { required: ["scenePath"] }, { required: ["sceneKey"] }]
    },
    async (args) => {
        const { file } = requireScene(args)
        return forwardToEditor("ide-save-scene", { scenePath: file })
    }
)

/* ------------------------------ Scene tools ------------------------------ */

defTool(
    "scene-get-scene-data",
    "Get all objects in the given scene, including their properties.",
    sceneIdSchema,
    async (args) => {
        const { file, doc } = requireScene(args)
        return text(JSON.stringify({
            sceneId: doc.id,
            sceneKey: doc.settings?.sceneKey,
            scenePath: file,
            sceneType: doc.sceneType,
            settings: doc.settings,
            objects: (doc.displayList || []).map(cleanPublic),
            plainObjects: doc.plainObjects || [],
            lists: doc.lists || [],
            prefabProperties: doc.prefabProperties || []
        }, null, 2))
    }
)

defTool(
    "scene-get-objects-data",
    "Get the data of the given objects.",
    {
        type: "object",
        properties: { ...sceneIdProps, objectIds: { type: "array", items: { type: "string" }, description: "The ids (or labels) of the objects." } },
        required: ["objectIds"]
    },
    async (args) => {
        const { doc } = requireScene(args)
        const found = findObjects(doc, args.objectIds, args.objectIds)
        return text(JSON.stringify({ objects: found.map(f => cleanPublic(f.obj)) }, null, 2))
    }
)

defTool(
    "scene-get-scene-dimension",
    "Get the dimensions of the given scene.",
    sceneIdSchema,
    async (args) => {
        const { doc } = requireScene(args)
        return text(JSON.stringify({
            sceneKey: doc.settings?.sceneKey,
            sceneWidth: doc.settings?.sceneWidth ?? 800,
            sceneHeight: doc.settings?.sceneHeight ?? 600
        }, null, 2))
    }
)

defTool(
    "scene-clear-scene",
    "Clear all objects of the given scene.",
    sceneIdSchema,
    async (args) => {
        const { file, doc } = requireScene(args)
        const count = (doc.displayList || []).length
        doc.displayList = []
        doc.plainObjects = doc.plainObjects || []
        writeSceneFile(file, doc)
        return text(`Scene "${doc.settings?.sceneKey}" cleared (${count} objects removed).`)
    }
)

defTool(
    "scene-add-game-objects",
    "Add multiple new game objects to the scene. First call `get-system-instructions` to learn the properties of each game object type. If adding prefab instances, include the `unlock` array with the names of the properties you are setting.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objects: {
                type: "array",
                description: "The objects to add.",
                items: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: OBJECT_TYPES, description: "The type of the game object." },
                        properties: { type: "object", description: "The properties of the game object (label, x, y, texture, text, body.*, ...)." }
                    },
                    required: ["type", "properties"]
                }
            }
        },
        required: ["objects"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const added = []
        for (const entry of args.objects) {
            if (!OBJECT_TYPES.includes(entry.type)) throw new Error(`Unknown game object type "${entry.type}". Supported: ${OBJECT_TYPES.join(", ")}`)
            const obj = buildObjectJson(entry.type, entry.properties || {}, doc)
            doc.displayList = doc.displayList || []
            doc.displayList.push(obj)
            added.push({ id: obj.id, label: obj.label, type: entry.type })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ added }, null, 2))
    }
)

defTool(
    "scene-update-game-objects",
    "Update multiple game objects of the scene. Provide the object `id` (or `label`) and the subset of properties to update. For prefab instances include the `unlock` array with the properties being set.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objects: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "The id (or label) of the object to update." },
                        properties: { type: "object", description: "The properties to update." }
                    },
                    required: ["id", "properties"]
                }
            }
        },
        required: ["objects"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const updated = []
        for (const entry of args.objects) {
            const found = findObjects(doc, [entry.id], [entry.id])
            if (found.length === 0) throw new Error(`Object not found: ${entry.id}`)
            const obj = found[0].obj
            // preserve the existing label unless the update explicitly sets a new one
            const props = { ...entry.properties }
            if (props.label === undefined) props.label = obj.label
            const patch = buildObjectJson(obj.type, props, doc)
            if (entry.properties && entry.properties.unlock) obj.unlock = entry.properties.unlock
            for (const [k, v] of Object.entries(patch)) {
                if (["id", "type"].includes(k)) continue
                if (k === "label" && obj.label !== v) obj.label = v
                else obj[k] = v
            }
            updated.push({ id: obj.id, label: obj.label })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ updated }, null, 2))
    }
)

defTool(
    "scene-delete-game-objects",
    "Delete the given game objects from the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objectIds: { type: "array", items: { type: "string" }, description: "The ids (or labels) of the objects to delete." }
        },
        required: ["objectIds"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const idSet = new Set()
        const collect = (ids) => {
            for (const id of ids) {
                const found = flatObjects(doc).filter(({ obj }) => obj.id === id || obj.label === id)
                found.forEach(({ obj }) => {
                    idSet.add(obj.id)
                    flatObjects(obj.children || []).forEach(({ obj: c }) => idSet.add(c.id))
                })
            }
        }
        collect(args.objectIds || [])
        const removeList = list => {
            const arr = list || []
            for (let i = arr.length - 1; i >= 0; i--) {
                if (idSet.has(arr[i].id)) arr.splice(i, 1)
                else removeList(arr[i].children)
            }
        }
        removeList(doc.displayList)
        writeSceneFile(file, doc)
        return text(`Deleted ${idSet.size} object(s).`)
    }
)

defTool(
    "scene-move-game-object-in-render-list",
    "Sort objects in the render list of the scene (change depth order).",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objectIds: { type: "array", items: { type: "string" } },
            move: { type: "string", enum: ["Up", "Down", "Top", "Bottom"] }
        },
        required: ["objectIds", "move"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const list = doc.displayList
        for (const id of args.objectIds) {
            const i = list.findIndex(o => o.id === id || o.label === id)
            if (i === -1) continue
            const [obj] = list.splice(i, 1)
            let j = i
            if (args.move === "Up") j = Math.min(i + 1, list.length)
            else if (args.move === "Down") j = Math.max(i - 1, 0)
            else if (args.move === "Top") j = list.length
            else if (args.move === "Bottom") j = 0
            list.splice(j, 0, obj)
        }
        writeSceneFile(file, doc)
        return text("Render list updated.")
    }
)

defTool(
    "scene-move-game-objects-to-parent",
    "Move the given objects to the given parent container (or to the scene root if no parent given).",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objectIds: { type: "array", items: { type: "string" } },
            parentId: { type: "string", description: "The id (or label) of the parent container. Omit to move to the scene root." }
        },
        required: ["objectIds"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        let parent = null
        if (args.parentId) {
            const found = findObjects(doc, [args.parentId], [args.parentId])
            if (!found.length) throw new Error(`Parent not found: ${args.parentId}`)
            parent = found[0].obj
            if (parent.type !== "Container" && parent.type !== "Layer") throw new Error("Parent must be a Container or Layer")
        }
        const targetList = parent ? (parent.children = parent.children || []) : doc.displayList
        const moved = []
        for (const id of args.objectIds) {
            const i = doc.displayList.findIndex(o => o.id === id || o.label === id)
            if (i === -1) continue
            if (parent) {
                const obj = doc.displayList[i]
                // convert absolute position to parent-relative
                obj.x = (obj.x || 0) - (parent.x || 0)
                obj.y = (obj.y || 0) - (parent.y || 0)
                targetList.push(obj)
                doc.displayList.splice(i, 1)
            }
            moved.push(id)
        }
        writeSceneFile(file, doc)
        return text(`Moved ${moved.length} object(s).`)
    }
)

defTool(
    "scene-pack-objects-in-container",
    "Create a container grouping the given objects. The container and objects are re-positioned so the container bounds are minimal.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objectIds: { type: "array", items: { type: "string" } },
            label: { type: "string", description: "Optional label of the new container." }
        },
        required: ["objectIds"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const found = findObjects(doc, args.objectIds, args.objectIds)
        if (found.length === 0) throw new Error("No objects found to pack")
        let minX = Infinity, minY = Infinity
        for (const { obj } of found) {
            minX = Math.min(minX, obj.x || 0)
            minY = Math.min(minY, obj.y || 0)
        }
        const container = {
            type: "Container",
            id: crypto.randomUUID(),
            label: args.label || genLabel(doc, "Container"),
            x: minX,
            y: minY,
            children: []
        }
        for (const { obj } of found) {
            const i = doc.displayList.indexOf(obj)
            if (i === -1) continue
            doc.displayList.splice(i, 1)
            obj.x = (obj.x || 0) - minX
            obj.y = (obj.y || 0) - minY
            container.children.push(obj)
        }
        doc.displayList.push(container)
        writeSceneFile(file, doc)
        return text(JSON.stringify({ container: { id: container.id, label: container.label }, children: container.children.length }))
    }
)

/* ---------------------------- plain objects ------------------------------ */

defTool(
    "scene-add-plain-objects",
    "Add plain objects (sprite animations configs, etc.) to the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objects: { type: "array", items: { type: "object" } }
        },
        required: ["objects"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        doc.plainObjects = doc.plainObjects || []
        const added = []
        for (const entry of args.objects) {
            const p = entry.properties || {}
            let obj
            if (entry.type === "Collider") {
                // Arcade physics collider between two object expressions
                obj = {
                    type: "Collider",
                    id: crypto.randomUUID(),
                    label: p.label || genLabel(doc, "Collider"),
                    object1: p.object1 ?? "",
                    object2: p.object2 ?? "",
                    overlapOnly: p.overlapOnly ?? false
                }
                if (p.scope) obj.scope = p.scope
                if (p.processCallback !== undefined) obj.processCallback = p.processCallback
                if (p.collideCallback !== undefined) obj.collideCallback = p.collideCallback
                if (p.callbackContext !== undefined) obj.callbackContext = p.callbackContext
            } else if (entry.type === "Tilemap") {
                // Tiled tilemap asset plain object
                if (!p.key) throw new Error("Tilemap plain object requires the asset `key` (see assets-get-available-tilemaps)")
                obj = {
                    type: "Tilemap",
                    id: crypto.randomUUID(),
                    label: p.label || p.key,
                    key: p.key,
                    tilesets: p.tilesets || []
                }
                if (p.scope) obj.scope = p.scope
            } else {
                obj = JSON.parse(JSON.stringify(entry))
                if (!obj.id) obj.id = crypto.randomUUID()
                if (!obj.label) obj.label = obj.id.slice(0, 8)
            }
            doc.plainObjects.push(obj)
            added.push({ id: obj.id, label: obj.label, type: obj.type })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ added }, null, 2))
    }
)

defTool(
    "scene-update-plain-objects",
    "Update plain objects of the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objects: { type: "array", items: { type: "object", properties: { id: { type: "string" }, properties: { type: "object" } }, required: ["id", "properties"] } }
        },
        required: ["objects"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        doc.plainObjects = doc.plainObjects || []
        const updated = []
        for (const entry of args.objects) {
            const obj = doc.plainObjects.find(o => o.id === entry.id || o.label === entry.id)
            if (!obj) throw new Error(`Plain object not found: ${entry.id}`)
            Object.assign(obj, entry.properties)
            updated.push(obj.id)
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ updated }, null, 2))
    }
)

defTool(
    "scene-delete-plain-objects",
    "Delete plain objects from the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objectIds: { type: "array", items: { type: "string" } }
        },
        required: ["objectIds"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const ids = new Set(args.objectIds || [])
        doc.plainObjects = (doc.plainObjects || []).filter(o => !ids.has(o.id) && !ids.has(o.label))
        writeSceneFile(file, doc)
        return text("Plain objects deleted.")
    }
)

/* ------------------------------ Asset tools ------------------------------ */

defTool(
    "assets-get-available-textures",
    "List all textures available in the project (from Asset Pack files and loose image files).",
    { type: "object", properties: {} },
    async () => {
        const textures = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "image" || e.type === "spritesheet" || e.type === "atlas") {
                    textures.push({ key: e.key, type: e.type, url: e.url, packFile: pack.file })
                }
            }
        }
        const packUrls = new Set(textures.map(t => t.url))
        for (const f of walkFiles(PROJECT_DIR, "")) {
            const ext = path.extname(f).toLowerCase()
            if (IMAGE_EXTS.has(ext) && !packUrls.has(f)) {
                textures.push({ key: path.basename(f, ext), type: "image", url: f, packFile: null })
            }
        }
        return text(JSON.stringify({ textures }, null, 2))
    }
)

defTool(
    "assets-get-texture-binary",
    "Get the binary (base64) data of a texture by key.",
    {
        type: "object",
        properties: {
            key: { type: "string", description: "The key of the texture." },
            frame: { description: "Optional frame (for atlases/spritesheets)." },
            texture: {
                type: "object",
                properties: { key: { type: "string" }, frame: { description: "Optional frame." } },
                required: ["key"],
                description: "Alternative official shape: { texture: { key, frame } }."
            }
        },
        anyOf: [{ required: ["key"] }, { required: ["texture"] }]
    },
    async (args) => {
        const key = textureKeyOf(args)
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && (e.type === "image" || e.type === "spritesheet"))
            if (e) { url = e.url; break }
        }
        if (!url) {
            const files = walkFiles(PROJECT_DIR, "").filter(f => {
                const ext = path.extname(f).toLowerCase()
                return IMAGE_EXTS.has(ext) && path.basename(f, ext) === key
            })
            url = files[0]
        }
        if (!url) throw new Error(`Texture "${key}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Texture file not found: ${url}`)
        const buf = readFileSafely(PROJECT_DIR, full)
        const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml" }[path.extname(full).toLowerCase()] || "application/octet-stream"
        return image(buf.toString("base64"), mime)
    }
)

defTool(
    "assets-get-available-animations",
    "List all sprite animations available in the project.",
    { type: "object", properties: {} },
    async () => {
        const animations = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "animations" && Array.isArray(e.animations)) {
                    animations.push({ key: e.key, packFile: pack.file, animations: e.animations.map(a => ({ key: a.key, frameRate: a.frameRate, frames: (a.frames || []).length })) })
                }
            }
        }
        return text(JSON.stringify({ animations }, null, 2))
    }
)

defTool(
    "assets-get-available-tilemaps",
    "List all tilemap files available in the project.",
    { type: "object", properties: {} },
    async () => {
        const tilemaps = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type && e.type.startsWith("tilemap")) tilemaps.push({ key: e.key, type: e.type, url: e.url, packFile: pack.file })
            }
        }
        const packUrls = new Set(tilemaps.map(t => t.url))
        for (const f of walkFiles(PROJECT_DIR, "")) {
            if (/\.(json|tmx|csv)$/.test(f.toLowerCase()) && /tilemap|map/.test(path.basename(f).toLowerCase()) && !packUrls.has(f)) {
                tilemaps.push({ key: path.basename(f), url: f, packFile: null })
            }
        }
        return text(JSON.stringify({ tilemaps }, null, 2))
    }
)

defTool(
    "assets-get-available-bitmapfonts",
    "List all bitmap fonts available in the project.",
    { type: "object", properties: {} },
    async () => {
        const fonts = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "bitmapFont") fonts.push({ key: e.key, url: e.url, packFile: pack.file })
            }
        }
        return text(JSON.stringify({ bitmapFonts: fonts }, null, 2))
    }
)

defTool(
    "assets-get-texture-content-bounding-box",
    "Get the bounding box of the non-transparent content of a texture (computed in the browser editor).",
    {
        type: "object",
        properties: {
            key: { type: "string", description: "The key of the texture." },
            frame: { description: "Optional frame (for atlases/spritesheets)." },
            texture: {
                type: "object",
                properties: { key: { type: "string" }, frame: { description: "Optional frame." } },
                description: "Alternative official shape: { texture: { key, frame } }."
            }
        }
    },
    async (args) => {
        const key = textureKeyOf(args)
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && (e.type === "image" || e.type === "spritesheet"))
            if (e) { url = e.url; break }
        }
        if (!url) {
            const files = walkFiles(PROJECT_DIR, "").filter(f => {
                const ext = path.extname(f).toLowerCase()
                return IMAGE_EXTS.has(ext) && path.basename(f, ext) === key
            })
            url = files[0]
        }
        if (!url) throw new Error(`Texture "${key}" not found`)
        return forwardToEditor("assets-get-texture-content-bounding-box", { key, url })
    }
)

/* ------------------------------ screenshots ------------------------------ */

defTool(
    "scene-get-screenshot",
    "Get a screenshot of the given scene rendered by the running editor.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            x: { type: "number", description: "The x coordinate of the top left corner of the screenshot." },
            y: { type: "number", description: "The y coordinate of the top left corner of the screenshot." },
            width: { type: "number", description: "The width of the screenshot." },
            height: { type: "number", description: "The height of the screenshot." }
        }
    },
    async (args) => {
        const { file } = requireScene(args)
        return forwardToEditor("scene-get-screenshot", {
            scenePath: file,
            x: args.x ?? 0,
            y: args.y ?? 0,
            width: args.width ?? 800,
            height: args.height ?? 600
        })
    }
)

/* ------------------------- project file utilities ------------------------ */

defTool(
    "project-list-files",
    "List the files of the project (optionally filtered by folder or extension).",
    {
        type: "object",
        properties: {
            folder: { type: "string", description: "Optional project-relative folder to list." },
            extension: { type: "string", description: "Optional extension filter, e.g. '.scene'." }
        }
    },
    async ({ folder, extension }) => {
        let files = walkFiles(PROJECT_DIR, "")
        if (folder) {
            const prefix = normPath(folder).replace(/\/$/, "") + "/"
            files = files.filter(f => f.startsWith(prefix))
        }
        if (extension) files = files.filter(f => f.toLowerCase().endsWith(extension.toLowerCase()))
        return text(JSON.stringify({ files }, null, 2))
    }
)

defTool(
    "project-read-file",
    "Read a text file of the project (code, config, scene JSON, ...).",
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async ({ path: p }) => {
        const rel = normPath(p)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error("invalid path")
        return text(readFileSafely(PROJECT_DIR, full, "utf8", 1024 * 512))
    }
)

defTool(
    "project-write-file",
    "Write (create or overwrite) a text file of the project (code files, configs, ...). For scene files prefer the scene-* tools.",
    {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"]
    },
    async ({ path: p, content }) => {
        const rel = normPath(p)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error("invalid path")
        if (rel.toLowerCase().endsWith(".scene")) throw new Error("Use the scene-* tools to modify scene files")
        if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(full))) throw new Error("invalid path")
        const handle = await openSafeProjectFileForWrite(PROJECT_DIR, full)
        if (!handle) throw new Error("invalid path")
        try {
            await handle.truncate(0)
            await handle.writeFile(content ?? "", "utf8")
        } finally {
            await handle.close().catch(() => {})
        }
        notifyFilesChanged()
        return text(`Written: ${rel} (${Buffer.byteLength(content || "")} bytes)`)
    }
)

defTool(
    "project-delete-file",
    "Delete a file or folder from the project.",
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async ({ path: p }) => {
        const rel = normPath(p)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full || full === PROJECT_DIR) throw new Error("invalid path")
        if (!await removeProjectEntrySafely(PROJECT_DIR, full, { recursive: true, force: true })) throw new Error("invalid path")
        notifyFilesChanged()
        return text(`Deleted: ${rel}`)
    }
)

defTool(
    "project-compile-info",
    "Get the info needed to run the game: the game entry files (index.html, game.js/main.ts), the Phaser version used by the editor, and the list of scene files.",
    { type: "object", properties: {} },
    async () => {
        const scenes = sceneFiles()
        const entry = ["index.html", "game.js", "main.ts", "src/main.ts", "src/main.js"].filter(f => fs.existsSync(path.join(PROJECT_DIR, f)))
        let phaserVersion = "unknown"
        const phaserFile = walkFiles(PROJECT_DIR, "").find(f => /(^|\/)(phaser\.js|phaser\.min\.js)$/.test(f))
        if (phaserFile) {
            try {
                const full = safeJoin(PROJECT_DIR, phaserFile)
                if (!full) throw new Error("invalid path")
                const head = readFileSafely(PROJECT_DIR, full, "utf8", 16 * 1024 * 1024).slice(0, 300)
                const m = head.match(/Phaser v([\d.]+)/) || head.match(/version:\s*["']([\d.]+)/)
                if (m) phaserVersion = m[1]
            } catch (e) { /* ignore */ }
        }
        return text(JSON.stringify({ entryFiles: entry, phaserVersion, scenes }, null, 2))
    }
)

/* --------------------------- system instructions -------------------------- */

const SYSTEM_INSTRUCTIONS = `You are a game development assistant specialized in **Codogma Engine** (an open-source IDE built on Phaser 4.2.1). You have access to tools that query and modify the game project opened in the editor.

## Core behavior

1. **Autonomy**: when the user makes a request, do not stop to ask for confirmation. Create a step-by-step plan and execute it with the tools until fully done.
2. **Planning**: break complex requests into smaller tasks; call tools in a sensible order (create scene -> add objects -> verify with scene-get-scene-data or scene-get-screenshot).
3. **Execution**: always execute tool calls; if one fails, fix the arguments and retry, or explain clearly.
4. **Responses**: present results concisely, summarize what was changed, suggest next steps.

## Scenes and game objects

Scenes are JSON files (\`.scene\`) with an \`id\`, \`settings\` (\`sceneKey\`), a \`displayList\` of game objects, and \`plainObjects\`. Each object has a unique \`id\`, a \`type\`, a \`label\` (valid JS identifier, unique in the scene) and flat properties (dotted names allowed for component properties, e.g. \`body.velocity.x\`).

Game object types: Image, Sprite, Text, BitmapText, Container, Layer, TileSprite, NineSlice, ThreeSlice, Rectangle, Ellipse, Triangle, Polygon, ParticleEmitter, Tilemap, TilemapLayer, ScriptNode, SpineGameObject, Video.

Common properties (all optional unless noted):

\`\`\`ts
class VariableComponent {
    label: string          // required-ish; used as object name/variable
    scope: "LOCAL" | "PUBLIC" | "METHOD" | "CLASS" = "LOCAL"
}
class TransformComponent { x = 0; y = 0; scaleX = 1; scaleY = 1; angle = 0 }
class TextureConfig { key: string; frame?: string | number }  // frame required for atlas/spritesheet
class TextureComponent { texture: TextureConfig }             // required for Image/Sprite/TileSprite/NineSlice
class OriginComponent { originX = 0.5; originY = 0.5 }
class FlipComponent { flipX = false; flipY = false }
class VisibleComponent { visible = true }
class AlphaComponent { alpha = 1 }
class BlendModeComponent { blendMode: number } // 0 SKIP_CHECK, 1 NORMAL, 2 ADD, 3 MULTIPLY, ...
class TintComponent { tintFill = false; tintTopLeft = "#ffffff"; ... } // hex colors
class SizeComponent { width: number; height: number }
class TextObject { text: string; fontFamily = "Courier"; fontSize = "16px"; color = "#fff"; fontStyle?; align?; backgroundColor?; stroke?; strokeThickness?; wordWrapWidth? }
class Shapes { isFilled = true; fillColor = "#ffffff"; fillAlpha = 1; isStroked = false; strokeColor = "#ffffff"; strokeAlpha = 1; lineWidth = 1 }
class ArcadeBody {
    // Upstream MCP aliases; the server normalizes them to current editor serialization keys.
    "Arcade.active": true
    "body.physicsType": 0 | 1      // 0 DYNAMIC_BODY, 1 STATIC_BODY -> editor key physicsType
    "body.geometry": 0 | 1         // 0 CIRCLE, 1 RECTANGLE -> editor key bodyGeometry
    "body.radius": number; "body.width": number; "body.height": number
    "body.offset.x": number; "body.offset.y": number
    "body.velocity.x": number; "body.velocity.y": number
    "body.maxVelocity.x": number; "body.maxVelocity.y": number
    "body.acceleration.x": number; "body.acceleration.y": number
    "body.drag.x": number; "body.drag.y": number
    "body.bounce.x": number; "body.bounce.y": number
    "body.gravity.x": number; "body.gravity.y": number
    "body.friction.x": number; "body.friction.y": number
    "body.allowGravity": boolean; "body.immovable": boolean
    "body.mass": number; "body.collideWorldBounds": boolean
    "body.angularVelocity": number; "body.angularAcceleration": number
    "body.angularDrag": number; "body.maxAngular": number
    "body.enable": boolean; "body.moves": boolean; "body.maxSpeed": number
    "body.useDamping": boolean; "body.allowDrag": boolean
    "body.onWorldBounds": boolean; "body.allowRotation": boolean; "body.pushable": boolean
    "body.checkCollision.none": boolean; "body.checkCollision.up": boolean
    "body.checkCollision.down": boolean; "body.checkCollision.left": boolean
    "body.checkCollision.right": boolean
    "body.overlapX": number; "body.overlapY": number; "body.overlapR": number
}
\`\`\`

## Type-specific object properties

- Sprite: animationPlayMethod (0 none, 1 play, 2 play reverse), animationKey, animationCustomConfig and animationFrameRate, animationDelay, animationRepeat, animationRepeatDelay, animationYoyo, animationShowBeforeDelay, animationShowOnStart, animationHideOnComplete, animationStartFrame and animationTimeScale.
- TileSprite: tilePositionX, tilePositionY, tileScaleX and tileScaleY.
- NineSlice: leftWidth, rightWidth, topHeight and bottomHeight. ThreeSlice: leftWidth and rightWidth.
- BitmapText: font (asset-pack bitmap-font key), fontSize, align (0 left, 1 center, 2 right), letterSpacing, maxWidth, dropShadowX, dropShadowY, dropShadowAlpha and dropShadowColor.
- Text: fixedWidth, fixedHeight, paddingLeft, paddingTop, paddingRight, paddingBottom, lineSpacing, wordWrapWidth, wordWrapUseAdvanced, maxLines, baselineX and baselineY. Shadow may be passed as an object with offsetX, offsetY, color, stroke, fill and blur; it is serialized to the editor's dotted shadow properties.
- Hit areas can be configured as a \`hitArea\` object or dotted \`hitArea.shape\` fields. shape is NONE, RECTANGLE, CIRCLE, ELLIPSE, POLYGON or PIXEL_PERFECT. RECTANGLE uses x/y/width/height; CIRCLE uses x/y/radius; ELLIPSE uses x/y/width/height; POLYGON uses points; PIXEL_PERFECT uses alphaTolerance.
- Shape objects also support isFilled, fillColor, fillAlpha, isStroked, strokeColor, strokeAlpha and lineWidth.
- Arcade physics is available only on object types whose current editor support installs ArcadeComponent. Use scene-enable-arcade-physics-body / scene-disable-arcade-physics-body rather than setting a component active flag manually. The server accepts upstream Arcade.active/body.* fields and normalizes them to current editor serialization keys. The arcade shortcut is an object containing known body fields such as physicsType, geometry, velocityX, gravityY, allowGravity and collideWorldBounds.
- Video: url is a video asset key or absolute URL; loop, mute and autoplay are booleans.

### ParticleEmitter configuration

Pass the editor configuration in properties.config. configTexture is the asset-pack texture key and configFrame is an array of frame names/numbers. The properties.texture shorthand accepts a texture key and optional frame.

Operation-valued fields (x, y, moveToX, moveToY, scale, scaleX, scaleY, angle, rotate, accelerationX, accelerationY, maxVelocityX, maxVelocityY, speed, speedX, speedY, delay, hold, lifespan, quantity, tint, alpha and color) accept the upstream discriminated forms:
- { type: "Static", value: number }
- { type: "Random", random: number[] }
- { type: "StartEndRandom", start: number, end: number, randomFlag?: boolean, ease?: string }
- { type: "Interpolation", values: number[], interpolation?: "linear" | "catmull" | "bezier", ease?: string }
- { type: "Stepped", steps: number, start: number, end: number, yoyo?: boolean }
- { type: "MinMax", min: number, max: number, int?: boolean }
- { type: "None" }

Simple values include gravityX, gravityY, radial, colorEase, tintFill, blendMode, particleBringToTop, sortOrderAsc, sortProperty, follow and trackVisible. Timing values use the upstream aliases _duration, _stopAfter, _frequency, _timeScale, _maxAliveParticles, _maxParticles and _advance. Numeric values and arrays are accepted as Static and Random shorthands. The current Codogma editor model supports one particle animationKey; multiple _anim entries are rejected instead of being silently truncated.

Workflow for creating content:
1. \`ide-get-all-scenes-in-project\` and \`assets-get-available-textures\` to know what exists.
2. \`ide-create-new-scene\` (or reuse an existing scene).
3. \`scene-add-game-objects\` with good labels (e.g. \`player\`, \`ground\`, \`coin_1\`).
4. \`scene-get-scene-data\` / \`scene-get-screenshot\` to verify the result.
5. Modify game code (\`project-read-file\` + \`project-write-file\`) to register scenes in the game entry (main.ts / game.js: \`game.scene.add("MyScene", MyScene)\`), load the asset pack in a Boot scene, and add gameplay code.
6. \`ide-open-scene\` to show the result to the user in the editor.

## Spine assets and game objects

Use these tools in order when working with Spine assets:
1. \`assets-get-available-spine-skeletons\` and \`assets-get-available-spine-atlases\` to discover the exact skeleton and atlas keys.
2. \`assets-get-spine-skeleton-info\` to inspect skins and animations when the skeleton is JSON. Binary \`.skel\` assets are loaded by the editor runtime; this file parser does not enumerate their metadata.
3. \`assets-get-spine-skin-image\` to render a PNG preview for an exact \`dataKey\`, \`atlasKey\`, \`skinName\` and \`animationName\`. This tool requires the browser editor page and its SSE MCP bridge to be connected.
4. Add a scene object with \`scene-add-game-objects\`, type \`SpineGameObject\` and \`properties.dataKey\` / \`properties.atlasKey\`. Optional properties include \`skinName\`, \`bpType\`, \`bpSkin\`, \`bpAnimation\`, \`bpTimeStep\`, \`animationMixes\`, \`defaultMix\` and \`timeScale\`.
5. Use \`scene-get-scene-data\` to verify the serialized Spine configuration. The editor renderer is required for visual preview.

\`bpType\` is 0 (\`SETUP_TYPE\`) or 1 (\`SKINS_AND_ANIMATION\`). \`bpSkin\` is 0 (\`ALL_SKINS\`) or 1 (\`CURRENT_SKIN\`). \`animationMixes\` is an array of \`[fromAnimation, toAnimation, durationSeconds]\` tuples.

## Editable tilemaps (v5)

Editable tilemaps are plain objects whose tile data can be painted in the scene editor. Workflow:
1. \`scene-add-editable-tilemap\` with \`tilesets\` referencing image/spritesheet asset keys (the tile counts and firstgids are computed from the image files). It creates the first layer ("mainLayer") and its layer game object, and returns \`tilemapId\` + \`layerId\`.
2. \`scene-write-editable-tilemap-layer-data\` / \`scene-fill-editable-tilemap-layer-data\` to paint the tiles. Layer cells are GLOBAL tile ids: 1-based index within the concatenated tilesets (\`firstgid\` of a tileset = 1 + the sum of the tile counts of the previous tilesets); \`-1\` = empty cell.
3. \`scene-add-tileset-to-editable-tilemap\` / \`scene-delete-tileset-from-editable-tilemap\` rebases the layer ids automatically. \`scene-resize-editable-tilemap-layer\` and \`scene-add-editable-tilemap-layer\` manage the layers.
4. The layer game objects (\`EditableTilemapLayer\`) are regular game objects: move/scale them with scene-update-game-objects.
5. \`scene-get-editable-tilemap-layer-selection-data\` returns the tile region currently selected in the running editor (requires an editor tab connected to the MCP bridge).
## Scene editing and object hierarchy

- For scene-scoped tools, provide one scene selector: sceneId, scenePath or sceneKey. sceneId comes from ide-get-all-scenes-in-project or scene-get-scene-data; scenePath is project-relative; sceneKey is the filename without the .scene extension.
- scene-add-game-objects accepts objects: [{ type, properties }]. Use a type from the list above and a unique JavaScript-identifier label. Read the instructions before using a type-specific configuration you have not used before.
- scene-update-game-objects accepts objects: [{ id, properties }]. id can be an object id or label; properties should contain only the fields to change. For prefab instances include unlock with every property that the instance is intended to keep editable.
- scene-delete-game-objects accepts objectIds, each an id or label. scene-clear-scene removes all display-list objects; inspect the scene first and prefer delete for a selected subset.
- scene-get-scene-data returns displayList, plainObjects, lists and prefabProperties. scene-get-objects-data returns selected objects by ids or labels.
- scene-move-game-object-in-render-list takes objectIds and move: Up, Down, Top or Bottom. scene-move-game-objects-to-parent takes objectIds and optional parentId; omit parentId to return objects to the scene root. The parent must be a container-like object that supports children.
- scene-pack-objects-in-container takes objectIds and optional label. It creates a container and repositions its children to produce compact bounds.

## Plain objects and Tiled maps

Plain objects are stored in scene.plainObjects, separately from displayList. Use scene-add-plain-objects, scene-update-plain-objects and scene-delete-plain-objects for this collection; do not send plain objects through scene-add-game-objects.
- scene-add-plain-objects accepts objects. A Tiled map entry uses type Tilemap and properties containing key (from assets-get-available-tilemaps) plus optional tilesets. A Collider entry uses type Collider and properties object1 and object2; optional fields are overlapOnly, scope, processCallback, collideCallback and callbackContext. Other plain-object records are copied as supplied, with type, id/label and their data.
- scene-update-plain-objects accepts objects: [{ id, properties }]. scene-delete-plain-objects accepts objectIds. Both tools resolve ids or labels.
- A Tiled Tilemap is a plain object in this build. Editable Tilemaps are a separate subsystem and use scene-add-editable-tilemap and the dedicated scene-*editable-tilemap-layer tools. TilemapLayer is a display-list object created by the map workflow.

## Prefabs and nested prefab instances

- A prefab is a reusable game-object class stored in a scene file whose sceneType is PREFAB. Create it with ide-create-new-prefab-scene, then immediately add its root object using scene-add-game-objects; the first display-list object becomes the prefab root.
- ide-get-all-prefabs-in-project lists prefab ids, paths, root object types and inheritance targets. ide-get-prefab-inheritance takes prefabId and returns the chain from that prefab to its root ancestor.
- Create a prefab instance with properties.prefabId set to the prefab scene id. The instance root type must match the prefab root type. Use prefabProps for declared user-property values.
- Prefab instance properties are locked by default. Supply unlock as an array of property names the instance may override. Preserve all properties that should remain unlocked when updating an instance; do not replace the unlock array with only the field changed in the current call.
- scene-get-nested-prefabs-instances takes the id or label of a prefab instance and returns nested instances. Update a nested instance by its own id; do not treat a nested instance as an ordinary child that can be independently deleted.
- scene-declare-prefab-property requires sceneId of a PREFAB scene, name, type object with id and optional isArray/options, and defValue. Supported type ids are number, string, boolean, color, keycode, expression, option, objectVar, object-ref, constructor, event, texture-config, animation-key, audio-key, asset-key, scene-key, spine-skin-name, spine-animation-name and spine-event. Option properties need options; arrays use type.isArray and may provide defArrayValue. customDefinition=true suppresses generation of a class field.
- scene-delete-prefab-property takes sceneId and name. Check ide-get-all-prefabs-in-project before changing a prefab and re-read its scene data afterwards.

## Object lists

- scene-add-object-list accepts lists: [{ label, scope?, objectIds? }]. label should be a valid JavaScript identifier. objectIds may contain ids or labels; existing object labels are resolved to ids.
- scope may be LOCAL, PUBLIC, METHOD, CLASS or NESTED_PREFAB. It controls the generated variable or field scope.
- scene-update-object-list takes id (or label) and optional label, scope and objectIds. scene-remove-object-list takes listIds (ids or labels). Lists are stored in the scene-level lists collection and can be inspected with scene-get-scene-data.

## Phaser 4 filters

Supported filter types in this build are Glow, Shadow, Pixelate, Blur, Barrel, Displacement, Bokeh, Blend, ObjectMask, TextureMask, Threshold and ColorMatrix.
- scene-add-game-object-filters accepts objects: [{ type, parentId, internal?, properties? }]. parentId is a game-object id or label. properties contains filter-specific fields. internal=true places the filter in the object's pre-FX list; internal=false places it in the scene/external filter list. If omitted, the default is internal for Image, Sprite, Text, TileSprite, RenderTexture and Video; other parents default to external.
- scene-update-game-object-filters accepts objects: [{ id, type, properties?, internal? }]. Use the filter id returned by the add call. internal can move the filter between internal and external pipelines.
- scene-delete-game-object-filters takes filterIds (ids or labels). scene-update-game-object-filter-list takes filterId and internal.
- Filter properties depend on the selected filter type. Do not invent a generic property set; use the Phaser 4 contract for that filter type and inspect the resulting scene data after applying it.

## Arcade physics

- Enable and disable bodies with scene-enable-arcade-physics-body and scene-disable-arcade-physics-body. Enable takes updates: [{ id }]; disable takes ids. Use ids from scene-get-scene-data.
- ArcadeComponent is available on Image, Sprite, BitmapText, Container, TileSprite, NineSlice, ThreeSlice, Text, Rectangle, Ellipse, Triangle, Polygon and SpineGameObject, plus legacy ArcadeImage and ArcadeSprite types. Video, Layer, ParticleEmitter, TilemapLayer and ScriptNode do not expose this component; the enable tool rejects unsupported types.
- scene-enable-arcade-physics-body initializes a missing body as dynamic (physicsType 0) with rectangular geometry (bodyGeometry 1). Use scene-update-game-objects to change body settings afterwards. Upstream argument aliases Arcade.active and body.* are normalized to current editor keys such as ArcadeComponent.active, physicsType, bodyGeometry, radius, allowGravity, enable, moves and the vector fields.
- The properties.arcade shorthand is accepted on object creation and update. Known fields include physicsType, geometry, radius, width, height, velocityX/Y, maxVelocityX/Y, accelerationX/Y, dragX/Y, bounceX/Y, gravityX/Y, frictionX/Y, offsetX/Y, allowGravity, immovable, collideWorldBounds, moves, maxSpeed, mass, enable, useDamping, allowDrag, onWorldBounds, allowRotation, pushable, angularVelocity, angularAcceleration, angularDrag, maxAngular, overlapX/Y/R and checkCollisionNone/Up/Down/Left/Right. Unknown shortcut fields are rejected.
- scene-disable-arcade-physics-body removes the component-active flag and serialized body settings. It does not delete the game object.

## Assets, fonts and project files

- assets-get-available-asset-packs lists asset-pack file names and entries. assets-get-available-textures lists keys from asset packs and loose image files. Use the exact asset key returned; atlas and spritesheet textures may also require a frame.
- assets-get-texture-size accepts key or texture: { key }. assets-get-texture-binary accepts key or texture: { key, frame? } and returns image content. assets-get-texture-content-bounding-box returns non-transparent content bounds and requires the browser editor SSE bridge.
- assets-get-available-animations lists sprite animation keys. assets-get-available-bitmapfonts and assets-get-bitmapfont-image inspect bitmap fonts. assets-get-spritesheet-image previews spritesheet frame layout.
- assets-get-available-tilemaps lists Tiled map keys; assets-get-tilemap-data reads layers, tilesets and objects. Use the Spine workflow above for skeleton data and previews.
- Google Fonts workflow: assets-get-google-font-families accepts optional filter; assets-get-google-font-info takes the exact family name and returns a TTF URL; assets-add-google-font-to-asset-pack takes assetPackFileName, key and family, with optional url. The key must be unique in the asset pack; Text objects then refer to it using fontFamily. The add tool resolves the TTF URL automatically when url is omitted.
- project-list-files accepts optional project-relative folder and extension. project-read-file takes path and reads UTF-8 text up to 512 KiB. project-write-file takes path and content, creates parent folders and overwrites text files; it refuses .scene files, which must be changed using scene tools. project-delete-file takes path and removes a file or folder recursively.
- project-compile-info returns detected game entry files, Phaser version and scene files. Inspect it before modifying game bootstrap code; use project-write-file for code/config files, not generated scene JSON.
- All project paths are relative to the selected project root. Do not prefix the project folder name, use absolute paths or try to escape the project root.

## UI-dependent commands and verification

The following commands require the running browser editor and its SSE MCP bridge: ide-get-active-scene, ide-open-scene, ide-save-scene, scene-get-screenshot, assets-get-texture-content-bounding-box, scene-get-editable-tilemap-layer-selection-data and assets-get-spine-skin-image. Start the engine server, open the project in the editor and wait for the bridge connection before using them. A timeout means the editor-side command did not complete; verify the editor state before retrying.
File-only tools can work without an active editor tab. Prefer scene-get-scene-data and scene-get-objects-data to verify structural edits; use scene-get-screenshot or the relevant preview tool for visual verification when the editor bridge is available.
`

/* ===================== prefab & nested prefab tools ======================= */

function findSceneFileById(id) {
    if (!id) return null
    for (const f of sceneFiles()) {
        const doc = readSceneFile(f)
        if (doc && doc.id === id) return { file: f, doc }
    }
    return null
}

function findTextureUrl(key, types) {
    const wanted = types || ["image", "spritesheet", "atlas", "atlasXML", "multiatlas", "unityAtlas", "svg"]
    for (const pack of parseAssetPacks()) {
        const e = pack.entries.find(e => e.key === key && wanted.includes(e.type))
        if (e) return e.url
    }
    const files = walkFiles(PROJECT_DIR, "").filter(f => {
        const ext = path.extname(f).toLowerCase()
        return IMAGE_EXTS.has(ext) && path.basename(f, ext) === key
    })
    return files[0] || null
}

function notSupported(name, reason) {
    defTool(name, `${reason} (not available in this build).`, { type: "object", properties: {} },
        async () => text(`Tool '${name}' is not available in this build: ${reason}`))
}

/* ================= editable tilemaps (v5-style) ==================== */

/**
 * Editable Tilemaps are a v5-style subsystem: a plain object of type
 * `EditableTilemap` holds the data, and one `EditableTilemapLayer` game object
 * per layer renders it. Scene JSON contract (read by the editor client,
 * ui.sceneobjects.editableTilemap):
 *
 *   plainObjects: [{ id, type: "EditableTilemap", label, data: {
 *       tileWidth, tileHeight,
 *       tilesets: [{ name, imageKey, tileWidth, tileHeight, margin, spacing, firstgid }],
 *       layers:   [{ id, name, width, height, data: [[gid, ...]] }] } }]
 *
 *   displayList: [{ id, type: "EditableTilemapLayer", label, scope: "METHOD",
 *       tilemapId, layerName, x, y }]
 *
 * Layer cells hold GLOBAL tile ids, following the Tiled semantics: 1-based
 * index within the concatenated tilesets; the firstgid of a tileset is
 * `1` + the sum of the tile counts of the previous tilesets. `-1` = empty cell.
 */

/** Compute the tile grid of a tileset from its image size (mirrors the editor's EditableTilemap.computeTilesetTileCount). */
function tilesetGrid(ts, imageWidth, imageHeight) {

    if (!imageWidth || !imageHeight) return { columns: 0, rows: 0, tileCount: 0 }

    const columns = Math.floor((imageWidth - ts.margin * 2 + ts.spacing) / (ts.tileWidth + ts.spacing))
    const rows = Math.floor((imageHeight - ts.margin * 2 + ts.spacing) / (ts.tileHeight + ts.spacing))

    return {
        columns,
        rows,
        tileCount: columns > 0 && rows > 0 ? columns * rows : 0
    }
}

/** Resolve an image/spritesheet asset key to its project file and pixel size. */
function resolveTilesetImage(imageKey) {

    const url = findTextureUrl(imageKey, ["image", "spritesheet"])

    if (!url) {
        throw new Error(`Cannot resolve the tileset image "${imageKey}": no image/spritesheet asset with that key exists in the asset packs or project files (see assets-get-available-textures).`)
    }

    const full = safeJoin(PROJECT_DIR, url)

    if (!full) throw new Error(`Tileset image file not found: ${url}`)

    const size = parseImageSize(readFileSafely(PROJECT_DIR, full))

    if (!size || !size.width || !size.height) throw new Error(`Cannot read the image size of "${imageKey}" (${url}).`)

    return { url, width: size.width, height: size.height }
}

function editableTilesetTileCount(ts) {
    // a missing/unreadable image counts as 0 tiles (same as the editor with a not-loaded texture)
    try {
        const img = resolveTilesetImage(ts.imageKey)
        return tilesetGrid(ts, img.width, img.height).tileCount
    } catch (e) {
        return 0
    }
}

/** Recompute the firstgid of all tilesets, Tiled semantics: 1 + the sum of the previous tile counts. */
function recomputeEditableFirstGids(tilesets) {

    let gid = 1

    for (const ts of tilesets) {
        ts.firstgid = gid
        gid += editableTilesetTileCount(ts)
    }

    return tilesets
}

/**
 * Rebase the gids of all the layers after a change in the tilesets
 * (mirrors the editor's EditableTilemap.remapLayerTiles): the tiles in the
 * range [oldFirstgid, oldFirstgid + oldTileCount) of each old tileset move to
 * newFirstgid, or become -1 when the tileset was removed (entry undefined).
 */
function remapEditableLayerTiles(layers, mapping) {

    for (const layer of layers) {

        for (const row of (layer.data || [])) {

            if (!Array.isArray(row)) continue

            for (let x = 0; x < row.length; x++) {

                const gid = row[x]

                if (gid < 1) continue

                let newGid = -1

                for (const entry of mapping) {

                    if (entry && gid >= entry.oldFirstgid && gid < entry.oldFirstgid + entry.oldTileCount) {
                        newGid = entry.newFirstgid + (gid - entry.oldFirstgid)
                        break
                    }
                }

                row[x] = newGid
            }
        }
    }
}

/** Find the EditableTilemap plain object by id (or label). */
function findEditableTilemap(doc, tilemapId) {

    const tm = (doc.plainObjects || [])
        .find(o => o.type === "EditableTilemap" && (o.id === tilemapId || o.label === tilemapId))

    if (!tm) {
        throw new Error(`EditableTilemap not found: "${tilemapId}". Use scene-get-scene-data to get the ids of the scene plain objects.`)
    }

    tm.data = tm.data || {}
    tm.data.tilesets = tm.data.tilesets || []
    tm.data.layers = tm.data.layers || []

    return tm
}

/** Find an EditableTilemapLayer game object by id (or label). */
function findEditableLayerObject(doc, layerId) {

    const visit = list => {
        for (const o of list || []) {
            if (o.type === "EditableTilemapLayer" && (o.id === layerId || o.label === layerId)) return o
            const found = visit(o.children)
            if (found) return found
        }
        return null
    }

    return visit(doc.displayList)
}

/** Resolve a layerId (the id of the layer game object, or of a layer data entry) to { tilemap, layerEntry, layerObject }. */
function resolveEditableLayer(doc, layerId) {

    const layerObject = findEditableLayerObject(doc, layerId)

    if (layerObject) {

        const tilemap = (doc.plainObjects || [])
            .find(o => o.type === "EditableTilemap" && o.id === layerObject.tilemapId)

        if (!tilemap) {
            throw new Error(`Cannot find the EditableTilemap plain object of the layer "${layerObject.layerName}" (tilemapId ${layerObject.tilemapId}).`)
        }

        const layerEntry = (tilemap.data?.layers || []).find(l => l.name === layerObject.layerName)

        if (!layerEntry) {
            throw new Error(`The layer game object "${layerObject.layerName}" has no layer data in its editable tilemap (tilemapId ${layerObject.tilemapId}).`)
        }

        return { tilemap, layerEntry, layerObject }
    }

    // fallback: layerId may be the id of a layer data entry inside a tilemap plain object
    for (const tm of (doc.plainObjects || [])) {

        if (tm.type !== "EditableTilemap") continue

        const layerEntry = (tm.data?.layers || []).find(l => l.id === layerId)

        if (layerEntry) return { tilemap: tm, layerEntry, layerObject: null }
    }

    throw new Error(`Editable tilemap layer not found: "${layerId}". Use scene-get-scene-data to get the ids of the EditableTilemapLayer game objects.`)
}

/** A layer name that is unique in the scene (labels + layer names), like the editor's makeNewName. */
function uniqueEditableLayerName(doc, existingLayerNames, base) {

    const taken = new Set(existingLayerNames)

    for (const { obj } of flatObjects(doc)) taken.add(obj.label)
    for (const o of (doc.plainObjects || [])) taken.add(o.label)

    if (!taken.has(base)) return base

    let i = 1
    while (taken.has(base + "_" + i)) i++

    return base + "_" + i
}

/** The EditableTilemapLayer game object JSON of a layer (scope METHOD, like the editor writes it). */
function makeEditableLayerGameObject(tilemapId, layerName, x = 0, y = 0) {

    return {
        type: "EditableTilemapLayer",
        id: crypto.randomUUID(),
        label: layerName,
        scope: "METHOD",
        tilemapId,
        layerName,
        x,
        y
    }
}

function emptyEditableLayerData(width, height) {

    return Array.from({ length: height }, () => Array.from({ length: width }, () => -1))
}

defTool(
    "scene-add-editable-tilemap",
    "Add an editable tilemap to the scene. An editable tilemap is different to a Tiled map because all the data can be edited by the user in the scene editor. However, it follows many of the concepts of Tiled. The editable tilemap is also a plain object so you can manipulate it using most of the plain object tools.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            label: { type: "string", description: "Label of the object. It is used to name the object in the scene and as the variable name in code." },
            width: { type: "number", description: "The width of the editable tilemap in tiles." },
            height: { type: "number", description: "The height of the editable tilemap in tiles." },
            tileWidth: { type: "number", description: "The width of each tile in pixels." },
            tileHeight: { type: "number", description: "The height of each tile in pixels." },
            tilesets: {
                type: "array",
                description: "The tilesets used by the tilemap.",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "The name of the tileset, as it appears in the map data." },
                        imageKey: { type: "string", description: "The key of an asset image or spritesheet to associate with the tileset." },
                        tileWidth: { type: "number", description: "The width of each tile in pixels." },
                        tileHeight: { type: "number", description: "The height of each tile in pixels." },
                        tileMargin: { type: "number", description: "The margin around each tile in pixels." },
                        tileSpacing: { type: "number", description: "The spacing between tiles in pixels." }
                    },
                    required: ["name", "imageKey", "tileWidth", "tileHeight"]
                }
            }
        },
        required: ["label", "width", "height", "tileWidth", "tileHeight", "tilesets"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const label = String(args.label || "").trim()
        if (!label) throw new Error("`label` is required.")

        const width = Math.trunc(Number(args.width))
        const height = Math.trunc(Number(args.height))
        const tileWidth = Math.trunc(Number(args.tileWidth))
        const tileHeight = Math.trunc(Number(args.tileHeight))

        if (!(width > 0) || !(height > 0)) throw new Error("`width` and `height` (in tiles) must be positive numbers.")
        if (!(tileWidth > 0) || !(tileHeight > 0)) throw new Error("`tileWidth` and `tileHeight` (in pixels) must be positive numbers.")
        if (!Array.isArray(args.tilesets) || args.tilesets.length === 0) throw new Error("`tilesets` must contain at least one tileset config.")

        // resolve all the tileset images first: fail before mutating anything
        const resolved = args.tilesets.map(ts => {

            if (!ts || !ts.imageKey) throw new Error("Every tileset config requires an `imageKey` (the key of an image or spritesheet asset).")
            if (!ts.name) throw new Error("Every tileset config requires a `name`.")

            return { ...ts, img: resolveTilesetImage(ts.imageKey) }
        })

        const tilemapId = crypto.randomUUID()

        const tilesets = []

        for (const ts of resolved) {

            const info = {
                name: String(ts.name),
                imageKey: ts.imageKey,
                tileWidth: Math.trunc(Number(ts.tileWidth ?? tileWidth)),
                tileHeight: Math.trunc(Number(ts.tileHeight ?? tileHeight)),
                margin: Number(ts.tileMargin ?? 0),
                spacing: Number(ts.tileSpacing ?? 0),
                firstgid: 0
            }

            if (!(info.tileWidth > 0) || !(info.tileHeight > 0)) {
                throw new Error(`Tileset "${info.name}": tileWidth/tileHeight (in pixels) must be positive numbers.`)
            }

            const grid = tilesetGrid(info, ts.img.width, ts.img.height)

            info.firstgid = tilesets.length === 0 ? 1 : tilesets[tilesets.length - 1].info.firstgid + tilesets[tilesets.length - 1].grid.tileCount

            tilesets.push({ info, grid, img: ts.img })
        }

        const layerName = uniqueEditableLayerName(doc, [], "mainLayer")

        const layerEntry = {
            id: crypto.randomUUID(),
            name: layerName,
            width,
            height,
            data: emptyEditableLayerData(width, height)
        }

        const plainObj = {
            type: "EditableTilemap",
            id: tilemapId,
            label,
            data: {
                tileWidth,
                tileHeight,
                tilesets: tilesets.map(t => t.info),
                layers: [layerEntry]
            }
        }

        doc.plainObjects = doc.plainObjects || []
        doc.plainObjects.push(plainObj)

        const layerObject = makeEditableLayerGameObject(tilemapId, layerName, 0, 0)

        doc.displayList = doc.displayList || []
        doc.displayList.push(layerObject)

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId,
            tilemapLabel: label,
            layerId: layerObject.id,
            layerName,
            width,
            height,
            tileWidth,
            tileHeight,
            tilesets: tilesets.map(t => ({
                name: t.info.name,
                imageKey: t.info.imageKey,
                tileWidth: t.info.tileWidth,
                tileHeight: t.info.tileHeight,
                margin: t.info.margin,
                spacing: t.info.spacing,
                firstgid: t.info.firstgid,
                tilecount: t.grid.tileCount,
                columns: t.grid.columns,
                rows: t.grid.rows,
                imageUrl: t.img.url,
                imageSize: { width: t.img.width, height: t.img.height }
            }))
        }, null, 2))
    }
)

defTool(
    "scene-add-tileset-to-editable-tilemap",
    "Add a tileset to an editable tilemap. This will add the tileset to the tilemap data, but it will not add the tileset asset itself. It also will update the ID of the tiles of every layer in the map.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            tilemapId: { type: "string", description: "The `id` of the editable tilemap to add the tileset to." },
            tileset: {
                type: "object",
                properties: {
                    imageKey: { type: "string", description: "The key of an asset image or spritesheet to associate with the tileset." }
                },
                required: ["imageKey"]
            }
        },
        required: ["tilemapId", "tileset"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const tilemap = findEditableTilemap(doc, args.tilemapId)

        const imageKey = args.tileset?.imageKey

        if (!imageKey) throw new Error("`tileset.imageKey` is required (the key of an image or spritesheet asset).")

        const img = resolveTilesetImage(imageKey)

        // capture the layout before the change to keep the layer gids consistent
        const oldLayout = tilemap.data.tilesets.map(ts => ({
            ts,
            oldFirstgid: ts.firstgid,
            oldTileCount: editableTilesetTileCount(ts)
        }))

        // the tileset name is the image key; tile size comes from the tilemap
        const info = {
            name: imageKey,
            imageKey,
            tileWidth: tilemap.data.tileWidth ?? 16,
            tileHeight: tilemap.data.tileHeight ?? 16,
            margin: 0,
            spacing: 0,
            firstgid: 0
        }

        const grid = tilesetGrid(info, img.width, img.height)

        tilemap.data.tilesets.push(info)

        recomputeEditableFirstGids(tilemap.data.tilesets)

        // appended at the end: the previous ranges keep their gids (rebasing is a no-op in the common case)
        const remaining = new Set(tilemap.data.tilesets)

        remapEditableLayerTiles(tilemap.data.layers, oldLayout.map(e =>
            remaining.has(e.ts)
                ? { oldFirstgid: e.oldFirstgid, oldTileCount: e.oldTileCount, newFirstgid: e.ts.firstgid }
                : undefined))

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId: tilemap.id,
            tilemapLabel: tilemap.label,
            tileset: {
                name: info.name,
                imageKey,
                tileWidth: info.tileWidth,
                tileHeight: info.tileHeight,
                margin: info.margin,
                spacing: info.spacing,
                firstgid: info.firstgid,
                tilecount: grid.tileCount,
                columns: grid.columns,
                rows: grid.rows,
                imageUrl: img.url,
                imageSize: { width: img.width, height: img.height }
            },
            tilesetCount: tilemap.data.tilesets.length
        }, null, 2))
    }
)

defTool(
    "scene-delete-tileset-from-editable-tilemap",
    "Delete a tileset from an editable tilemap. This will remove the tileset from the tilemap data, but it will not delete the tileset asset itself. It also will update the ID of the tiles of every layer in the map.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            tilemapId: { type: "string", description: "The `id` of the editable tilemap to delete the tileset from. An 'editable tilemap' is not the same as a Tiled tilemap." },
            tilesetName: { type: "string", description: "The name of the tileset to delete from the editable tilemap. This should match the name defined in the tilemap's tilesets." }
        },
        required: ["tilemapId", "tilesetName"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const tilemap = findEditableTilemap(doc, args.tilemapId)

        const index = tilemap.data.tilesets.findIndex(ts => ts.name === args.tilesetName)

        if (index === -1) {
            throw new Error(`Tileset "${args.tilesetName}" not found in the editable tilemap "${tilemap.label}". Tilesets: ${tilemap.data.tilesets.map(t => t.name).join(", ") || "(none)"}`)
        }

        // capture the layout before the change (needed to remap the gids of all the layers)
        const oldLayout = tilemap.data.tilesets.map(ts => ({
            ts,
            oldFirstgid: ts.firstgid,
            oldTileCount: editableTilesetTileCount(ts)
        }))

        const [removed] = tilemap.data.tilesets.splice(index, 1)

        recomputeEditableFirstGids(tilemap.data.tilesets)

        const remaining = new Set(tilemap.data.tilesets)

        // gids of the removed tileset become -1; the others are rebased to the new firstgids
        remapEditableLayerTiles(tilemap.data.layers, oldLayout.map(e =>
            remaining.has(e.ts)
                ? { oldFirstgid: e.oldFirstgid, oldTileCount: e.oldTileCount, newFirstgid: e.ts.firstgid }
                : undefined))

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId: tilemap.id,
            tilemapLabel: tilemap.label,
            removed: { name: removed.name, imageKey: removed.imageKey },
            tilesetCount: tilemap.data.tilesets.length,
            tilesets: tilemap.data.tilesets.map(t => ({ name: t.name, firstgid: t.firstgid }))
        }, null, 2))
    }
)

defTool(
    "scene-add-editable-tilemap-layer",
    "Add an editable tilemap layer to an editable tilemap. Because the complexity of the editable tilemaps, we provide a couple of dedicated tools. An editable tilemap is different to a Tiled map because all the data can be edited by the user in the scene editor. This method adds a layer to the tilemap data but also it adds an EditableLayer game object to the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            tilemapId: { type: "string", description: "The `id` of the editable tilemap to add the layer to. An 'editable tilemap' is not the same as a Tiled tilemap." },
            layer: {
                type: "object",
                properties: {
                    name: { type: "string", description: "The name of the layer in the editable tilemap. The name is also used to generate a variable name in code, so it should be a valid variable name." },
                    width: { type: "number", description: "The width of the layer in tiles." },
                    height: { type: "number", description: "The height of the layer in tiles." },
                    tileWidth: { type: "number", description: "The width of each tile in pixels." },
                    tileHeight: { type: "number", description: "The height of each tile in pixels." }
                },
                required: ["name", "width", "height", "tileWidth", "tileHeight"]
            }
        },
        required: ["tilemapId", "layer"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const tilemap = findEditableTilemap(doc, args.tilemapId)

        const l = args.layer || {}

        const width = Math.trunc(Number(l.width))
        const height = Math.trunc(Number(l.height))

        if (!(width > 0) || !(height > 0)) throw new Error("`layer.width` and `layer.height` (in tiles) must be positive numbers.")
        if (!l.name) throw new Error("`layer.name` is required.")

        const layerName = uniqueEditableLayerName(
            doc,
            tilemap.data.layers.map(x => x.name),
            String(l.name))

        const layerEntry = {
            id: crypto.randomUUID(),
            name: layerName,
            width,
            height,
            data: emptyEditableLayerData(width, height)
        }

        tilemap.data.layers.push(layerEntry)

        const layerObject = makeEditableLayerGameObject(tilemap.id, layerName, 0, 0)

        doc.displayList = doc.displayList || []
        doc.displayList.push(layerObject)

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId: tilemap.id,
            layerId: layerObject.id,
            layerEntryId: layerEntry.id,
            layerName,
            width,
            height
        }, null, 2))
    }
)

defTool(
    "scene-resize-editable-tilemap-layer",
    "Resize an editable tilemap layer. This will resize the layer data, but it will not resize the layer game object itself. It also will update the ID of the tiles of every layer in the map.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            layerId: { type: "string", description: "The `id` of the editable tilemap layer to resize. An editable tilemap layer is also a game object, so you can use the `id` of the EditableLayer game object." },
            width: { type: "number", description: "The new width of the layer in tiles." },
            height: { type: "number", description: "The new height of the layer in tiles." }
        },
        required: ["layerId", "width", "height"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const width = Math.trunc(Number(args.width))
        const height = Math.trunc(Number(args.height))

        if (!(width > 0) || !(height > 0)) throw new Error("`width` and `height` (in tiles) must be positive numbers.")

        const { tilemap, layerEntry } = resolveEditableLayer(doc, args.layerId)

        // resize preserving the overlapping cells (mirror of EditableTilemap.resizeLayer)
        const newData = []

        for (let y = 0; y < height; y++) {

            const row = []
            const oldRow = layerEntry.data[y]

            for (let x = 0; x < width; x++) {
                row.push(oldRow && x < oldRow.length ? oldRow[x] : -1)
            }

            newData.push(row)
        }

        layerEntry.width = width
        layerEntry.height = height
        layerEntry.data = newData

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId: tilemap.id,
            layerId: args.layerId,
            layerName: layerEntry.name,
            width,
            height
        }, null, 2))
    }
)

defTool(
    "scene-write-editable-tilemap-layer-data",
    "Write part of the tile data of an editable tilemap layer. This is useful to update a layer's data without having to send the whole layer data again.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            layerId: { type: "string", description: "The `id` of the editable tilemap layer to write to. An editable tilemap layer is also a game object, so you can use the `id` of the EditableLayer game object." },
            data: {
                type: "array",
                items: { type: "array", items: { type: "number" } },
                description: "The tile data to write to the layer. Each item is a tile ID, or -1 for an empty tile. The tile ID is a global ID that is computed by the index (starting from 1) of the tile in the tileset. If there are more than one tileset, then the global ID is computed by adding the length of each tileset. The data is a 2D array, where each inner array represents a row of tiles."
            },
            x: { type: "number", description: "The x coordinate of the top left corner of the data to write." },
            y: { type: "number", description: "The y coordinate of the top left corner of the data to write." }
        },
        required: ["layerId", "data", "x", "y"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const data = args.data

        if (!Array.isArray(data) || !data.every(r => Array.isArray(r))) {
            throw new Error("`data` must be a 2D array of tile ids: an array of rows, each row an array of numbers (-1 = empty tile).")
        }

        const { tilemap, layerEntry } = resolveEditableLayer(doc, args.layerId)

        const x0 = Math.trunc(Number(args.x ?? 0))
        const y0 = Math.trunc(Number(args.y ?? 0))

        // write the rows at the offset, clipping to the layer bounds
        let written = 0

        for (let ry = 0; ry < data.length; ry++) {

            const y = y0 + ry

            if (y < 0 || y >= layerEntry.height) continue

            const row = data[ry]

            for (let rx = 0; rx < row.length; rx++) {

                const x = x0 + rx

                if (x < 0 || x >= layerEntry.width) continue

                const gid = Math.trunc(Number(row[rx]))

                layerEntry.data[y][x] = Number.isFinite(gid) ? gid : -1
                written++
            }
        }

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId: tilemap.id,
            layerId: args.layerId,
            layerName: layerEntry.name,
            x: x0,
            y: y0,
            cellsWritten: written
        }, null, 2))
    }
)

defTool(
    "scene-fill-editable-tilemap-layer-data",
    "Fill a region of the tile data of an editable tilemap layer with a single tile ID. This is useful to do things like clear the layer (fill the full layer with a -1 tile), or to paint backgrounds, filling the layer with the background tile, or filling just a part of the layer like for making a floor, or any other level element.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            layerId: { type: "string", description: "The `id` of the editable tilemap layer to fill. An editable tilemap layer is also a game object, so you can use the `id` of the EditableLayer game object." },
            x: { type: "number", description: "The x coordinate of the top left corner of the region to fill." },
            y: { type: "number", description: "The y coordinate of the top left corner of the region to fill." },
            width: { type: "number", description: "The width of the region to fill in tiles." },
            height: { type: "number", description: "The height of the region to fill in tiles." },
            tileId: { type: "number", description: "The tile ID to fill the region with. The tile ID is a global ID that is computed by the index (starting from 1) of the tile in the tileset. If there are more than one tileset, then the global ID is computed by adding the length of each tileset." }
        },
        required: ["layerId", "x", "y", "width", "height", "tileId"]
    },
    async (args) => {

        const { file, doc } = requireScene(args)

        const x0 = Math.trunc(Number(args.x ?? 0))
        const y0 = Math.trunc(Number(args.y ?? 0))
        const w = Math.trunc(Number(args.width))
        const h = Math.trunc(Number(args.height))
        const tileId = Math.trunc(Number(args.tileId))

        if (!(w > 0) || !(h > 0)) throw new Error("`width` and `height` (in tiles) must be positive numbers.")
        if (!Number.isFinite(tileId)) throw new Error("`tileId` must be a number (-1 = empty tile).")

        const { tilemap, layerEntry } = resolveEditableLayer(doc, args.layerId)

        // fill the rect, clipped to the layer bounds
        let filled = 0

        for (let y = Math.max(0, y0); y < Math.min(layerEntry.height, y0 + h); y++) {
            for (let x = Math.max(0, x0); x < Math.min(layerEntry.width, x0 + w); x++) {
                layerEntry.data[y][x] = tileId
                filled++
            }
        }

        writeSceneFile(file, doc)

        return text(JSON.stringify({
            tilemapId: tilemap.id,
            layerId: args.layerId,
            layerName: layerEntry.name,
            x: x0,
            y: y0,
            width: w,
            height: h,
            tileId,
            cellsFilled: filled
        }, null, 2))
    }
)

defTool(
    "scene-get-editable-tilemap-layer-selection-data",
    "Get the selected tile data of an editable tilemap layer. It returns a 2D array with the tile IDs. The selection is always a rectangular region of the tilemap layer.",
    {
        type: "object",
        properties: { ...sceneIdProps }
    },
    async (args) => {

        const { file } = requireScene(args)

        // editor-UI dependent: the tile selection lives in the running editor
        const result = await bridgeCommand({
            tool: "scene-get-editable-tilemap-layer-selection-data",
            args: { scenePath: file }
        })

        if (result && result.__error) throw new Error(result.__error)

        return text(JSON.stringify(result, null, 2))
    }
)

defTool(
    "ide-create-new-prefab-scene",
    "Create a new prefab scene file (an empty prefab: a reusable game-object class). Add the prefab root object right after with scene-add-game-objects (the first added object becomes the prefab object).",
    {
        type: "object",
        properties: {
            name: { type: "string", description: "The name of the prefab file. Extension added automatically." },
            folder: { type: "string", description: "Optional project-relative folder, default 'scenes'." }
        },
        required: ["name"]
    },
    async ({ name, folder }) => {
        const clean = String(name).replace(/\.prefab$|\.scene$/i, "").replace(/[^\w-]/g, "_")
        const dir = normPath(folder || "scenes")
        // the v3 client uses the .scene extension for prefab files too
        // (the sceneType field inside the JSON marks them as PREFAB)
        const rel = path.posix.join(dir, clean + ".scene")
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error("invalid folder")
        const doc = newSceneDoc(clean)
        doc.sceneType = "PREFAB"
        writeSceneFile(rel, doc, { exclusive: true })
        return text(`Prefab scene file created: ${rel} (id ${doc.id}). Now add the prefab root object with scene-add-game-objects.`)
    }
)

defTool(
    "ide-get-all-prefabs-in-project",
    "Get all prefabs in the project.",
    { type: "object", properties: {} },
    async () => {
        const prefabs = []
        for (const f of sceneFiles()) {
            const doc = readSceneFile(f)
            if (doc && doc.sceneType === "PREFAB") {
                const root = (doc.displayList || [])[0]
                prefabs.push({
                    prefabPath: f,
                    prefabId: doc.id,
                    prefabName: path.basename(f).replace(/\.(prefab|scene)$/i, ""),
                    rootObjectType: root?.type,
                    extends: root?.prefabId || null
                })
            }
        }
        return text(JSON.stringify({ prefabs }, null, 2))
    }
)

defTool(
    "ide-get-prefab-inheritance",
    "Get the array of prefabs in the inheritance chain of the given prefab (from the prefab itself up to the root).",
    { type: "object", properties: { prefabId: { type: "string", description: "The id of the prefab scene." } }, required: ["prefabId"] },
    async ({ prefabId }) => {
        const chain = []
        let current = prefabId
        const guard = new Set()
        while (current && !guard.has(current)) {
            guard.add(current)
            const found = findSceneFileById(current)
            if (!found) throw new Error(`Prefab not found for id: ${current}`)
            const root = (found.doc.displayList || [])[0]
            chain.push({
                prefabId: found.doc.id,
                prefabPath: found.file,
                prefabName: path.basename(found.file).replace(/\.(prefab|scene)$/i, ""),
                rootObjectType: root?.type || null
            })
            current = root?.prefabId
        }
        return text(JSON.stringify({ inheritance: chain }, null, 2))
    }
)

defTool(
    "scene-get-nested-prefabs-instances",
    "Get all the nested prefab instances of the given prefab instance (the prefab instances that are children of it).",
    {
        type: "object",
        properties: { ...sceneIdProps, id: { type: "string", description: "The id (or label) of the prefab instance game object." } },
        required: ["id"]
    },
    async (args) => {
        const { doc } = requireScene(args)
        const found = findObjects(doc, [args.id], [args.id])
        if (!found.length) throw new Error(`Object not found: ${args.id}`)
        const parent = found[0].obj
        const nested = []
        const collect = (list) => (list || []).forEach(o => {
            if (o.prefabId) nested.push(cleanPublic(o))
            collect(o.nestedPrefabs)
            collect(o.list)
        })
        collect(parent.nestedPrefabs)
        collect(parent.list)
        // also expose the nested prefab instances coming from the prefab file itself
        if (parent.prefabId && !nested.length) {
            const prefabDoc = findSceneFileById(parent.prefabId)
            if (prefabDoc) {
                const root = (prefabDoc.doc.displayList || [])[0]
                collect(root?.list)
            }
        }
        return text(JSON.stringify({ nestedPrefabInstances: nested }, null, 2))
    }
)

/* ==================== arcade physics enable/disable ======================= */

defTool(
    "scene-enable-arcade-physics-body",
    "Adds an Arcade physics body to the given game objects. To set the body properties afterwards use scene-update-game-objects with the body.* properties.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            updates: {
                type: "array",
                items: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
            }
        },
        required: ["updates"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const enabled = []
        for (const u of args.updates || []) {
            const found = findObjects(doc, [u.id], [u.id])
            if (!found.length) throw new Error(`Object not found: ${u.id}`)
            const obj = found[0].obj
            if (!ARCADE_CAPABLE_TYPES.has(obj.type)) {
                throw new Error(`Object type "${obj.type}" does not expose an Arcade physics component in this editor build.`)
            }
            obj["ArcadeComponent.active"] = true
            delete obj["Arcade.active"]
            if (obj.physicsType === undefined) obj.physicsType = 0
            if (obj.bodyGeometry === undefined) obj.bodyGeometry = 1
            enabled.push({ id: obj.id, label: obj.label })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ enabled }, null, 2))
    }
)

defTool(
    "scene-disable-arcade-physics-body",
    "Removes the Arcade physics body from the given game objects.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            ids: { type: "array", items: { type: "string" }, description: "The ids of the objects." }
        },
        required: ["ids"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const disabled = []
        for (const id of args.ids || []) {
            const found = findObjects(doc, [id], [id])
            if (!found.length) throw new Error(`Object not found: ${id}`)
            const obj = found[0].obj
            delete obj["Arcade.active"]
            delete obj["ArcadeComponent.active"]
            for (const k of Object.keys(obj)) {
                if (k === "body" || k.startsWith("body.")) delete obj[k]
            }
            for (const key of Object.values(ARCADE_PROPERTY_ALIASES)) {
                if (key !== "ArcadeComponent.active") delete obj[key]
            }
            if (Array.isArray(obj.components)) {
                obj.components = obj.components.filter(name => name !== "Arcade" && name !== "ArcadeComponent")
                if (obj.components.length === 0) delete obj.components
            }
            disabled.push({ id: obj.id, label: obj.label })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ disabled }, null, 2))
    }
)

/* ========================== filters (Phaser 4) ============================ */

const FILTER_TYPES = ["Glow", "Shadow", "Pixelate", "Blur", "Barrel", "Displacement",
    "Bokeh", "Blend", "ObjectMask", "TextureMask", "Threshold", "ColorMatrix"]

// parents whose default pipeline is preFX (internal); others use the external list
const PREFX_DEFAULT_PARENTS = new Set(["Image", "Sprite", "Text", "TileSprite", "RenderTexture", "Video"])

function findFilterObject(doc, filterId) {
    for (const { obj, parent } of flatObjects(doc)) {
        for (const fx of (obj.list || [])) {
            if (fx.id === filterId || fx.label === filterId) return { fx, parent: obj }
        }
        if (obj.id === filterId && FILTER_TYPES.includes(obj.type)) return { fx: obj, parent }
    }
    // filters of the scene root (external/scene filters)
    for (const fx of (doc.displayList || [])) {
        if (fx.id === filterId && FILTER_TYPES.includes(fx.type)) return { fx, parent: null }
    }
    return null
}

defTool(
    "scene-add-game-object-filters",
    "Add multiple filters (Phaser 4 filters like Glow, Shadow, Blur, ...) to game objects of the scene. Types: " + FILTER_TYPES.join(", ") + ".",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objects: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: FILTER_TYPES },
                        parentId: { type: "string", description: "The id (or label) of the game object that will own the filter." },
                        internal: { type: "boolean", description: "true = the object's internal filter list (default). false = the scene's filter list." },
                        properties: { type: "object", description: "The filter properties (e.g. color, outerStrength for Glow)." }
                    },
                    required: ["type", "parentId"]
                }
            }
        },
        required: ["objects"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const added = []
        // count existing filter labels to generate unique ones (no state stored in the doc)
        let fxCount = 0
        const countFx = (list) => (list || []).forEach(o => {
            if (FILTER_TYPES.includes(o.type)) fxCount++
            countFx(o.list)
        })
        countFx(doc.displayList)
        for (const entry of args.objects || []) {
            if (!FILTER_TYPES.includes(entry.type)) throw new Error(`Unknown filter type "${entry.type}". Supported: ${FILTER_TYPES.join(", ")}`)
            const found = findObjects(doc, [entry.parentId], [entry.parentId])
            if (!found.length) throw new Error(`Parent object not found: ${entry.parentId}`)
            const parent = found[0].obj
            const internal = entry.internal !== undefined ? entry.internal : PREFX_DEFAULT_PARENTS.has(parent.type)
            fxCount++
            const fx = {
                type: entry.type,
                id: crypto.randomUUID(),
                label: entry.type.toLowerCase() + "_" + fxCount
            }
            if (internal) fx.preFX = true
            for (const [k, v] of Object.entries(entry.properties || {})) fx[k] = v
            parent.list = parent.list || []
            parent.list.push(fx)
            added.push({ id: fx.id, label: fx.label, type: fx.type, parentId: parent.id, internal })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ added }, null, 2))
    }
)

defTool(
    "scene-update-game-object-filters",
    "Update the properties of the given filters, optionally moving them between the internal (object) and external (scene) filter lists.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            objects: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "The id of the filter to update." },
                        type: { type: "string", enum: FILTER_TYPES, description: "For validation." },
                        internal: { type: "boolean" },
                        properties: { type: "object", description: "The filter properties to update." }
                    },
                    required: ["id", "type"]
                }
            }
        },
        required: ["objects"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const updated = []
        for (const entry of args.objects || []) {
            const found = findFilterObject(doc, entry.id)
            if (!found) throw new Error(`Filter not found: ${entry.id}`)
            const { fx } = found
            for (const [k, v] of Object.entries(entry.properties || {})) fx[k] = v
            if (entry.internal !== undefined) {
                if (entry.internal) fx.preFX = true
                else delete fx.preFX
            }
            updated.push({ id: fx.id, label: fx.label, type: fx.type })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ updated }, null, 2))
    }
)

defTool(
    "scene-delete-game-object-filters",
    "Delete the given filters from the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            filterIds: { type: "array", items: { type: "string" }, description: "The ids of the filters to delete." }
        },
        required: ["filterIds"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const ids = new Set(args.filterIds || [])
        let deleted = 0
        const prune = (list) => {
            for (const obj of list || []) {
                if (Array.isArray(obj.list)) {
                    obj.list = obj.list.filter(fx => {
                        if (ids.has(fx.id) || ids.has(fx.label)) { deleted++; return false }
                        return true
                    })
                    if (obj.list.length === 0) delete obj.list
                    prune(obj.list)
                }
            }
        }
        prune(doc.displayList)
        const beforeRoot = (doc.displayList || []).length
        if (beforeRoot !== (doc.displayList = (doc.displayList || []).filter(fx => {
            if (FILTER_TYPES.includes(fx.type) && (ids.has(fx.id) || ids.has(fx.label))) { deleted++; return false }
            return true
        })).length) deleted += beforeRoot - doc.displayList.length
        writeSceneFile(file, doc)
        return text(`Deleted ${deleted} filter(s).`)
    }
)

defTool(
    "scene-update-game-object-filter-list",
    "Move a filter between the internal filter list of its parent object (internal=true) and the scene's filter list (internal=false).",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            filterId: { type: "string", description: "The id of the filter." },
            internal: { type: "boolean", description: "true = internal (object) list, false = external (scene) list." }
        },
        required: ["filterId", "internal"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const found = findFilterObject(doc, args.filterId)
        if (!found) throw new Error(`Filter not found: ${args.filterId}`)
        const { fx } = found
        if (args.internal) fx.preFX = true
        else delete fx.preFX
        writeSceneFile(file, doc)
        return text(`Filter ${fx.id} moved to the ${args.internal ? "internal (object)" : "external (scene)"} filter list.`)
    }
)

/* ============================ object lists ================================ */

function findObjectList(doc, id) {
    return (doc.lists || []).find(l => l.id === id || l.label === id)
}

defTool(
    "scene-add-object-list",
    "Create Object Lists: arrays of game-object ids used to group objects (e.g. for arcade physics colliders).",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            lists: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        label: { type: "string", description: "The name of the list (valid variable identifier)." },
                        scope: { type: "string", enum: ["LOCAL", "PUBLIC", "METHOD", "CLASS", "NESTED_PREFAB"] },
                        objectIds: { type: "array", items: { type: "string" }, description: "The ids (or labels) of the objects in the list." }
                    },
                    required: ["label"]
                }
            }
        },
        required: ["lists"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        doc.lists = doc.lists || []
        const added = []
        for (const l of args.lists || []) {
            const list = {
                id: crypto.randomUUID(),
                label: l.label,
                objectIds: (l.objectIds || []).map(idOrLabel => {
                    const found = findObjects(doc, [idOrLabel], [idOrLabel])
                    return found.length ? found[0].obj.id : idOrLabel
                })
            }
            if (l.scope) list.scope = l.scope
            doc.lists.push(list)
            added.push({ id: list.id, label: list.label, objectIds: list.objectIds })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ added }, null, 2))
    }
)

defTool(
    "scene-update-object-list",
    "Update an Object List (rename it, change its scope or its object ids).",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            id: { type: "string", description: "The id (or label) of the object list to update." },
            label: { type: "string" },
            scope: { type: "string", enum: ["LOCAL", "PUBLIC", "METHOD", "CLASS", "NESTED_PREFAB"] },
            objectIds: { type: "array", items: { type: "string" } }
        },
        required: ["id"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const list = findObjectList(doc, args.id)
        if (!list) throw new Error(`Object list not found: ${args.id}. Available: ${(doc.lists || []).map(l => l.label).join(", ") || "(none)"}`)
        if (args.label !== undefined) list.label = args.label
        if (args.scope !== undefined) list.scope = args.scope
        if (args.objectIds !== undefined) {
            list.objectIds = args.objectIds.map(idOrLabel => {
                const found = findObjects(doc, [idOrLabel], [idOrLabel])
                return found.length ? found[0].obj.id : idOrLabel
            })
        }
        writeSceneFile(file, doc)
        return text(JSON.stringify({ updated: list }, null, 2))
    }
)

defTool(
    "scene-remove-object-list",
    "Remove Object Lists from the scene.",
    {
        type: "object",
        properties: {
            ...sceneIdProps,
            listIds: { type: "array", items: { type: "string" }, description: "The ids (or labels) of the lists to remove." }
        },
        required: ["listIds"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const ids = new Set(args.listIds || [])
        const before = (doc.lists || []).length
        doc.lists = (doc.lists || []).filter(l => !ids.has(l.id) && !ids.has(l.label))
        writeSceneFile(file, doc)
        return text(`Removed ${before - doc.lists.length} object list(s).`)
    }
)

/* ========================== prefab user properties ======================== */

const USER_PROPERTY_IDS = ["number", "string", "boolean", "color", "keycode", "expression", "option",
    "objectVar", "object-ref", "constructor", "event", "texture-config", "animation-key", "audio-key",
    "asset-key", "scene-key", "spine-skin-name", "spine-animation-name", "spine-event"]

defTool(
    "scene-declare-prefab-property",
    "Declare a user property in the given prefab scene. The property becomes a field of the prefab class, settable on every prefab instance.",
    {
        type: "object",
        properties: {
            sceneId: { type: "string", description: "The id of the prefab scene." },
            name: { type: "string", description: "The name of the property (used as the class field name)." },
            label: { type: "string", description: "The display name in the editor UI." },
            tooltip: { type: "string", description: "A short description." },
            type: {
                type: "object",
                properties: {
                    id: { type: "string", enum: USER_PROPERTY_IDS },
                    isArray: { type: "boolean" },
                    options: { type: "array", items: { type: "string" }, description: "Required if type id is 'option'." }
                },
                required: ["id"]
            },
            defValue: { description: "The default value of the property (format depends on the type)." },
            defArrayValue: { type: "array", description: "The default array if isArray is true." },
            customDefinition: { type: "boolean", description: "If true, no field is generated in code." }
        },
        required: ["sceneId", "name", "type", "defValue"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        if (doc.sceneType !== "PREFAB") throw new Error(`Scene ${file} is not a prefab. Use a prefab scene id (see ide-get-all-prefabs-in-project).`)
        doc.prefabProperties = doc.prefabProperties || []
        if (doc.prefabProperties.some(p => p.name === args.name)) {
            throw new Error(`Property "${args.name}" already exists in prefab ${file}`)
        }
        const prop = {
            name: args.name,
            label: args.label || args.name,
            tooltip: args.tooltip || args.name,
            defValue: args.defValue,
            customDefinition: args.customDefinition ?? false,
            type: { id: args.type.id }
        }
        if (args.type.isArray !== undefined) prop.type.isArray = args.type.isArray
        if (args.type.options) prop.type.options = args.type.options
        if (args.defArrayValue !== undefined) prop.defArrayValue = args.defArrayValue
        doc.prefabProperties.push(prop)
        writeSceneFile(file, doc)
        return text(JSON.stringify({ declared: prop }, null, 2))
    }
)

defTool(
    "scene-delete-prefab-property",
    "Delete a user property from the given prefab scene.",
    {
        type: "object",
        properties: {
            sceneId: { type: "string", description: "The id of the prefab scene." },
            name: { type: "string", description: "The name of the user property to delete." }
        },
        required: ["sceneId", "name"]
    },
    async (args) => {
        const { file, doc } = requireScene(args)
        const before = (doc.prefabProperties || []).length
        doc.prefabProperties = (doc.prefabProperties || []).filter(p => p.name !== args.name)
        writeSceneFile(file, doc)
        return text(`Deleted ${before - (doc.prefabProperties || []).length} prefab property(ies).`)
    }
)

/* ============================== asset tools =============================== */

defTool(
    "assets-get-available-asset-packs",
    "Get all available asset packs in the project, with their entries.",
    { type: "object", properties: {} },
    async () => {
        const packs = parseAssetPacks().map(p => ({
            file: p.file,
            entryCount: p.entries.length,
            entries: p.entries.map(e => ({ key: e.key, type: e.type, url: e.url }))
        }))
        return text(JSON.stringify({ assetPacks: packs }, null, 2))
    }
)

defTool(
    "assets-get-texture-size",
    "Get the width and height (in pixels) of a texture.",
    {
        type: "object",
        properties: {
            key: { type: "string", description: "The key of the texture." },
            texture: {
                type: "object",
                properties: { key: { type: "string" } },
                required: ["key"],
                description: "Alternative official shape."
            }
        },
        anyOf: [{ required: ["key"] }, { required: ["texture"] }]
    },
    async (args) => {
        const key = textureKeyOf(args)
        const url = findTextureUrl(key)
        if (!url) throw new Error(`Texture "${key}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Texture file not found: ${url}`)
        const size = parseImageSize(readFileSafely(PROJECT_DIR, full))
        if (!size) throw new Error(`Cannot parse image size of ${url}`)
        return text(JSON.stringify({ key, url, ...size }, null, 2))
    }
)

defTool(
    "assets-get-bitmapfont-image",
    "Get the PNG image/texture of the given bitmap font.",
    { type: "object", properties: { key: { type: "string", description: "The key of the bitmap font." } }, required: ["key"] },
    async ({ key }) => {
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && e.type === "bitmapFont")
            if (e) {
                // the font page image: textureFilename or same base name as the .fnt/.xml
                const imgUrl = e.textureFilename
                    || e.url.replace(/\.(fnt|xml|json)$/i, ".png")
                const full = safeJoin(PROJECT_DIR, imgUrl)
                if (!full) throw new Error(`Bitmap font image not found: ${imgUrl}`)
                const mime = path.extname(full).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png"
                return image(readFileSafely(PROJECT_DIR, full).toString("base64"), mime)
            }
        }
        throw new Error(`Bitmap font "${key}" not found`)
    }
)

defTool(
    "assets-get-spritesheet-image",
    "Get the PNG image/texture of the given spritesheet (to understand frame positions).",
    { type: "object", properties: { key: { type: "string", description: "The key of the spritesheet." } }, required: ["key"] },
    async ({ key }) => {
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && e.type === "spritesheet")
            if (e) {
                const full = safeJoin(PROJECT_DIR, e.url)
                if (!full) throw new Error(`Spritesheet image not found: ${e.url}`)
                const mime = path.extname(full).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png"
                return image(readFileSafely(PROJECT_DIR, full).toString("base64"), mime)
            }
        }
        throw new Error(`Spritesheet "${key}" not found`)
    }
)

defTool(
    "assets-get-available-spine-skeletons",
    "Get all the Spine skeletons (spineJson/spineBinary assets) in the project.",
    { type: "object", properties: {} },
    async () => {
        const skeletons = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "spineJson" || e.type === "spineBinary") {
                    skeletons.push({ key: e.key, type: e.type, url: e.url, packFile: pack.file })
                }
            }
        }
        return text(JSON.stringify({ spineSkeletons: skeletons }, null, 2))
    }
)

defTool(
    "assets-get-available-spine-atlases",
    "Get all the Spine atlases in the project.",
    { type: "object", properties: {} },
    async () => {
        const atlases = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "spineAtlas") atlases.push({ key: e.key, url: e.url, packFile: pack.file })
            }
        }
        return text(JSON.stringify({ spineAtlases: atlases }, null, 2))
    }
)

defTool(
    "assets-get-spine-skeleton-info",
    "Get the info (animations and skins) of a Spine skeleton by parsing its JSON data file.",
    {
        type: "object",
        properties: {
            dataKey: { type: "string", description: "The key of the spine data (skeleton) asset." },
            atlasKey: { type: "string", description: "The key of the spine atlas asset." }
        },
        required: ["dataKey", "atlasKey"]
    },
    async ({ dataKey, atlasKey }) => {
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === dataKey && (e.type === "spineJson" || e.type === "spineBinary"))
            if (e) { url = e.url; break }
        }
        if (!url) throw new Error(`Spine skeleton "${dataKey}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Spine data file not found: ${url}`)
        const fileStat = await statProjectFileSafely(PROJECT_DIR, full)
        if (!fileStat?.isFile()) throw new Error(`Spine data file not found: ${url}`)
        if (!url.toLowerCase().endsWith(".json")) {
            return text(`Skeleton "${dataKey}" is binary (.skel): parse it in the editor for full info.`)
        }
        const data = JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 16 * 1024 * 1024))
        const skins = (Array.isArray(data.skins) ? data.skins : [])
            .map(s => typeof s === "string" ? s : s.name).filter(Boolean)
        return text(JSON.stringify({
            dataKey, atlasKey, spineVersion: data.spine, skeletonName: data.skeleton?.name,
            skins, animations: Object.keys(data.animations || {})
        }, null, 2))
    }
)

defTool(
    "assets-get-spine-skin-image",
    "Get a PNG preview of a Spine skin and animation from the selected skeleton and atlas.",
    {
        type: "object",
        properties: {
            dataKey: { type: "string", description: "The key of the Spine skeleton asset." },
            atlasKey: { type: "string", description: "The key of the Spine atlas asset." },
            skinName: { type: "string", description: "The exact Spine skin name." },
            animationName: { type: "string", description: "The exact Spine animation name." }
        },
        required: ["dataKey", "atlasKey", "skinName", "animationName"]
    },
    async (args) => forwardToEditor("assets-get-spine-skin-image", args)
)

defTool(
    "assets-get-tilemap-data",
    "Get the data (layers, tilesets, objects) of a Tiled tilemap file.",
    { type: "object", properties: { key: { type: "string", description: "The key of the tilemap in the asset pack." } }, required: ["key"] },
    async ({ key }) => {
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && e.type && e.type.startsWith("tilemap"))
            if (e) { url = e.url; break }
        }
        if (!url) throw new Error(`Tilemap "${key}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Tilemap file not found: ${url}`)
        const raw = readFileSafely(PROJECT_DIR, full, "utf8", 16 * 1024 * 1024)
        if (url.toLowerCase().endsWith(".json")) {
            const data = JSON.parse(raw)
            return text(JSON.stringify({
                key, url, width: data.width, height: data.height, tileWidth: data.tilewidth, tileHeight: data.tileheight,
                orientation: data.orientation, layers: (data.layers || []).map(l => ({ name: l.name, type: l.type, width: l.width, height: l.height })),
                tilesets: (data.tilesets || []).map(t => ({ name: t.name, image: t.image }))
            }, null, 2))
        }
        return text(raw.slice(0, 4000))
    }
)

/* ============================== google fonts ============================== */

async function fetchGoogleFontFamilies(filter) {
    const resp = await fetch("https://fonts.google.com/metadata/fonts", {
        headers: { "User-Agent": "Mozilla/5.0 (PhaserEditor2D MCP)" }
    })
    let raw = await resp.text()
    if (raw.startsWith(")]}'")) raw = raw.slice(raw.indexOf("\n") + 1)
    const data = JSON.parse(raw)
    const list = data.familyMetadataList || data.families || []
    const families = list
        .map(f => f.family)
        .filter(f => typeof f === "string")
        .filter(f => !filter || f.toLowerCase().includes(String(filter).toLowerCase()))
    return families
}

defTool(
    "assets-get-google-font-families",
    "Get the Google Fonts list of families (connects to the Google Fonts API). Optionally filtered.",
    { type: "object", properties: { filter: { type: "string", description: "Optional filter string." } } },
    async ({ filter }) => {
        try {
            const families = await fetchGoogleFontFamilies(filter)
            return text(JSON.stringify({ count: families.length, families: families.slice(0, 200) }, null, 2))
        } catch (e) {
            return text(`Could not reach the Google Fonts service: ${e.message}`)
        }
    }
)

defTool(
    "assets-get-google-font-info",
    "Get the Google Fonts info (TTF URL) for a given font family.",
    { type: "object", properties: { family: { type: "string", description: "The font family, exactly as in Google Fonts." } }, required: ["family"] },
    async ({ family }) => {
        const resp = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, {
            headers: { "User-Agent": "" }
        })
        if (!resp.ok) throw new Error(`Google Fonts responded ${resp.status} for family "${family}"`)
        const css = await resp.text()
        const m = css.match(/url\((https:[^)]+\.ttf)\)/)
        if (!m) throw new Error(`Could not find a TTF URL for family "${family}"`)
        return text(JSON.stringify({ family, url: m[1] }, null, 2))
    }
)

defTool(
    "assets-add-google-font-to-asset-pack",
    "Add a Google Font configuration to the given asset pack (required to use the font in scene Text objects).",
    {
        type: "object",
        properties: {
            assetPackFileName: { type: "string", description: "The project-relative path of the asset pack file." },
            key: { type: "string", description: "The key of the font, unique in the project." },
            family: { type: "string", description: "The font family, exactly as in Google Fonts." },
            url: { type: "string", description: "The TTF URL (from assets-get-google-font-info). Optional: fetched automatically if omitted." }
        },
        required: ["assetPackFileName", "key", "family"]
    },
    async ({ assetPackFileName, key, family, url }) => {
        const rel = normPath(assetPackFileName)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error(`Asset pack not found: ${rel}`)
        if (!url) {
            const info = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, { headers: { "User-Agent": "" } })
            const css = await info.text()
            const m = css.match(/url\((https:[^)]+\.ttf)\)/)
            if (!m) throw new Error(`Could not resolve the TTF URL for family "${family}"`)
            url = m[1]
        }
        const pack = JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 8 * 1024 * 1024))
        const sectionName = Object.keys(pack).find(k => pack[k] && Array.isArray(pack[k].files)) || "section1"
        pack[sectionName] = pack[sectionName] || { files: [] }
        if (pack[sectionName].files.some(f => f.key === key)) throw new Error(`Key "${key}" already exists in ${rel}`)
        pack[sectionName].files.push({ key, type: "font", url, family })
        if (!writeFileSafely(PROJECT_DIR, full, JSON.stringify(pack, null, 4))) {
            throw new Error("invalid asset pack path: " + rel)
        }
        notifyFilesChanged()
        return text(`Font "${key}" (${family}) added to ${rel}.`)
    }
)

/* =========================== bridge (SSE channel) ========================= */

const bridgeClients = new Map()
const pendingCommands = new Map()
let activeBridgeClientId = null

const BRIDGE_CLIENT_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/
const BRIDGE_COMMAND_TIMEOUT_MS = 20000

function selectActiveBridgeClient() {
    const active = activeBridgeClientId ? bridgeClients.get(activeBridgeClientId) : null
    if (active) return active

    const clients = [...bridgeClients.values()]
    const solidClient = clients
        .filter(client => client.clientType === "solidjs")
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
    const candidate = solidClient ?? (clients.length === 1 ? clients[0] : null)
    activeBridgeClientId = candidate?.clientId ?? null
    return candidate ?? null
}

function rejectPendingForClient(clientId, reason) {
    for (const [id, pending] of pendingCommands) {
        if (pending.clientId !== clientId) continue
        clearTimeout(pending.timer)
        pendingCommands.delete(id)
        pending.reject(new Error(reason))
    }
}

function removeBridgeClient(clientId, expectedClient = null) {
    const client = bridgeClients.get(clientId)
    if (!client || (expectedClient && client !== expectedClient)) return false

    bridgeClients.delete(clientId)
    rejectPendingForClient(clientId, "The editor session disconnected before responding to the MCP command.")
    if (activeBridgeClientId === clientId) activeBridgeClientId = null
    selectActiveBridgeClient()
    log(`mcp-bridge: editor disconnected (${bridgeClients.size} client(s)); active=${activeBridgeClientId ?? "none"}`)
    return true
}

function activateBridgeClient(clientId) {
    const client = bridgeClients.get(clientId)
    if (!client) return false
    client.lastActiveAt = Date.now()
    activeBridgeClientId = clientId
    return true
}

function bridgeStatus() {
    const active = selectActiveBridgeClient()
    return {
        connected: bridgeClients.size > 0,
        clients: bridgeClients.size,
        activeClientId: active?.clientId ?? null,
        activeClientType: active?.clientType ?? null,
        sessions: [...bridgeClients.values()].map(client => ({
            clientId: client.clientId,
            clientType: client.clientType,
            connectedAt: client.connectedAt,
            active: client.clientId === activeBridgeClientId
        }))
    }
}

function bridgeCommand(command) {
    return new Promise((resolve, reject) => {
        const client = selectActiveBridgeClient()
        if (!client) {
            const hint = bridgeClients.size > 1
                ? "Several editor sessions are connected but none is active. Focus the editor tab and retry."
                : "Open the SolidJS Editor Host or legacy editor in a browser tab."
            return reject(new Error(`Codogma Engine is not connected to an active MCP bridge session. ${hint}`))
        }

        const id = crypto.randomUUID()
        const timer = setTimeout(() => {
            pendingCommands.delete(id)
            reject(new Error(`Editor session did not respond to command "${command.tool}" in time (20s).`))
        }, BRIDGE_COMMAND_TIMEOUT_MS)
        timer.unref?.()

        pendingCommands.set(id, {
            resolve,
            reject,
            timer,
            command,
            clientId: client.clientId
        })
        const payload = `event: command\ndata: ${JSON.stringify({ id, clientId: client.clientId, ...command })}\n\n`
        try {
            client.res.write(payload)
        } catch (error) {
            clearTimeout(timer)
            pendingCommands.delete(id)
            removeBridgeClient(client.clientId, client)
            reject(new Error(`Could not send command to editor session: ${error.message}`))
        }
    })
}

async function forwardToEditor(tool, args) {
    const result = await bridgeCommand({ tool, args })
    if (result && result.__error) throw new Error(String(result.__error))
    if (result && result.__image) {
        return image(result.data, result.mimeType || "image/png")
    }
    return text(typeof result === "string" ? result : JSON.stringify(result, null, 2))
}

export function bridgeClientCount() {
    return bridgeClients.size
}

export function getBridgeStatus() {
    return bridgeStatus()
}

export async function handleBridgeEvents(req, res) {
    const url = new URL(req.url || "/editor/mcp-bridge/events", "http://127.0.0.1")
    const clientType = url.searchParams.get("clientType") === "solidjs" ? "solidjs" : "legacy"
    // Session identity is generated by the server, never accepted from the URL.
    // This prevents a reconnecting or competing client from choosing another
    // editor's command-result identity.
    const clientId = crypto.randomUUID()

    const client = {
        clientId,
        clientType,
        res,
        connectedAt: new Date().toISOString(),
        lastActiveAt: Date.now()
    }

    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
    })
    bridgeClients.set(clientId, client)
    if (clientType === "solidjs" || !activeBridgeClientId) activateBridgeClient(clientId)
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, clientType, active: clientId === activeBridgeClientId })}\n\n`)
    log(`mcp-bridge: ${clientType} editor connected (${bridgeClients.size} client(s)); active=${activeBridgeClientId ?? "none"}`)

    const ping = setInterval(() => {
        try {
            if (!res.write(": ping\n\n")) return
        } catch (error) {
            removeBridgeClient(clientId, client)
        }
    }, 15000)
    ping.unref?.()

    const disconnect = () => {
        clearInterval(ping)
        removeBridgeClient(clientId, client)
    }
    res.on?.("close", disconnect)
    res.on?.("error", disconnect)
}

export async function handleBridgeActivate(req, res) {
    let body
    try {
        body = await readBody(req)
    } catch (error) {
        return sendJSON(res, { error: `Invalid activation request: ${error.message}` })
    }
    if (typeof body.clientId !== "string" || !activateBridgeClient(body.clientId)) {
        return sendJSON(res, { error: "Editor bridge session is not connected." })
    }
    log(`mcp-bridge: active editor session changed to ${body.clientId}`)
    return sendJSON(res, { ok: true, ...bridgeStatus() })
}

export async function handleBridgeResult(req, res) {
    const body = await readBody(req)
    const pending = pendingCommands.get(body.id)
    if (!pending) return sendJSON(res, { error: "unknown command id" })

    if (typeof body.clientId !== "string" || body.clientId !== pending.clientId) {
        return sendJSON(res, { error: "command result belongs to a different editor session" })
    }

    clearTimeout(pending.timer)
    pendingCommands.delete(body.id)
    if (body.result && body.result.__error) {
        pending.reject(new Error(String(body.result.__error)))
    } else {
        pending.resolve(body.result)
    }
    return sendJSON(res, { ok: true })
}

/** Official-style bridge entry point: { tool, args } -> tool result. */
export async function handleBridgeRequest(req, res) {
    const body = await readBody(req)
    if (!body || typeof body.tool !== "string") {
        return sendJSON(res, { error: "missing tool name" })
    }
    try {
        if (body.tool === "__tools_list__") {
            return sendJSON(res, {
                tools: [...TOOLS.values()].map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema
                }))
            })
        }
        const result = await dispatchTool(body.tool, body.args || {})
        return sendJSON(res, result)
    } catch (e) {
        return sendJSON(res, { error: String(e.message || e) })
    }
}

/**
 * Official `@phaserjs/editor-mcp-server` bridge contract (v5-compatible).
 *
 * The official stdio package (ToolsManager.defineTool) does:
 *     response = await fetch("http://127.0.0.1:1902", { body: JSON.stringify({ tool, args }) })
 *     return { content: response.json() }
 *
 * so this endpoint must respond with the MCP content ARRAY itself,
 * not wrapped in a { content } object.
 */
export async function handleOfficialBridgeRequest(req, res) {
    let body
    try {
        body = await readBody(req)
    } catch (e) {
        return sendJSON(res, [{ type: "text", text: `Invalid bridge request body: ${e.message}` }])
    }
    if (!body || typeof body.tool !== "string") {
        return sendJSON(res, [{ type: "text", text: "Invalid bridge request: missing tool name." }])
    }
    log(`mcp-bridge-1902: ${body.tool}`)
    try {
        const result = await dispatchTool(body.tool, body.args || {})
        if (result && Array.isArray(result.content)) {
            return sendJSON(res, result.content)
        }
        return sendJSON(res, [{ type: "text", text: JSON.stringify(result ?? null, null, 2) }])
    } catch (e) {
        return sendJSON(res, [{ type: "text", text: `Tool '${body.tool}' error: ${e.message}` }])
    }
}

export function getBridgeToolsList() {
    return [...TOOLS.values()].map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
    }))
}

/* ============================ MCP HTTP handler ============================ */

export async function handleMcpHttpRequest(req, res) {
    if (req.method === "GET") {
        // server-initiated SSE not required; stateless JSON server
        res.writeHead(405, { "Content-Type": "application/json" })
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "GET not supported (stateless server)" }, id: null }))
    }
    if (req.method === "OPTIONS") {
        // This endpoint sits behind the server's loopback/origin guard, so
        // cross-origin browser use is not a supported scenario. Only echo a
        // loopback http origin back; never grant a wildcard.
        let allowOrigin = null
        const origin = req.headers.origin
        if (typeof origin === "string") {
            try {
                const parsed = new URL(origin)
                const host = parsed.hostname
                if (parsed.protocol === "http:"
                    && (host === "127.0.0.1" || host === "localhost" || host === "::1")) {
                    allowOrigin = origin
                }
            } catch (e) {
                // keep allowOrigin = null
            }
        }
        const headers = {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Authorization",
            "Vary": "Origin"
        }
        if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin
        res.writeHead(204, headers)
        return res.end()
    }
    if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" })
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }))
    }

    let msg
    try {
        msg = await readBody(req)
    } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }))
    }

    const isNotification = msg.id === undefined || msg.id === null
    const reply = (result) => {
        if (isNotification) {
            res.writeHead(202, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
            return res.end()
        }
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }))
    }
    const replyError = (code, message) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } }))
    }

    try {
        switch (msg.method) {

            case "initialize":
                return reply({
                    protocolVersion: msg.params?.protocolVersion || "2025-03-26",
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: {
                        name: "phaser-editor-mcp",
                        title: "Codogma Engine MCP Server (local open-source implementation)",
                        version: "1.0.0"
                    },
                    instructions: "Codogma Engine MCP server. Call the `get-system-instructions` tool first to learn how to build the arguments of the scene/asset tools."
                })

            case "notifications/initialized":
                return reply({})

            case "ping":
                return reply({})

            case "tools/list":
                return reply({
                    tools: [...TOOLS.values()].map(t => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: t.inputSchema
                    }))
                })

            case "tools/call": {
                const name = msg.params?.name
                const args = msg.params?.arguments || {}
                const tool = TOOLS.get(name)
                if (!tool) {
                    return replyError(-32602, `Unknown tool: ${name}`)
                }
                log(`mcp: tools/call ${name}`)
                try {
                    const result = await tool.exec(args)
                    return reply(result)
                } catch (e) {
                    return reply({
                        content: [{ type: "text", text: `Tool '${name}' error: ${e.message}` }],
                        isError: true
                    })
                }
            }

            default:
                return replyError(-32601, `Method not found: ${msg.method}`)
        }
    } catch (e) {
        return replyError(-32603, String(e.message || e))
    }
}

/* =============================== dispatcher =============================== */

function text(t) {
    return { content: [{ type: "text", text: t }] }
}

function image(base64, mimeType) {
    return { content: [{ type: "image", data: base64, mimeType }] }
}

export async function dispatchTool(name, args) {
    const tool = TOOLS.get(name)
    if (!tool) throw new Error(`Unknown tool: ${name}`)
    return tool.exec(args || {})
}

export function getSystemInstructions() {
    return text(SYSTEM_INSTRUCTIONS)
}

/** System prompt + tool-call protocol for the AI Chat loop (v5 "AI Chat"). */
export function getChatSystemPrompt() {

    const toolLines = [...TOOLS.values()]
        .map(t => `- ${t.name}: ${t.description.split(".")[0]}.`)
        .join("\n")

    return `${SYSTEM_INSTRUCTIONS}

## Available tools

${toolLines}

## Tool call protocol

To execute a tool, output a fenced block like:

\`\`\`tool
{"name": "scene-add-game-objects", "args": { "scenePath": "scenes/MyScene.scene", "objects": [] }}
\`\`\`

Rules:
- One tool call per fenced block; you may include several blocks to run tools sequentially.
- After each of your replies containing tool blocks, the environment executes them and sends back a "TOOL RESULTS" message. Then continue with the next step (more tool calls or the final answer).
- When the task is complete, reply with a final summary and NO tool blocks.
- Write ONLY valid JSON inside the tool blocks: no comments, no template placeholders, no unescaped quotes. If a tool returns an error, read it carefully, fix the arguments and retry.

## Example of a complete correct workflow

User: "Create a scene called CoinRush with a dino and a score text."

\`\`\`tool
{"name": "ide-create-new-scene", "args": {"name": "CoinRush", "folder": "scenes"}}
\`\`\`

\`\`\`tool
{"name": "scene-add-game-objects", "args": {"scenePath": "scenes/CoinRush.scene", "objects": [
  {"type": "Image", "properties": {"label": "player", "texture": {"key": "dino"}, "x": 400, "y": 300}},
  {"type": "Text", "properties": {"label": "scoreText", "text": "Score: 0", "x": 20, "y": 16, "color": "#ffffff"}}
]}}
\`\`\`

\`\`\`tool
{"name": "scene-get-screenshot", "args": {"scenePath": "scenes/CoinRush.scene", "x": 0, "y": 0, "width": 800, "height": 600}}
\`\`\`

Final answer (no tool blocks): "Scene CoinRush created with the player at (400,300) and a score text at (20,16). Open it in the editor with ide-open-scene if you want to polish the layout."

The \`texture.key\` must be one of the keys returned by \`assets-get-available-textures\` (e.g. "dino"). Scene references are project-relative paths like "scenes/CoinRush.scene".`
}

defTool(
    "get-system-instructions",
    "Get the system instructions. This is fully required for the LLM to know how to build the arguments of this MCP server tools. Call this first.",
    { type: "object", properties: {} },
    async () => text(SYSTEM_INSTRUCTIONS)
)

/* =============================== small utils ============================== */

const MAX_MCP_BODY_BYTES = 32 * 1024 * 1024

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        let settled = false

        const cleanup = () => {
            req.off("data", onData)
            req.off("end", onEnd)
            req.off("error", onError)
        }

        const onData = chunk => {
            if (settled) return
            size += chunk.length
            if (size > MAX_MCP_BODY_BYTES) {
                settled = true
                cleanup()
                req.resume()
                const error = new Error("Request body too large")
                error.statusCode = 413
                reject(error)
                return
            }
            chunks.push(chunk)
        }

        const onEnd = () => {
            if (settled) return
            settled = true
            cleanup()
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"))
            } catch {
                reject(new Error("invalid JSON body"))
            }
        }

        const onError = error => {
            if (settled) return
            settled = true
            cleanup()
            reject(error)
        }

        req.on("data", onData)
        req.on("end", onEnd)
        req.on("error", onError)
    })
}

function sendJSON(res, data) {
    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
    })
    res.end(JSON.stringify(data))
}
