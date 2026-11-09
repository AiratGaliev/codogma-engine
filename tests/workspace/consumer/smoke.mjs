import assert from "node:assert/strict";

import * as core from "@codogma/cge";
import * as features from "@codogma/feature-registry";
import * as localization from "@codogma/localization";
import * as editorMcp from "@codogma/editor-mcp-server";
import * as bridge from "@codogma/game-test-bridge-contract";
import * as bridgeSchema from "@codogma/game-test-bridge-contract/schema/v1";

assert.equal(typeof core.createEngineRuntime, "function");
assert.equal(typeof features.resolveFeatureSelection, "function");
assert.equal(typeof features.validateFeatureRegistryDocument, "function");
assert.equal(typeof features.createOptionalRuntimeFeatureRegistry, "function");
assert.equal(typeof localization.LocalizationService, "function");
assert.equal(typeof localization.parseLocalizationTable, "function");
assert.equal(typeof editorMcp.resolveEngineMcpUrl, "function");
assert.equal(typeof editorMcp.createCodogmaMcpServer, "function");
assert.equal(typeof bridge.validateHandshake, "function");
assert.equal(typeof bridge.validateRuntimeSnapshot, "function");
assert.equal(typeof bridgeSchema.GAME_TEST_BRIDGE_SCHEMA, "object");
assert.equal(typeof bridgeSchema.GAME_TEST_BRIDGE_SCHEMA_ID, "string");
assert.ok(bridgeSchema.GAME_TEST_BRIDGE_SCHEMA && !Array.isArray(bridgeSchema.GAME_TEST_BRIDGE_SCHEMA));

console.log("Workspace consumer fixture resolved public package exports, Feature Registry and the Game Test Bridge schema.");
