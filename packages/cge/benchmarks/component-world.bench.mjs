import { performance } from "node:perf_hooks";
import { ComponentRegistry, ComponentWorld } from "../dist/index.js";

const schema = {
  schemaVersion: 1,
  typeId: "com.codogma.benchmark.noop",
  name: "Benchmark No-op",
  version: "1.0.0",
  properties: {
    sequence: { type: "number", min: 0, defaultValue: 0 },
  },
};

function createWorld(size, suffix) {
  const registry = new ComponentRegistry();
  let updates = 0;
  registry.register({
    schema,
    create: () => ({
      onUpdate: () => {
        updates += 1;
      },
    }),
  });
  const world = new ComponentWorld("benchmark-" + suffix, registry);
  for (let index = 0; index < size; index += 1) {
    const nodeId = "node-" + index;
    world.createNode({ id: nodeId, name: "Node " + index });
    world.attachComponent(nodeId, schema.typeId, { sequence: index }, {
      instanceId: "component-" + index,
    });
  }
  return { world, getUpdates: () => updates };
}

function measure(size) {
  const setupStarted = performance.now();
  const { world, getUpdates } = createWorld(size, size);
  const setupMs = performance.now() - setupStarted;

  const tickCount = 25;
  const updateStarted = performance.now();
  for (let tick = 0; tick < tickCount; tick += 1) {
    world.update(1 / 60);
  }
  const updateMs = performance.now() - updateStarted;
  const expectedUpdates = size * tickCount;
  if (getUpdates() !== expectedUpdates) {
    throw new Error(
      "Expected " + expectedUpdates + " component updates, received " + getUpdates(),
    );
  }

  const disposeStarted = performance.now();
  world.dispose();
  const disposeMs = performance.now() - disposeStarted;
  if (!world.isDisposed || world.nodeCount !== 0 || world.componentCount !== 0) {
    throw new Error("ComponentWorld benchmark teardown did not complete cleanly.");
  }

  return {
    nodes: size,
    components: size,
    setupMs: Number(setupMs.toFixed(3)),
    avgUpdateTickMs: Number((updateMs / tickCount).toFixed(3)),
    updatesPerSecond: Math.round(expectedUpdates / (updateMs / 1000)),
    disposeMs: Number(disposeMs.toFixed(3)),
  };
}

// Warm up class/JIT paths without including the warm-up in the reported samples.
const warmup = createWorld(250, "warmup");
for (let tick = 0; tick < 5; tick += 1) warmup.world.update(1 / 60);
warmup.world.dispose();

process.stdout.write(
  "ComponentWorld benchmark · " + process.version + " · " +
  process.platform + "/" + process.arch + "
",
);
for (const size of [100, 1_000, 10_000]) {
  process.stdout.write(JSON.stringify(measure(size)) + "
");
}
