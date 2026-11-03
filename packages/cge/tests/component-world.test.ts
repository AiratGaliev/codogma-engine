import assert from "node:assert/strict";
import test from "node:test";
import {
  ComponentRegistrationError,
  ComponentRegistry,
  ComponentWorld,
  type ComponentBehavior,
  type ComponentSystem,
  type ComponentTypeDefinition,
  type ComponentTypeSchemaV1,
} from "../src/index.js";

const schema: ComponentTypeSchemaV1 = {
  schemaVersion: 1,
  typeId: "com.codogma.counter",
  name: "Counter",
  version: "1.0.0",
  properties: { step: { type: "number", defaultValue: 1, min: 0 } },
};

function createRegistry(log: string[]): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: ({ instanceId, node, properties }) => {
      const behavior: ComponentBehavior = {
        onCreate: () => log.push("create:" + instanceId + ":" + node.id + ":" + String(properties.step)),
        onEnable: () => log.push("enable:" + instanceId),
        onStart: () => log.push("start:" + instanceId),
        onUpdate: (delta) => log.push("update:" + instanceId + ":" + delta),
        onDisable: () => log.push("disable:" + instanceId),
        onDestroy: () => log.push("destroy:" + instanceId),
      };
      return behavior;
    },
  });
  return registry;
}

test("runs deterministic lifecycle only on explicit host ticks", () => {
  const log: string[] = [];
  const world = new ComponentWorld("scene-a", createRegistry(log), { idFactory: () => "instance-1" });
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", schema.typeId, {}, { instanceId: "instance-1" });
  world.update(1 / 60);
  world.setComponentEnabled("instance-1", false);
  world.setComponentEnabled("instance-1", true);
  world.update(1 / 60);
  world.removeComponent("instance-1");
  assert.deepEqual(log, [
    "create:instance-1:node-1:1",
    "enable:instance-1",
    "start:instance-1",
    "update:instance-1:0.016666666666666666",
    "disable:instance-1",
    "enable:instance-1",
    "update:instance-1:0.016666666666666666",
    "disable:instance-1",
    "destroy:instance-1",
  ]);
});

test("defers attach and detach requested during update until the tick boundary", () => {
  const log: string[] = [];
  let world: ComponentWorld;
  const registry = new ComponentRegistry();
  const mutatorSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.mutator",
    name: "Mutator",
    version: "1.0.0",
    properties: {},
  };
  registry.register({
    schema: mutatorSchema,
    create: () => ({
      onUpdate: () => {
        log.push("mutator:update");
        world.attachComponent("node-1", schema.typeId, {}, { instanceId: "queued" });
        world.removeComponent("mutator-instance");
      },
    }),
  });
  registry.register({
    schema,
    create: () => ({ onCreate: () => log.push("queued:create") }),
  });
  world = new ComponentWorld("scene-a", registry);
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", mutatorSchema.typeId, {}, { instanceId: "mutator-instance" });
  world.update(1 / 60);
  assert.equal(world.listComponents().some((item) => item.id === "mutator-instance"), false);
  assert.equal(world.listComponents().some((item) => item.id === "queued"), true);
  assert.deepEqual(log, ["mutator:update", "queued:create"]);
});

test("disposes the old scene world before the next scene is updated", () => {
  const log: string[] = [];
  const first = new ComponentWorld("scene-a", createRegistry(log));
  first.createNode({ id: "node-a", name: "First scene" });
  first.attachComponent("node-a", schema.typeId, {}, { instanceId: "first-component" });
  first.dispose();

  const second = new ComponentWorld("scene-b", createRegistry(log));
  second.createNode({ id: "node-b", name: "Second scene" });
  second.attachComponent("node-b", schema.typeId, {}, { instanceId: "second-component" });
  second.update(1 / 60);

  assert.equal(log.includes("destroy:first-component"), true);
  assert.equal(log.includes("update:first-component:0.016666666666666666"), false);
  assert.throws(() => first.update(1 / 60), /disposed/i);
});

test("rejects duplicate registrations and invalid frame deltas", () => {
  const registry = createRegistry([]);
  assert.throws(() => registry.register({ schema, create: () => ({}) }), /already registered/i);
  const world = new ComponentWorld("scene-a", registry);
  assert.throws(() => world.update(Number.NaN), /delta/i);
});


