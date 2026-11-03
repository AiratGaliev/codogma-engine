import assert from "node:assert/strict";
import test from "node:test";
import handshakeFixture from "./fixtures/handshake.valid.json" with { type: "json" };
import incompatibleHandshakeFixture from "./fixtures/handshake.incompatible-versions.json" with { type: "json" };
import invalidHandshakeFixture from "./fixtures/handshake.invalid.json" with { type: "json" };
import snapshotFixture from "./fixtures/snapshot.valid.json" with { type: "json" };
import invalidSnapshotFixture from "./fixtures/snapshot.invalid-diagnostic.json" with { type: "json" };
import validEventPageFixture from "./fixtures/event-page.valid.json" with { type: "json" };
import gapEventPageFixture from "./fixtures/event-page.gaps-overflow.json" with { type: "json" };
import nonMonotonicEventPageFixture from "./fixtures/event-page.non-monotonic.json" with { type: "json" };
import unavailableCapabilityFixture from "./fixtures/capability.unavailable.json" with { type: "json" };
import validActionRequestFixture from "./fixtures/action-request.valid.json" with { type: "json" };
import unregisteredActionRequestFixture from "./fixtures/action-request.unregistered.json" with { type: "json" };
import rejectedActionResultFixture from "./fixtures/action-result.rejected.json" with { type: "json" };
import {
  MAX_WIRE_MESSAGE_BYTES,
  authorizeRegisteredTestAction,
  isEventTypeAvailable,
  isKnownEventType,
  negotiateCapabilities,
  negotiateContractVersions,
  validateCapabilityDescriptor,
  validateEventPage,
  validateEventReadRequest,
  validateGameTestEvent,
  validateHandshake,
  validateJsonValue,
  validateRuntimeSnapshot,
  validateTestActionDescriptor,
  validateTestActionRequest,
  validateTestActionResult,
} from "../src/index.js";
import type { CapabilityDescriptor, HandshakeMessage } from "../src/types.js";

test("accepts the valid versioned handshake and registered Test-profile action", () => {
  const result = validateHandshake(handshakeFixture);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.value.protocolVersion, "1.0.0");
  assert.equal(result.value.profile, "test");
  assert.equal(result.value.registeredActions.length, 1);
  assert.equal(result.value.actionPolicy, "registered-only");
});

test("rejects malformed identifiers and non-semver protocol versions", () => {
  const result = validateHandshake(invalidHandshakeFixture);
  assert.equal(result.success, false);
  if (result.success) return;

  assert.ok(result.errors.some((entry) =>
    entry.path === "/protocolVersion" || entry.path === "/testSessionId"
  ));
});

test("rejects incompatible protocol and schema version ranges", () => {
  const local = validateHandshake(handshakeFixture);
  const remote = validateHandshake(incompatibleHandshakeFixture);
  assert.equal(local.success, true);
  assert.equal(remote.success, true);
  if (!local.success || !remote.success) return;

  const result = negotiateContractVersions(local.value, remote.value);
  assert.equal(result.compatible, false);
  assert.equal(result.issues.length, 4);
});

test("accepts snapshots with opaque references and allowlisted diagnostics", () => {
  const result = validateRuntimeSnapshot(snapshotFixture);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.value.entities[0]?.entityRef, "entity#player-1");
  assert.equal(result.value.activeScene?.sceneRef, "scene:world-1");
});

test("rejects runtime object leakage through diagnostic fields", () => {
  const result = validateRuntimeSnapshot(invalidSnapshotFixture);
  assert.equal(result.success, false);
  if (result.success) return;

  assert.ok(result.errors.some((entry) => entry.path.includes("phaserObject")));
});

test("validates typed event families and cursor-based pages", () => {
  const result = validateEventPage(validEventPageFixture);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.value.events.length, 3);
  assert.equal(result.value.nextCursor, "cursor:page-2");
  assert.equal(isKnownEventType("entity.spawned"), true);
  assert.equal(isKnownEventType("org.example.future-event"), false);
});

test("preserves sequence gaps and overflow instead of claiming complete coverage", () => {
  const result = validateEventPage(gapEventPageFixture);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.value.integrity.coverage, "partial");
  assert.equal(result.value.integrity.lostEventCount, 2);
  assert.equal(result.value.integrity.sequenceGaps[0]?.fromSequence, 21);
});

test("rejects non-monotonic event sequences", () => {
  const result = validateEventPage(nonMonotonicEventPageFixture);
  assert.equal(result.success, false);
  if (result.success) return;

  assert.ok(result.errors.some((entry) => entry.code === "EVENT_SEQUENCE_NOT_MONOTONIC"));
});

test("rejects an event page that claims complete coverage after event loss", () => {
  const fixture = structuredClone(validEventPageFixture) as {
    integrity: { coverage: string; lostEventCount: number };
  } & Record<string, unknown>;
  fixture.integrity.coverage = "complete";
  fixture.integrity.lostEventCount = 1;

  const result = validateEventPage(fixture);
  assert.equal(result.success, false);
  if (result.success) return;

  assert.ok(result.errors.some((entry) => entry.code === "EVENT_COVERAGE_OVERCLAIMED"));
});

