# @codogma/game-test-bridge-contract

Engine-owned, transport-neutral and versioned JSON contracts for the Codogma Game Test Bridge. This package defines the wire format shared by Development/Test runtime adapters and future QA clients. It does not implement a runtime bridge, transport, Preview Host, browser automation or gameplay behavior.

The package is intentionally independent: it imports no Phaser, DOM, Editor Host, Colibri, Codogma Core, Editor MCP or Browser Controller modules. The only runtime dependency is Ajv for JSON Schema Draft 2020-12 validation.

## Package commands

Use Node.js 22 or later and run from this directory:

~~~sh
npm ci
npm run typecheck
npm run build
npm test
npm run quality:check
~~~

- **typecheck** checks production source and TypeScript tests with the strict ADR-0002 compiler profile.
- **build** emits ESM JavaScript, declarations and the versioned schema JSON.
- **test** compiles the TypeScript node:test suite and runs its conformance tests.
- **quality:check** runs typecheck, build and tests.
- **package-lock.json** pins the standalone dependency graph. This package is not connected to npm Workspaces or the root lockfile.

## Public API

Import DTO types and validation/helpers from the package root:

~~~ts
import {
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  validateHandshake,
  validateRuntimeSnapshot,
  validateGameTestEvent,
  validateEventPage,
  validateTestActionRequest,
  negotiateContractVersions,
  negotiateCapabilities,
  authorizeRegisteredTestAction
} from "@codogma/game-test-bridge-contract";
import type {
  HandshakeMessage,
  RuntimeSnapshot,
  GameTestEvent,
  EventPage,
  TestActionRequest
} from "@codogma/game-test-bridge-contract";
~~~

The canonical JSON Schema can also be consumed without importing the validator:

~~~ts
import schema from "@codogma/game-test-bridge-contract/schema/v1";
~~~

The schema source is src/schemas/v1/game-test-bridge.schema.json. Its public identifier is:

~~~text
https://schemas.codogma.com/game-test-bridge/1.0.0/schema.json
~~~

### Handshake

A handshake identifies the engine/runtime adapter, project revision, build/preview and test session. Protocol and schema versions are separate because their compatibility can evolve independently.

~~~json
{
  "kind": "game-test-bridge.handshake",
  "protocolVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "supportedProtocolVersions": {
    "minimum": "1.0.0",
    "maximumExclusive": "2.0.0"
  },
  "supportedSchemaVersions": {
    "minimum": "1.0.0",
    "maximumExclusive": "2.0.0"
  },
  "engineVersion": "1.0.0",
  "runtimeAdapterVersion": "1.2.0",
  "projectRevision": "revision-abc123",
  "buildId": "build-42",
  "previewId": "preview-42",
  "testSessionId": "session-42",
  "profile": "test",
  "actionPolicy": "registered-only",
  "readiness": {
    "state": "ready",
    "readyForTest": true,
    "diagnostics": []
  },
  "capabilities": [],
  "registeredActions": []
}
~~~

A receiver validates external input before using it. A valid JSON Schema shape is necessary but not sufficient for compatibility: consumers must also compare the peer current protocol/schema version with the ranges supported by both participants.

~~~ts
const validation = validateHandshake(untrustedMessage);
if (!validation.success) {
  // Handle validation.errors as structured, payload-free diagnostics.
} else {
  const compatibility = negotiateContractVersions(localVersionSet, validation.value);
  if (!compatibility.compatible) {
    // Do not exchange messages using an incompatible contract.
  }
}
~~~

Version strings use numeric major.minor.patch form without prerelease/build metadata. A range has an inclusive minimum and exclusive maximumExclusive. Both participants must accept the other participant current protocol and schema version.

### Runtime snapshot

Snapshots expose only stable opaque references, declared type IDs, lifecycle state, transforms and explicitly allowlisted diagnostics. Component diagnostic objects have fixed fields and cannot carry arbitrary runtime properties.

~~~json
{
  "kind": "game-test-bridge.snapshot",
  "schemaVersion": "1.0.0",
  "testSessionId": "session-42",
  "capturedAt": 1793742000000,
  "timeDomain": "unix-ms",
  "readiness": {
    "state": "ready",
    "readyForTest": true,
    "diagnostics": []
  },
  "activeScene": {
    "sceneRef": "scene:world-1",
    "typeId": "game.scene.world",
    "state": "active"
  },
  "entities": [],
  "resources": [],
  "metrics": [],
  "diagnostics": []
}
~~~

The values of sceneRef, entityRef, componentRef and resourceRef are opaque stable strings. A consumer must not parse them, infer a hierarchy from their spelling or treat them as a second identity authority. The package does not allocate IDs or define runtime-to-project mapping.

Metrics carry a source, sample time/window and accuracy marker. Runtime adapters publish only measurements they can substantiate.

### Typed events and event pages

The schema defines payload contracts for scene lifecycle, entity spawn/destroy, component attach/detach, resource load/fail, animation lifecycle, observed input, pause/resume and scene transition. Project-owned semantic events use a name, their own schema version and JSON data.

