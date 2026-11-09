import assert from "node:assert/strict";
import { cpus, release, totalmem } from "node:os";
import { arch, platform } from "node:process";
import { performance } from "node:perf_hooks";
import {
  ComponentRegistry,
  ProjectSceneLoader,
  serializeSceneDocument,
  type ComponentTypeSchemaV1,
  type ProjectDocumentV1,
  type SceneDocumentV1,
} from "../src/index.js";

const sceneAssetId = "asset-scene-benchmark";
const scriptAssetId = "asset-script-benchmark";
const componentTypeId = "com.codogma.benchmark.movement";
const frameDeltaSeconds = 1 / 60;
const frameCount = 30;
const sampleCount = 5;

const componentSchema: ComponentTypeSchemaV1 = {
  schemaVersion: 1,
  typeId: componentTypeId,
  name: "Benchmark Movement",
  version: "1.0.0",
  properties: {
    speed: { type: "number", min: 0, defaultValue: 1, required: true },
  },
};

interface Fixture {
  readonly size: number;
  readonly project: ProjectDocumentV1;
  readonly sceneJson: string;
  readonly sceneBytes: number;
  readonly serializationMs: number;
  readonly sumSpeed: number;
}

interface Sample {
  readonly compositionMs: number;
  readonly loadMs: number;
  readonly activationMs: number;
  readonly updateMs: number;
  readonly teardownMs: number;
  readonly updateCount: number;
  readonly destroyCount: number;
  readonly checksum: number;
}

function createFixture(size: number): Fixture {
  const sceneId = "scene-benchmark-" + size;
  const project: ProjectDocumentV1 = {
    schemaVersion: 1,
    id: "project-core-benchmark",
    name: "Core benchmark",
    scenes: [{ id: sceneId, assetId: sceneAssetId }],
    assets: [
      { id: sceneAssetId, path: "scenes/benchmark.cge-scene.json", kind: "scene" },
      { id: scriptAssetId, path: "src/Movement.ts", kind: "script" },
    ],
    prefabs: [],
    componentModules: [{
      typeId: componentTypeId,
      moduleAssetId: scriptAssetId,
      version: componentSchema.version,
    }],
    runtime: { adapterId: "benchmark.host", settings: {} },
  };

  let sumSpeed = 0;
  const rootNodes: SceneDocumentV1["rootNodes"] = [];
  for (let index = 0; index < size; index += 1) {
    const speed = 1 + (index % 4);
    sumSpeed += speed;
    rootNodes.push({
      id: "node-" + index,
      name: "Node " + index,
      active: true,
      transform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        originX: 0.5,
        originY: 0.5,
      },
      components: [{
        id: "component-" + index,
        typeId: componentTypeId,
        schemaVersion: componentSchema.schemaVersion,
        enabled: true,
        properties: { speed },
      }],
      children: [],
    });
  }

  const scene: SceneDocumentV1 = {
    schemaVersion: 1,
    id: sceneId,
    name: "Core benchmark " + size,
    settings: {},
    rootNodes,
  };
  const validationContext = {
    assets: new Map(project.assets.map((asset) => [asset.id, asset] as const)),
    componentSchemas: new Map([[componentTypeId, componentSchema]]),
    registeredComponentTypes: new Set([componentTypeId]),
  };
  const serializationStarted = performance.now();
  const sceneJson = serializeSceneDocument(scene, validationContext);
  const serializationMs = performance.now() - serializationStarted;

  return {
    size,
    project,
    sceneJson,
    sceneBytes: Buffer.byteLength(sceneJson, "utf8"),
    serializationMs,
    sumSpeed,
  };
}

