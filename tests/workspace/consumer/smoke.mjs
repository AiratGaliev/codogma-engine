import assert from "node:assert/strict";

import * as core from "@codogma/cge";
import * as localization from "@codogma/localization";
import * as editorMcp from "@codogma/editor-mcp-server";
import * as bridge from "@codogma/game-test-bridge-contract";
import schema from "@codogma/game-test-bridge-contract/schema/v1" with { type: "json" };

assert.equal(typeof core.createEngineRuntime, "function");
assert.equal(typeof localization.LocalizationService, "function");
assert.equal(typeof localization.parseLocalizationTable, "function");
assert.equal(typeof editorMcp.resolveEngineMcpUrl, "function");
assert.equal(typeof editorMcp.createCodogmaMcpServer, "function");
assert.equal(typeof bridge.validateHandshake, "function");
assert.equal(typeof bridge.validateRuntimeSnapshot, "function");
assert.equal(typeof schema, "object");
assert.ok(schema && !Array.isArray(schema));

console.log("Workspace consumer fixture resolved public package exports and the Game Test Bridge schema.");