test("node activation transitions every attached component deterministically", () => {
  const log: string[] = [];
  const world = new ComponentWorld("scene-a", createRegistry(log));
  world.createNode({ id: "node-1", name: "Inactive", active: false });
  world.attachComponent("node-1", schema.typeId, {}, { instanceId: "inactive-component" });
  assert.deepEqual(log, ["create:inactive-component:node-1:1"]);

  world.setNodeActive("node-1", true);
  world.update(1 / 60);
  world.setNodeActive("node-1", false);
  world.setNodeActive("node-1", true);
  world.removeComponent("inactive-component");

  assert.deepEqual(log, [
    "create:inactive-component:node-1:1",
    "enable:inactive-component",
    "start:inactive-component",
    "update:inactive-component:0.016666666666666666",
    "disable:inactive-component",
    "enable:inactive-component",
    "disable:inactive-component",
    "destroy:inactive-component",
  ]);
});

test("cleanup continues for all components when lifecycle callbacks throw", () => {
  const log: string[] = [];
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: ({ instanceId }) => ({
      onDisable: () => {
        log.push("disable:" + instanceId);
        if (instanceId === "broken") throw new Error("disable failed");
      },
      onDestroy: () => {
        log.push("destroy:" + instanceId);
        if (instanceId === "broken") throw new Error("destroy failed");
      },
    }),
  });
  const world = new ComponentWorld("scene-a", registry);
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", schema.typeId, {}, { instanceId: "broken" });
  world.attachComponent("node-1", schema.typeId, {}, { instanceId: "healthy" });

  assert.throws(() => world.destroyNode("node-1"), AggregateError);
  assert.equal(world.nodeCount, 0);
  assert.equal(world.componentCount, 0);
  assert.deepEqual(log, [
    "disable:broken",
    "destroy:broken",
    "disable:healthy",
    "destroy:healthy",
  ]);
});

test("snapshots queued component properties when the attachment is requested", () => {
  const log: string[] = [];
  let world: ComponentWorld;
  const mutatorSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.property-snapshot",
    name: "Property Snapshot",
    version: "1.0.0",
    properties: {},
  };
  const registry = new ComponentRegistry();
  registry.register({
    schema: mutatorSchema,
    create: () => ({
      onUpdate: () => {
        const properties = { step: 1 };
        world.attachComponent("node-1", schema.typeId, properties, { instanceId: "snapshot-component" });
        properties.step = 9;
      },
    }),
  });
  registry.register({
    schema,
    create: ({ properties }) => ({
      onCreate: () => log.push("step:" + String(properties.step)),
    }),
  });
  world = new ComponentWorld("scene-a", registry);
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", mutatorSchema.typeId, {}, { instanceId: "mutator" });
  world.update(1 / 60);

  assert.deepEqual(log, ["step:1"]);
});

test("defers structural changes triggered by direct lifecycle callbacks until the operation boundary", () => {
  const log: string[] = [];
  let world: ComponentWorld;
  const parentSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.parent-mutator",
    name: "Parent Mutator",
    version: "1.0.0",
    properties: {},
  };
  const childSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.child-mutator",
    name: "Child Mutator",
    version: "1.0.0",
    properties: {},
  };
  const registry = new ComponentRegistry();
  registry.register({
    schema: parentSchema,
    create: () => ({
      onCreate: () => world.attachComponent("node-1", childSchema.typeId, {}, { instanceId: "child-component" }),
      onDestroy: () => log.push("parent:destroy"),
    }),
  });
  registry.register({
    schema: childSchema,
    create: () => ({ onCreate: () => log.push("child:create") }),
  });
  world = new ComponentWorld("scene-a", registry);
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", parentSchema.typeId, {}, { instanceId: "parent-component" });

  assert.equal(world.componentCount, 2);
  assert.deepEqual(log, ["child:create"]);
  world.removeComponent("parent-component");
  assert.equal(world.componentCount, 1);
  assert.deepEqual(log, ["child:create", "parent:destroy"]);
});

test("does not leave orphan components when a Node is destroyed from a lifecycle callback", () => {
  const mutatorSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.attach-on-destroy",
    name: "Attach On Destroy",
    version: "1.0.0",
    properties: {},
  };
  const registry = new ComponentRegistry();
  let world: ComponentWorld;
  registry.register({
    schema: mutatorSchema,
    create: () => ({
      onDestroy: () => world.attachComponent("node-1", mutatorSchema.typeId, {}, { instanceId: "orphan" }),
    }),
  });
  world = new ComponentWorld("scene-a", registry);
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", mutatorSchema.typeId, {}, { instanceId: "source" });

  assert.throws(() => world.destroyNode("node-1"), /was not found/);
  assert.equal(world.nodeCount, 0);
  assert.equal(world.componentCount, 0);
});

