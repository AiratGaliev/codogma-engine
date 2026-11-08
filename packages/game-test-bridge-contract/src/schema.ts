import schema from "./schemas/v1/game-test-bridge.schema.json" with { type: "json" };
import type { AnySchema } from "ajv";

export const GAME_TEST_BRIDGE_SCHEMA_ID =
  "https://schemas.codogma.com/game-test-bridge/1.0.0/schema.json";

export const GAME_TEST_BRIDGE_SCHEMA = schema as AnySchema;

export default GAME_TEST_BRIDGE_SCHEMA;
