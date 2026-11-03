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