test("rejects lifecycle mutations during disposal and still releases every instance", () => {
  const log: string[] = [];
  const registry = new ComponentRegistry();
  let world: ComponentWorld;
  registry.register({
    schema,
    create: () => ({
      onDestroy: () => {
        log.push("destroying");
        world.attachComponent("node-1", schema.typeId, {}, { instanceId: "late-component" });
      },
    }),
  });
  world = new ComponentWorld("scene-a", registry);
  world.createNode({ id: "node-1", name: "Player" });
  world.attachComponent("node-1", schema.typeId, {}, { instanceId: "initial-component" });

  assert.throws(() => world.dispose(), AggregateError);
  assert.equal(world.isDisposed, true);
  assert.equal(world.componentCount, 0);
  assert.deepEqual(log, ["destroying"]);
});

test("registry owns an immutable schema snapshot after registration", () => {
  const registry = new ComponentRegistry();
  const mutableSchema: ComponentTypeSchemaV1 = {
    ...schema,
    properties: { step: { type: "number", min: 0, defaultValue: 1 } },
  };
  registry.register({ schema: mutableSchema, create: () => ({}) });
  const registered = registry.get(schema.typeId);
  assert.ok(registered);
  mutableSchema.properties.step = { type: "number", min: 100, defaultValue: 200 };

  const registeredStep = registered.schema.properties.step;
  assert.equal(registeredStep?.type === "number" ? registeredStep.min : undefined, 0);
  assert.throws(() => {
    (registeredStep as unknown as { min?: number }).min = 400;
  }, TypeError);
});

test("runs registered systems after component updates and disposes them in reverse order", () => {
  const log: string[] = [];
  const world = new ComponentWorld("scene-systems", createRegistry(log));
  world.createNode({ id: "node-systems", name: "Player" });
  world.attachComponent("node-systems", schema.typeId, {}, { instanceId: "system-owner" });
  log.length = 0;

  world.registerSystem({
    id: "first",
    update: () => log.push("system:first"),
    dispose: () => log.push("dispose:first"),
  });
  world.registerSystem({
    id: "second",
    update: () => log.push("system:second"),
    dispose: () => log.push("dispose:second"),
  });

  world.update(0.25);
  assert.deepEqual(log, [
    "start:system-owner",
    "update:system-owner:0.25",
    "system:first",
    "system:second",
  ]);

  world.dispose();
  assert.deepEqual(log.slice(4), [
    "disable:system-owner",
    "destroy:system-owner",
    "dispose:second",
    "dispose:first",
  ]);
});

test("removes and disposes a system once and rejects duplicate system identities", () => {
  const log: string[] = [];
  const world = new ComponentWorld("scene-system-removal", new ComponentRegistry());
  const system = {
    id: "system-a",
    update: () => log.push("update"),
    dispose: () => log.push("dispose"),
  };

  world.registerSystem(system);
  assert.throws(() => world.registerSystem({ ...system }), /already registered/i);
  world.removeSystem(system.id);
  world.removeSystem(system.id);
  world.update(0);
  world.dispose();

  assert.deepEqual(log, ["dispose"]);
});


test("isolates same-type component instances across nodes and worlds", () => {
  const observed = new Map<string, number>();
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: ({ instanceId, properties }) => {
      assert.equal(Object.isFrozen(properties), true);
      let localValue = Number(properties.step);
      return {
        onUpdate: () => {
          localValue += 1;
          observed.set(instanceId, localValue);
        },
      };
    },
  });

  const firstWorld = new ComponentWorld("scene-isolation-a", registry);
  const secondWorld = new ComponentWorld("scene-isolation-b", registry);
  firstWorld.createNode({ id: "node-a1", name: "First A" });
  firstWorld.createNode({ id: "node-a2", name: "Second A" });
  secondWorld.createNode({ id: "node-b1", name: "First B" });

  firstWorld.attachComponent("node-a1", schema.typeId, { step: 1 }, { instanceId: "instance-a1" });
  firstWorld.attachComponent("node-a2", schema.typeId, { step: 10 }, { instanceId: "instance-a2" });
  secondWorld.attachComponent("node-b1", schema.typeId, { step: 100 }, { instanceId: "instance-b1" });

  firstWorld.update(0.1);
  secondWorld.update(0.1);
  firstWorld.update(0.1);
  secondWorld.update(0.1);

  assert.deepEqual(Object.fromEntries(observed), {
    "instance-a1": 3,
    "instance-a2": 12,
    "instance-b1": 102,
  });
  firstWorld.dispose();
  secondWorld.dispose();
});

