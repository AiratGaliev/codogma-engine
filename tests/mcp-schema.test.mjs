import test from "node:test"
import assert from "node:assert/strict"

import { dispatchTool, getBridgeToolsList } from "../server/mcp.mjs"

const JSON_SCHEMA_TYPES = new Set(["null", "boolean", "object", "array", "number", "integer", "string"])
const COMPOSITION_KEYWORDS = ["allOf", "anyOf", "oneOf"]
const SINGLE_SCHEMA_KEYWORDS = ["not", "if", "then", "else", "contains", "propertyNames"]
const SCHEMA_MAP_KEYWORDS = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]

function assertSchemaNode(schema, label, depth = 0) {
    assert.ok(depth < 80, `${label}: schema nesting is unexpectedly deep`)
    if (typeof schema === "boolean") return
    assert.ok(schema && typeof schema === "object" && !Array.isArray(schema),
        `${label}: expected a JSON Schema object or boolean schema`)

    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type]
        assert.ok(types.length > 0, `${label}: type array must not be empty`)
        for (const type of types) {
            assert.ok(JSON_SCHEMA_TYPES.has(type), `${label}: invalid JSON Schema type ${String(type)}`)
        }
    }

    if (schema.properties !== undefined) {
        assert.ok(schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties),
            `${label}: properties must be an object`)
        for (const [name, child] of Object.entries(schema.properties)) {
            assertSchemaNode(child, `${label}.properties.${name}`, depth + 1)
        }
    }

    if (schema.required !== undefined) {
        assert.ok(Array.isArray(schema.required), `${label}: required must be an array`)
        assert.ok(schema.required.every(name => typeof name === "string"),
            `${label}: required entries must be strings`)
        assert.equal(new Set(schema.required).size, schema.required.length,
            `${label}: required entries must be unique`)
    }

    if (schema.enum !== undefined) {
        assert.ok(Array.isArray(schema.enum), `${label}: enum must be an array`)
    }

    for (const keyword of COMPOSITION_KEYWORDS) {
        if (schema[keyword] === undefined) continue
        assert.ok(Array.isArray(schema[keyword]) && schema[keyword].length > 0,
            `${label}: ${keyword} must be a non-empty schema array`)
        schema[keyword].forEach((child, index) =>
            assertSchemaNode(child, `${label}.${keyword}[${index}]`, depth + 1))
    }

    for (const keyword of SINGLE_SCHEMA_KEYWORDS) {
        if (schema[keyword] !== undefined) {
            assertSchemaNode(schema[keyword], `${label}.${keyword}`, depth + 1)
        }
    }

    for (const keyword of SCHEMA_MAP_KEYWORDS) {
        const map = schema[keyword]
        if (map === undefined) continue
        assert.ok(map && typeof map === "object" && !Array.isArray(map),
            `${label}: ${keyword} must be an object`)
        for (const [name, child] of Object.entries(map)) {
            assertSchemaNode(child, `${label}.${keyword}.${name}`, depth + 1)
        }
    }

    if (schema.items !== undefined) {
        if (Array.isArray(schema.items)) {
            schema.items.forEach((child, index) =>
                assertSchemaNode(child, `${label}.items[${index}]`, depth + 1))
        } else {
            assertSchemaNode(schema.items, `${label}.items`, depth + 1)
        }
    }

    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
        assertSchemaNode(schema.additionalProperties, `${label}.additionalProperties`, depth + 1)
    }
}

test("assets-get-texture-size schema requires one supported texture-key shape", () => {
    const tool = getBridgeToolsList().find(item => item.name === "assets-get-texture-size")
    assert.ok(tool, "texture-size MCP tool must be registered")
    assert.deepEqual(tool.inputSchema.anyOf, [
        { required: ["key"] },
        { required: ["texture"] }
    ])
    assert.deepEqual(tool.inputSchema.properties.texture.required, ["key"])
})

test("assets-get-texture-size rejects missing or non-string keys before touching project files", async () => {
    await assert.rejects(
        dispatchTool("assets-get-texture-size", {}),
        /Missing or invalid texture key/
    )
    await assert.rejects(
        dispatchTool("assets-get-texture-size", { key: 123 }),
        /Missing or invalid texture key/
    )
    await assert.rejects(
        dispatchTool("assets-get-texture-size", { texture: { key: "   " } }),
        /Missing or invalid texture key/
    )
})


test("all built-in MCP input schemas have structurally valid nested JSON Schema keywords", () => {
    const tools = getBridgeToolsList()
    assert.ok(tools.length > 0, "built-in MCP tools must be registered")
    const names = new Set()
    let nestedNodes = 0
    let nestedOptionalFields = 0

    for (const tool of tools) {
        assert.ok(!names.has(tool.name), `duplicate MCP tool name: ${tool.name}`)
        names.add(tool.name)
        const root = tool.inputSchema
        assertSchemaNode(root, `tools[${tool.name}].inputSchema`)
        assert.equal(root.type, "object", `${tool.name}: root input schema must be an object`)
        assert.ok(root.properties && typeof root.properties === "object" && !Array.isArray(root.properties),
            `${tool.name}: root input schema must declare properties`)

        function inspectNested(node, depth = 0) {
            if (!node || typeof node !== "object" || Array.isArray(node) || depth > 80) return
            for (const [propertyName, propertySchema] of Object.entries(node.properties || {})) {
                nestedNodes += 1
                if (!(node.required || []).includes(propertyName)) nestedOptionalFields += 1
                inspectNested(propertySchema, depth + 1)
            }
            for (const keyword of ["items", "additionalProperties", "not", "if", "then", "else", "contains"]) {
                const child = node[keyword]
                if (child && typeof child === "object" && !Array.isArray(child)) inspectNested(child, depth + 1)
                else if (Array.isArray(child)) child.forEach(item => inspectNested(item, depth + 1))
            }
            for (const keyword of ["allOf", "anyOf", "oneOf"]) {
                for (const child of node[keyword] || []) inspectNested(child, depth + 1)
            }
        }
        inspectNested(root)
    }

    assert.ok(nestedNodes > 0, "test must inspect nested schemas, not only tool roots")
    assert.ok(nestedOptionalFields > 0, "test must inspect optional fields in nested schemas")
})