async function runSample(fixture: Fixture, frames: number): Promise<Sample> {
  let updateCount = 0;
  let destroyCount = 0;
  let checksum = 0;

  const registry = new ComponentRegistry();
  registry.register({
    schema: componentSchema,
    create: ({ properties }) => {
      const speed = Number(properties.speed);
      let position = 0;
      return {
        onUpdate: (deltaSeconds) => {
          position += speed * deltaSeconds;
          checksum += position;
          updateCount += 1;
        },
        onDestroy: () => {
          destroyCount += 1;
        },
      };
    },
  });

  const compositionStarted = performance.now();
  const loader = new ProjectSceneLoader({
    project: fixture.project,
    registry,
    readAssetDocument: async (asset, signal) => {
      if (signal.aborted) throw new Error("Benchmark load was unexpectedly cancelled.");
      if (asset.id !== sceneAssetId) throw new Error("Unexpected asset requested: " + asset.id);
      return fixture.sceneJson;
    },
  });
  const compositionMs = performance.now() - compositionStarted;

  const loadStarted = performance.now();
  const session = await loader.load({
    sceneId: "scene-benchmark-" + fixture.size,
    signal: new AbortController().signal,
  });
  const loadMs = performance.now() - loadStarted;

  assert.equal(session.state, "inactive");
  assert.equal(session.graph.rootNodes.length, fixture.size);
  assert.equal(session.world.nodeCount, fixture.size);
  assert.equal(session.world.componentCount, fixture.size);

  const activationStarted = performance.now();
  session.activate();
  const activationMs = performance.now() - activationStarted;

  const updateStarted = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    session.world.update(frameDeltaSeconds);
  }
  const updateMs = performance.now() - updateStarted;

  const teardownStarted = performance.now();
  session.deactivate();
  session.dispose();
  const teardownMs = performance.now() - teardownStarted;

  const expectedUpdates = fixture.size * frames;
  const expectedChecksum =
    fixture.sumSpeed * frameDeltaSeconds * (frames * (frames + 1)) / 2;
  assert.equal(updateCount, expectedUpdates);
  assert.ok(
    Math.abs(checksum - expectedChecksum) <= Math.max(0.01, expectedChecksum * 1e-9),
    "Component state checksum diverged from the expected deterministic update.",
  );
  assert.equal(destroyCount, fixture.size);
  assert.equal(session.state, "disposed");
  assert.equal(session.world.isDisposed, true);
  assert.equal(session.world.nodeCount, 0);
  assert.equal(session.world.componentCount, 0);

  return {
    compositionMs,
    loadMs,
    activationMs,
    updateMs,
    teardownMs,
    updateCount,
    destroyCount,
    checksum,
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

async function main(): Promise<void> {
  const cpu = cpus()[0]?.model ?? "unknown";
  process.stdout.write("Codogma Core native Scene benchmark\n");
  process.stdout.write(JSON.stringify({
    node: process.version,
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    cpu,
    totalMemoryMiB: Math.round(totalmem() / (1024 * 1024)),
    runnerOs: process.env.RUNNER_OS ?? null,
    commit: process.env.GITHUB_SHA ?? null,
    samples: sampleCount,
    framesPerSample: frameCount,
    deltaSeconds: frameDeltaSeconds,
    workload: "Project Scene serialization + ProjectSceneLoader composition/hydration + activation + component movement updates + disposal",
  }) + "\n");

  const warmup = createFixture(250);
  await runSample(warmup, 5);

  for (const size of [100, 1_000, 10_000]) {
    const fixture = createFixture(size);
    const samples: Sample[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(await runSample(fixture, frameCount));
    }

    const compositionValues = samples.map((sample) => sample.compositionMs);
    const loadValues = samples.map((sample) => sample.loadMs);
    const activationValues = samples.map((sample) => sample.activationMs);
    const updateFrameValues = samples.map((sample) => sample.updateMs / frameCount);
    const teardownValues = samples.map((sample) => sample.teardownMs);
    const totalUpdateMs = samples.reduce((total, sample) => total + sample.updateMs, 0);
    const totalCallbacks = samples.reduce((total, sample) => total + sample.updateCount, 0);

    process.stdout.write(JSON.stringify({
      nodes: size,
      components: size,
      sceneBytes: fixture.sceneBytes,
      serializationMs: round(fixture.serializationMs),
      summary: {
        compositionMsMedian: round(median(compositionValues)),
        loadMsMedian: round(median(loadValues)),
        loadMsP95: round(percentile(loadValues, 0.95)),
        activationMsMedian: round(median(activationValues)),
        updateFrameMsMedian: round(median(updateFrameValues)),
        updateFrameMsP95: round(percentile(updateFrameValues, 0.95)),
        teardownMsMedian: round(median(teardownValues)),
        componentUpdatesPerSecond: Math.round(totalCallbacks / (totalUpdateMs / 1000)),
      },
      rawSamples: samples.map((sample) => ({
        compositionMs: round(sample.compositionMs),
        loadMs: round(sample.loadMs),
        activationMs: round(sample.activationMs),
        updateFrameMs: round(sample.updateMs / frameCount),
        teardownMs: round(sample.teardownMs),
        updateCount: sample.updateCount,
        destroyCount: sample.destroyCount,
        checksum: round(sample.checksum),
      })),
    }) + "\n");
  }
}

await main();