test("unregistering a definition only affects future attachments", () => {
  const log: string[] = [];
  const registry = createRegistry(log);
  const world = new ComponentWorld("scene-unregister", registry);
  world.createNode({ id: "node-existing", name: "Existing" });
  world.createNode({ id: "node-new", name: "New" });
  world.attachComponent("node-existing", schema.typeId, {}, { instanceId: "existing-instance" });

  assert.equal(registry.unregister(schema.typeId), true);
  assert.equal(registry.unregister(schema.typeId), false);
  assert.throws(
    () => world.attachComponent("node-new", schema.typeId, {}, { instanceId: "rejected-instance" }),
    /not registered/i,
  );

  world.update(0.25);
  assert.equal(log.includes("update:existing-instance:0.25"), true);
  assert.equal(world.listComponents().some((item) => item.id === "existing-instance"), true);

  registry.register({
    schema,
    create: ({ instanceId }) => ({
      onCreate: () => log.push("replacement:create:" + instanceId),
    }),
  });
  world.attachComponent("node-new", schema.typeId, {}, { instanceId: "replacement-instance" });
  assert.equal(log.includes("replacement:create:replacement-instance"), true);
  world.dispose();
});

test("factory failure does not leave a partially registered component instance", () => {
  let shouldFail = true;
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: () => {
      if (shouldFail) throw new Error("factory failed before returning a behavior");
      return { onCreate: () => undefined };
    },
  });
  const world = new ComponentWorld("scene-factory-failure", registry);
  world.createNode({ id: "node-factory", name: "Factory" });

  assert.throws(
    () => world.attachComponent("node-factory", schema.typeId, {}, { instanceId: "failed-instance" }),
    /factory failed/i,
  );
  assert.equal(world.componentCount, 0);
  assert.deepEqual(world.listComponents(), []);

  shouldFail = false;
  world.attachComponent("node-factory", schema.typeId, {}, { instanceId: "recovered-instance" });
  assert.equal(world.componentCount, 1);
  world.dispose();
});


test("rolls back component registration when onCreate fails and still runs onDestroy", () => {
  const calls: string[] = [];
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: () => ({
      onCreate: () => {
        calls.push("onCreate");
        throw new Error("resource initialization failed");
      },
      onDestroy: () => calls.push("onDestroy"),
    }),
  });
  const world = new ComponentWorld("scene-create-rollback", registry);
  world.createNode({ id: "node-create-rollback", name: "Rollback" });

  assert.throws(
    () => world.attachComponent("node-create-rollback", schema.typeId, {}, { instanceId: "rollback-instance" }),
    /failed during creation/i,
  );
  assert.equal(world.componentCount, 0);
  assert.deepEqual(world.listComponents(), []);
  assert.deepEqual(calls, ["onCreate", "onDestroy"]);
  world.dispose();
});

test("rolls back component registration when onEnable fails", () => {
  const calls: string[] = [];
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: () => ({
      onCreate: () => calls.push("onCreate"),
      onEnable: () => {
        calls.push("onEnable");
        throw new Error("enable failed");
      },
      onDestroy: () => calls.push("onDestroy"),
    }),
  });
  const world = new ComponentWorld("scene-enable-rollback", registry);
  world.createNode({ id: "node-enable-rollback", name: "Rollback" });

  assert.throws(
    () => world.attachComponent("node-enable-rollback", schema.typeId, {}, { instanceId: "enable-rollback-instance" }),
    /failed during enable/i,
  );
  assert.equal(world.componentCount, 0);
  assert.deepEqual(calls, ["onCreate", "onEnable", "onDestroy"]);
  world.dispose();
});

test("repeated ComponentWorld teardown disposes every component exactly once", () => {
  const log: string[] = [];
  const world = new ComponentWorld("scene-repeat-teardown", createRegistry(log));
  world.createNode({ id: "node-repeat-teardown", name: "Repeated teardown" });
  world.attachComponent("node-repeat-teardown", schema.typeId, {}, { instanceId: "repeat-instance" });
  world.update(1 / 60);

  world.dispose();
  world.dispose();
  world.dispose();

  assert.equal(world.isDisposed, true);
  assert.equal(world.nodeCount, 0);
  assert.equal(world.componentCount, 0);
  assert.equal(log.filter((item) => item === "destroy:repeat-instance").length, 1);
  assert.equal(log.filter((item) => item === "disable:repeat-instance").length, 1);
});

