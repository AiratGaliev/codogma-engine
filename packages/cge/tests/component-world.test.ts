import assert from "node:assert/strict";
import test from "node:test";
import {
  ComponentRegistry,
  ComponentWorld,
  type ComponentBehavior,
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
