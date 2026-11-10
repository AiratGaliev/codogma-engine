import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ComponentRegistry,
  ProjectSceneLoader,
  parseProjectDocument,
  type ComponentTypeDefinition,
  type NodeDocument,
} from "@codogma/cge";
import { createPhaserRuntimeSceneLoader } from "../src/index.js";
import type Phaser from "phaser";
import { createMockPhaserHost, MockGameObject } from "../tests/support/mock-phaser.js";

const fixtureRoot = resolve(process.cwd(), "../cge/tests/fixtures/acceptance-project");
const projectResult = parseProjectDocument(readFileSync(resolve(fixtureRoot, "project.json"), "utf8"));
if (!projectResult.value) throw new Error("The native acceptance Project fixture is invalid.");

const componentTypeId = "com.codogma.acceptance.follow-target";

function createComponentDefinition(): ComponentTypeDefinition {
  return {
    schema: {
      schemaVersion: 1,
      typeId: componentTypeId,
      name: "Benchmark Component",
      version: "1.0.0",
      properties: {
        sprite: { type: "asset", assetKinds: ["image"], required: true },
        target: { type: "node", allowSelf: false, required: true },
        speed: { type: "number", min: 0, defaultValue: 1 },
      },
    },
    create() {
      return { onUpdate(_deltaSeconds: number) {} };
    },
  };
}

function createNodes(count: number): NodeDocument[] {
  return Array.from({ length: count }, (_, index) => {
    const targetIndex = index === 0 ? 1 : 0;
    return {
      id: "bench-node-" + index,
      name: "Node " + index,
      active: true,
      transform: {
        x: index % 400,
        y: Math.floor(index / 400),
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        originX: 0.5,
        originY: 0.5,
      },
      components: [{
        id: "bench-component-" + index,
        typeId: componentTypeId,
        schemaVersion: 1,
        enabled: true,
        properties: {
          sprite: { assetId: "asset-player-sprite" },
          target: { nodeId: "bench-node-" + targetIndex },
          speed: 1,
        },
      }],
      children: [],
    };
  });
}

function createLoader(sceneDocument: string): ProjectSceneLoader {
  return new ProjectSceneLoader({
    project: projectResult.value!,
    registry: (() => {
      const registry = new ComponentRegistry();
      registry.register(createComponentDefinition());
      return registry;
    })(),
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      return sceneDocument;
    },
  });
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

async function measureCore(sceneDocument: string): Promise<{
  startupMs: number;
  updateFrameMedianMs: number;
  updateFrameP95Ms: number;
  cleanupMs: number;
}> {
  const loader = createLoader(sceneDocument);
  const started = performance.now();
  const session = await loader.load({ sceneId: "scene-level", signal: new AbortController().signal });
  await session.activate();
  const startupMs = performance.now() - started;
  const frames: number[] = [];
  for (let frame = 0; frame < 30; frame += 1) {
    const before = performance.now();
    session.world.update(1 / 60);
    frames.push(performance.now() - before);
  }
  const cleanupStarted = performance.now();
  await session.deactivate();
  await session.dispose();
  const cleanupMs = performance.now() - cleanupStarted;
  return {
    startupMs,
    updateFrameMedianMs: percentile(frames, 0.5),
    updateFrameP95Ms: percentile(frames, 0.95),
    cleanupMs,
  };
}

async function measureAdapter(sceneDocument: string): Promise<{
  startupMs: number;
  updateFrameMedianMs: number;
  updateFrameP95Ms: number;
  cleanupMs: number;
}> {
  const host = createMockPhaserHost();
  const adapter = createPhaserRuntimeSceneLoader(host.scene, createLoader(sceneDocument), {
    projectId: "acceptance-project",
    componentViewFactories: {
      [componentTypeId]({ scene }) {
        return new MockGameObject(scene as unknown as object) as unknown as Phaser.GameObjects.GameObject;
      },
    },
  });
  const started = performance.now();
  const session = await adapter.load({ sceneId: "scene-level", signal: new AbortController().signal });
  await session.activate();
  const startupMs = performance.now() - started;
  const frames: number[] = [];
  for (let frame = 0; frame < 30; frame += 1) {
    const before = performance.now();
    host.events.emit("update", frame * (1000 / 60), 1000 / 60);
    frames.push(performance.now() - before);
  }
  const cleanupStarted = performance.now();
  await session.dispose();
  const cleanupMs = performance.now() - cleanupStarted;
  return {
    startupMs,
    updateFrameMedianMs: percentile(frames, 0.5),
    updateFrameP95Ms: percentile(frames, 0.95),
    cleanupMs,
  };
}

async function run(): Promise<void> {
  const output: unknown[] = [];
  for (const count of [100, 1_000, 10_000]) {
    const scene: {
      schemaVersion: 1;
      id: string;
      name: string;
      rootNodes: NodeDocument[];
      settings: Record<string, unknown>;
    } = {
      schemaVersion: 1,
      id: "scene-level",
      name: "Phaser Adapter Benchmark",
      rootNodes: createNodes(count),
      settings: {},
    };
    const sceneDocument = JSON.stringify(scene);
    // Warm both paths so first-use JIT work does not bias the comparison.
    await measureCore(sceneDocument);
    await measureAdapter(sceneDocument);
    const core: Awaited<ReturnType<typeof measureCore>>[] = [];
    const adapter: Awaited<ReturnType<typeof measureAdapter>>[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      core.push(await measureCore(sceneDocument));
      adapter.push(await measureAdapter(sceneDocument));
    }
    const summarize = (samples: typeof core) => ({
      startupMedianMs: percentile(samples.map((item) => item.startupMs), 0.5),
      updateFrameMedianMs: percentile(samples.map((item) => item.updateFrameMedianMs), 0.5),
      updateFrameP95Ms: percentile(samples.map((item) => item.updateFrameP95Ms), 0.95),
      cleanupMedianMs: percentile(samples.map((item) => item.cleanupMs), 0.5),
    });
    output.push({
      nodes: count,
      components: count,
      framesPerSample: 30,
      samples: 5,
      core: summarize(core),
      coreRawSamples: core,
      adapterWithMockPhaserHost: summarize(adapter),
      adapterRawSamples: adapter,
      note: "Node.js synthetic measurement; the mock host does not model browser rendering, GPU, input, assets, or physics.",
    });
  }
  process.stdout.write(JSON.stringify({
    benchmark: "codogma-runtime-phaser-adapter",
    environment: "node-mock-phaser",
    output,
  }, null, 2) + "\n");
}

void run().catch((error: unknown) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
