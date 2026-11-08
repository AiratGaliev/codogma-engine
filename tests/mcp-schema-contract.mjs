import assert from "node:assert/strict"

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
        if (schema.properties) {
            for (const name of schema.required) {
                assert.ok(name in schema.properties,
                    `${label}: required "${name}" is not declared in properties`)
            }
        }
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

    if (schema.prefixItems !== undefined) {
        assert.ok(Array.isArray(schema.prefixItems), `${label}: prefixItems must be an array`)
        schema.prefixItems.forEach((child, index) =>
            assertSchemaNode(child, `${label}.prefixItems[${index}]`, depth + 1))
    }

    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
        assertSchemaNode(schema.additionalProperties, `${label}.additionalProperties`, depth + 1)
    }

    if (schema.propertyNames !== undefined) assertSchemaNode(schema.propertyNames, `${label}.propertyNames`, depth + 1)
}

export function assertToolInputSchema(toolName, schema) {
    assertSchemaNode(schema, `tools[${toolName}].inputSchema`)
    assert.equal(schema.type, "object", `${toolName}: root inputSchema.type must be object`)
    assert.ok(schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties),
        `${toolName}: root inputSchema.properties must be an object`)

    let nestedSchemaCount = 0
    let optionalFieldCount = 0

    function countNested(node, depth = 0) {
        if (!node || typeof node !== "object" || Array.isArray(node) || depth > 80) return
        for (const [name, child] of Object.entries(node.properties || {})) {
            nestedSchemaCount += 1
            if (!(node.required || []).includes(name)) optionalFieldCount += 1
            countNested(child, depth + 1)
        }
        for (const keyword of ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames"]) {
            const child = node[keyword]
            if (Array.isArray(child)) child.forEach(item => countNested(item, depth + 1))
            else countNested(child, depth + 1)
        }
        for (const keyword of COMPOSITION_KEYWORDS) {
            for (const child of node[keyword] || []) countNested(child, depth + 1)
        }
        for (const keyword of SCHEMA_MAP_KEYWORDS) {
            const map = node[keyword]
            if (map && typeof map === "object" && !Array.isArray(map)) {
                for (const child of Object.values(map)) countNested(child, depth + 1)
            }
        }
        for (const child of node.prefixItems || []) countNested(child, depth + 1)
    }

    countNested(schema)
    return { nestedSchemaCount, optionalFieldCount }
}