physics.contact and gameplay.semantic require the corresponding declared capabilities (events.physics.contact and events.gameplay.semantic). Their presence in the shared schema does not claim that a runtime adapter implements them. Unknown future event types are accepted as opaque JSON envelopes for forward compatibility; consumers must ignore unrecognized event types rather than execute them.

~~~json
{
  "kind": "game-test-bridge.event",
  "eventId": "event-11",
  "sequence": 11,
  "timestamp": 1793742000016,
  "timeDomain": "monotonic-ms",
  "testSessionId": "session-42",
  "entityRef": "entity#player-1",
  "eventType": "entity.spawned",
  "payload": {
    "entityRef": "entity#player-1",
    "typeId": "game.entity.player"
  }
}
~~~

Event reads use opaque cursors. A page reports events in strictly increasing sequence order and carries stream integrity metadata:

- coverage complete means the producer can guarantee completeness for the requested interval.
- coverage partial requires a known gap, overflow or known lost-event count.
- coverage unknown means completeness cannot be asserted.
- sequenceGaps contains explicit inclusive lost sequence ranges and their source.
- bufferOverflow reports bounded buffer capacity and the number of dropped events when known.
- lostEventCount null means the exact total is unknown; it must not be represented as zero.

A missing event is not evidence that an event did not occur when coverage is partial or unknown. Filters may intentionally omit unrelated event types/entities; producers must not report those filtered events as buffer loss.

### Capabilities and controlled test actions

Capability IDs are stable, namespaced identifiers. Unsupported capabilities remain visible and include a machine-readable reason code, human-readable message and retryability. A consumer can call negotiateCapabilities before relying on a required capability. A partial capability must include a reason; it does not satisfy a requirement for the complete capability. It may still list individual event types that are explicitly supported, and isEventTypeAvailable only accepts those listed event types. Do not infer runtime support merely because an event type exists in the shared schema.

Observation is the default. The handshake permits only the registered-only action policy and advertises an explicit registry. An action request references one registered action ID and exact version, plus JSON input; its descriptor names the input/output schema IDs and allowed profiles. The contract deliberately has no generic entity/component mutation operation.

Actions with effect controlled-state-change must declare exactly the test profile. Before dispatch, the host must validate the request, call authorizeRegisteredTestAction, and validate action-specific input against the schema owned by the action provider. This package only performs envelope validation and authorization checks; it does not execute actions.

~~~json
{
  "kind": "game-test-bridge.action-request",
  "requestId": "request-101",
  "testSessionId": "session-42",
  "actionId": "session.reset",
  "actionVersion": "1.0.0",
  "input": {
    "fixtureId": "level-one"
  }
}
~~~

A rejected/failed action returns a structured failure code and allowlisted diagnostics. It never falls back to arbitrary JavaScript execution or an unregistered command.

## JSON safety and limits

Every validator first inspects the input as a JSON value, then validates it against Draft 2020-12. The inspection rejects cycles, functions, symbols, bigint, undefined, non-finite numbers, accessors, sparse arrays, hidden/custom properties and class/runtime instances (including Date and Phaser-like objects). This prevents ordinary in-process values from leaking into the wire DTO; a JavaScript Proxy can still run traps during reflection and must not be treated as a safe transport boundary.

| Limit | Value |
|---|---:|
| Serialized wire message | 1 MiB |
| Event payload, action input or output | 64 KiB |
| Nesting depth | 32 |
| JSON nodes | 20,000 |
| Array items | 10,000 |
| Properties per JSON object | 256 |
| Extension namespaces | 32 |
| Extension key length | 128 characters |

Core DTO objects reject unknown properties. Additive, optional vendor data belongs under extensions, keyed by a stable namespace. Old readers may ignore unknown extension namespaces. This policy keeps core fields allowlisted while preserving an explicit forward-compatible extension point.

## Version evolution

- **Major:** incompatible wire semantics, removed/renamed required fields, changed meaning, or incompatible event/action payload changes. Increment both the relevant protocol/schema major as appropriate and publish a migration note.
- **Minor:** additive optional fields, extension namespace additions, new event types or capabilities. Older readers ignore unknown extension data and unknown event types.
- **Patch:** compatible schema corrections, clarifications and documentation fixes that do not change wire meaning.

Never silently reinterpret an existing field or reuse an event/capability/action ID for a different meaning. Protocol and schema versions are independent; keep both explicit in handshake messages and snapshots where applicable.

## Boundaries

This package contains DTOs, schemas, version/capability helpers, JSON validation and conformance fixtures only.

- It does not create an HTTP, WebSocket, SSE, MessagePort or other transport/listener.
- A future Preview Host owns the session-scoped channel, origin/session binding, capability token and channel lifecycle.
- It does not instrument Phaser, collect snapshots, publish events, allocate entity IDs or alter Project Model/Core contracts.
- It does not implement Browser Controller, Game QA MCP, Scenario Runner or Evidence Store.
- It is intended only for Development/Test profiles. It contains no runtime endpoint or gameplay code.
- Release-output exclusion remains a separate runtime/build integration acceptance item and is not proven by this contract package.

The package remains private while its API and release process are stabilized, consistent with the repository package architecture decision.