test("accepts unknown event types as opaque JSON for forward compatibility", () => {
  const fixture = {
    kind: "game-test-bridge.event",
    eventId: "event-future",
    sequence: 40,
    timestamp: 1793742000600,
    timeDomain: "monotonic-ms",
    testSessionId: "session-42",
    eventType: "org.example.future-event",
    payload: { extensionValue: [1, true, null] },
  };
  const result = validateGameTestEvent(fixture);
  assert.equal(result.success, true);
  assert.equal(isEventTypeAvailable("org.example.future-event", []), false);
});

test("validates capability descriptors and gates optional event families", () => {
  const unavailable = validateCapabilityDescriptor(unavailableCapabilityFixture);
  assert.equal(unavailable.success, true);
  if (!unavailable.success) return;

  assert.equal(isEventTypeAvailable("scene.started", []), true);
  assert.equal(isEventTypeAvailable("physics.contact", [unavailable.value]), false);
  assert.equal(isEventTypeAvailable("org.example.future-event", [unavailable.value]), false);

  const available: CapabilityDescriptor = {
    id: "events.physics.contact",
    version: "1.0.0",
    description: "Physics contact events are available.",
    scope: "runtime",
    status: "available",
    eventTypes: ["physics.contact"],
  };
  const validatedAvailable = validateCapabilityDescriptor(available);
  assert.equal(validatedAvailable.success, true);
  assert.equal(isEventTypeAvailable("physics.contact", [available]), true);

  assert.equal(validateCapabilityDescriptor({
    ...available,
    status: "partial",
  }).success, false);
});

test("reports unavailable capabilities with their structured reason", () => {
  const capability = validateCapabilityDescriptor(unavailableCapabilityFixture);
  assert.equal(capability.success, true);
  if (!capability.success) return;

  const result = negotiateCapabilities(["events.physics.contact"], [capability.value]);
  assert.equal(result.accepted, false);
  assert.equal(result.unsupported[0]?.reason.code, "RUNTIME_LIMITATION");
});

test("reports capabilities omitted by a runtime adapter", () => {
  const result = negotiateCapabilities(["events.input.raw"], []);
  assert.equal(result.accepted, false);
  assert.equal(result.unsupported[0]?.reason.code, "NOT_DECLARED");
});

test("validates registered action envelopes and rejects unregistered actions", () => {
  const handshake = validateHandshake(handshakeFixture);
  const validRequest = validateTestActionRequest(validActionRequestFixture);
  const unregisteredRequest = validateTestActionRequest(unregisteredActionRequestFixture);
  assert.equal(handshake.success, true);
  assert.equal(validRequest.success, true);
  assert.equal(unregisteredRequest.success, true);
  if (!handshake.success || !validRequest.success || !unregisteredRequest.success) return;

  assert.equal(validateTestActionDescriptor(handshake.value.registeredActions[0]).success, true);
  assert.equal(authorizeRegisteredTestAction(validRequest.value, handshake.value).allowed, true);

  const denied = authorizeRegisteredTestAction(unregisteredRequest.value, handshake.value);
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.failure.code, "ACTION_NOT_REGISTERED");
});

test("does not authorize controlled state changes in Development profile", () => {
  const handshake = validateHandshake(handshakeFixture);
  const request = validateTestActionRequest(validActionRequestFixture);
  assert.equal(handshake.success, true);
  assert.equal(request.success, true);
  if (!handshake.success || !request.success) return;

  const developmentHandshake: HandshakeMessage = {
    ...handshake.value,
    profile: "development",
  };
  const result = authorizeRegisteredTestAction(request.value, developmentHandshake);
  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.equal(result.failure.code, "PROFILE_NOT_ALLOWED");
});

test("validates structured action rejection results", () => {
  const result = validateTestActionResult(rejectedActionResultFixture);
  assert.equal(result.success, true);
});

test("validates cursor request bounds", () => {
  assert.equal(validateEventReadRequest({
    testSessionId: "session-42",
    cursor: null,
    limit: 100,
    eventTypes: ["scene.started"],
  }).success, true);

  assert.equal(validateEventReadRequest({
    testSessionId: "session-42",
    cursor: null,
    limit: 501,
  }).success, false);
});

test("rejects non-JSON JavaScript and runtime values before schema validation", () => {
  class PhaserLikeObject {
    readonly scene = { key: "private-scene" };
  }

  const cyclic: Record<string, unknown> = {};
  cyclic["self"] = cyclic;

  const accessor = Object.defineProperty({}, "runtimeValue", {
    enumerable: true,
    get: () => {
      throw new Error("The validator must not invoke accessors.");
    },
  });

  assert.equal(validateJsonValue(new Date()).success, false);
  assert.equal(validateJsonValue(new PhaserLikeObject()).success, false);
  assert.equal(validateJsonValue(cyclic).success, false);
  assert.equal(validateJsonValue(accessor).success, false);
  assert.equal(validateJsonValue({ value: Number.NaN }).success, false);
  assert.equal(validateJsonValue({ value: () => "not JSON" }).success, false);
});

test("enforces the serialized wire-size limit", () => {
  const oversized = Array.from({ length: 3000 }, () => "x".repeat(500));
  const result = validateJsonValue(oversized);

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "JSON_PAYLOAD_TOO_LARGE");
  assert.ok(MAX_WIRE_MESSAGE_BYTES > 0);
});