test("deep-freezes nested JSON reference properties passed to component factories", () => {
  const referenceSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.reference-owner",
    name: "Reference Owner",
    version: "1.0.0",
    properties: {
      target: { type: "node", allowSelf: false, required: true },
    },
  };
  let received: Readonly<Record<string, unknown>> | undefined;
  const registry = new ComponentRegistry();
  registry.register({
    schema: referenceSchema,
    create: ({ properties }) => {
      received = properties;
      return {};
    },
  });
  const world = new ComponentWorld("scene-frozen-reference", registry, {
    schemaContext: { nodeIds: new Set(["target-node"]) },
  });
  world.createNode({ id: "owner-node", name: "Owner" });
  world.attachComponent(
    "owner-node",
    referenceSchema.typeId,
    { target: { nodeId: "target-node" } },
    { instanceId: "reference-instance" },
  );

  assert.ok(received);
  assert.equal(Object.isFrozen(received), true);
  assert.equal(Object.isFrozen(received.target), true);
  assert.throws(() => {
    (received?.target as { nodeId: string }).nodeId = "other-node";
  }, TypeError);
  assert.deepEqual(received.target, { nodeId: "target-node" });
  world.dispose();
});


test("requires stable IDs at the runtime ComponentWorld boundary", () => {
  const registry = createRegistry([]);
  assert.throws(() => new ComponentWorld("scene with spaces", registry), /stable scene ID/i);
  const world = new ComponentWorld("scene-valid", registry);
  assert.throws(() => world.createNode({ id: "node/invalid", name: "Invalid" }), /stable IDs/i);
  world.createNode({ id: "node-valid", name: "Valid" });
  assert.throws(() => world.attachComponent("node-valid", schema.typeId, {}, { instanceId: "instance invalid" }), /stable ID/i);
  assert.throws(() => world.attachComponent("node-valid", "type with spaces", {}), /stable Node and type IDs/i);
  assert.throws(() => world.registerSystem({ id: "system invalid", update: () => undefined }), /stable ID/i);
  world.dispose();
});

test("snapshots ComponentSystem identity and callbacks at registration", () => {
  const world = new ComponentWorld("scene-system-snapshot", new ComponentRegistry());
  const calls: string[] = [];
  const system = {
    id: "system-stable",
    update() { calls.push("original:update"); },
    dispose() { calls.push("original:dispose"); },
  };
  world.registerSystem(system);

  system.id = "system-renamed";
  system.update = () => calls.push("replacement:update");
  system.dispose = () => calls.push("replacement:dispose");

  world.update(0.1);
  world.removeSystem("system-stable");
  world.update(0.1);
  world.dispose();

  assert.deepEqual(calls, ["original:update", "original:dispose"]);
});

test("rejects asynchronous Component factories and rolls back without leaving an instance", () => {
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: (() => Promise.resolve({ onCreate: () => undefined })) as unknown as ComponentTypeDefinition["create"],
  });
  const world = new ComponentWorld("scene-async-factory", registry);
  world.createNode({ id: "node-async-factory", name: "Async factory" });

  assert.throws(
    () => world.attachComponent("node-async-factory", schema.typeId, {}, { instanceId: "async-factory" }),
    /factory failed|synchronously/i,
  );
  assert.equal(world.componentCount, 0);
  assert.deepEqual(world.listComponents(), []);
  world.dispose();
});

test("reports async lifecycle and system callbacks instead of silently ignoring Promises", () => {
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: () => ({
      onCreate: (() => Promise.resolve()) as unknown as () => void,
    }),
  });
  const world = new ComponentWorld("scene-async-lifecycle", registry);
  world.createNode({ id: "node-async-lifecycle", name: "Async lifecycle" });
  assert.throws(
    () => world.attachComponent("node-async-lifecycle", schema.typeId, {}, { instanceId: "async-lifecycle" }),
    AggregateError,
  );
  assert.equal(world.componentCount, 0);
  world.dispose();

  const systemWorld = new ComponentWorld("scene-async-system", new ComponentRegistry());
  systemWorld.registerSystem({
    id: "async-system",
    update: (() => Promise.reject(new Error("late async failure"))) as unknown as ComponentSystem["update"],
  });
  assert.throws(
    () => systemWorld.update(0.1),
    (error: unknown) => error instanceof AggregateError &&
      error.errors.some((item) => item instanceof TypeError && /synchronously/.test(item.message)),
  );
  systemWorld.dispose();
});

test("ComponentRegistry rejects malformed runtime definitions before touching its registry", () => {
  const registry = new ComponentRegistry();
  assert.throws(
    () => registry.register({ schema, create: null } as unknown as ComponentTypeDefinition),
    ComponentRegistrationError,
  );
  assert.equal(registry.has(schema.typeId), false);
});
