import {
  ComponentRegistry,
  ProjectSceneLoader,
  parsePrefabDocument,
  parseProjectDocument,
  parseSceneDocument,
  serializePrefabDocument,
  serializeProjectDocument,
  serializeSceneDocument,
} from "@codogma/cge";
import type {
  ComponentTypeDefinition,
  ComponentTypeSchemaV1,
  NodeDocument,
  PrefabDocumentV1,
  ProjectDocumentV1,
  SceneDocumentV1,
} from "@codogma/cge";

const typeId = "com.codogma.consumer.movement";
const componentSchema: ComponentTypeSchemaV1 = {
  schemaVersion: 1,
  typeId,
  name: "Consumer Movement",
  version: "1.0.0",
  properties: {
    speed: { type: "number", min: 0, defaultValue: 1, required: true },
  },
};

const project: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "consumer-project",
  name: "Packed consumer",
  scenes: [{ id: "consumer-scene", assetId: "asset-scene" }],
  assets: [
    { id: "asset-scene", path: "scenes/main.cge-scene.json", kind: "scene" },
    { id: "asset-script", path: "src/Movement.ts", kind: "script" },
  ],
  prefabs: [],
  componentModules: [
    { typeId, moduleAssetId: "asset-script", version: "1.0.0" },
  ],
  runtime: { adapterId: "consumer.host", settings: {} },
};

function createNode(
  id: string,
  name: string,
  componentId: string,
  speed: number,
): NodeDocument {
  return {
    id,
    name,
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
      id: componentId,
      typeId,
      schemaVersion: 1,
      enabled: true,
      properties: { speed },
    }],
    children: [],
  };
}

const scene: SceneDocumentV1 = {
  schemaVersion: 1,
  id: "consumer-scene",
  name: "Main",
  settings: {},
  rootNodes: [
    createNode("node-player", "Player", "component-player", 2),
    createNode("node-enemy", "Enemy", "component-enemy", 5),
  ],
};

function requireValue<T>(
  value: T | undefined,
  diagnostics: readonly unknown[],
  label: string,
): T {
  if (value === undefined) {
    throw new Error(label + " failed: " + JSON.stringify(diagnostics));
  }
  return value;
}

const projectJson = serializeProjectDocument(project);
const projectResult = parseProjectDocument(projectJson);
const loadedProject = requireValue(
  projectResult.value,
  projectResult.diagnostics,
  "Project round-trip",
);
if (serializeProjectDocument(loadedProject) !== projectJson) {
  throw new Error("Project serialization is not deterministic.");
}

const validationContext = {
  assets: new Map(project.assets.map((asset) => [asset.id, asset] as const)),
  componentSchemas: new Map([[typeId, componentSchema]]),
  registeredComponentTypes: new Set([typeId]),
};

const sceneJson = serializeSceneDocument(scene, validationContext);
const loadedSceneResult = parseSceneDocument(sceneJson, validationContext);
const loadedScene = requireValue(
  loadedSceneResult.value,
  loadedSceneResult.diagnostics,
  "Scene round-trip",
);
if (serializeSceneDocument(loadedScene, validationContext) !== sceneJson) {
  throw new Error("Scene serialization is not deterministic.");
}

const prefabRoot = loadedScene.rootNodes[0];
if (prefabRoot === undefined) throw new Error("Consumer fixture has no Prefab root.");
const prefab: PrefabDocumentV1 = {
  schemaVersion: 1,
  id: "prefab-player",
  name: "Player Prefab",
  root: prefabRoot,
};
const prefabJson = serializePrefabDocument(prefab, validationContext);
const loadedPrefabResult = parsePrefabDocument(prefabJson, validationContext);
const loadedPrefab = requireValue(
  loadedPrefabResult.value,
  loadedPrefabResult.diagnostics,
  "Prefab round-trip",
);
if (loadedPrefab.root.id !== "node-player") {
  throw new Error("Prefab round-trip lost the source Node identity.");
}

const registry = new ComponentRegistry();
const updates = new Map<string, { nodeId: string; displacement: number }>();
const definition: ComponentTypeDefinition = {
  schema: componentSchema,
  create: ({ instanceId, node, properties }) => {
    const speed = Number(properties.speed);
    return {
      onUpdate: (deltaSeconds) => {
        updates.set(instanceId, {
          nodeId: node.id,
          displacement: speed * deltaSeconds,
        });
      },
    };
  },
};
registry.register(definition);

const loader = new ProjectSceneLoader({
  project: loadedProject,
  registry,
  readAssetDocument: async (asset, signal) => {
    if (signal.aborted) throw new Error("Unexpected consumer cancellation.");
    if (asset.id !== "asset-scene") throw new Error("Unexpected Scene asset: " + asset.id);
    return sceneJson;
  },
});
const session = await loader.load({
  sceneId: loadedScene.id,
  signal: new AbortController().signal,
});

if (session.state !== "inactive" || session.world.isDisposed) {
  throw new Error("Scene Loader must return a hydrated but inactive session.");
}
if (session.graph.rootNodes.length !== 2 || session.world.componentCount !== 2) {
  throw new Error("Scene Loader did not hydrate both consumer Components.");
}
if (updates.size !== 0) throw new Error("Inactive sessions must not receive host ticks.");

session.activate();
session.world.update(0.25);

function readUpdateSnapshot() {
  return {
    size: updates.size,
    player: updates.get("component-player"),
    enemy: updates.get("component-enemy"),
  };
}

const updateSnapshot = readUpdateSnapshot();
if (
  updateSnapshot.size !== 2 ||
  updateSnapshot.player?.nodeId !== "node-player" ||
  updateSnapshot.player.displacement !== 0.5 ||
  updateSnapshot.enemy?.nodeId !== "node-enemy" ||
  updateSnapshot.enemy.displacement !== 1.25
) {
  throw new Error("Independent Component instances or host-owned ticking failed.");
}

function readSessionSnapshot() {
  return {
    state: session.state,
    worldDisposed: session.world.isDisposed,
    nodeCount: session.world.nodeCount,
    componentCount: session.world.componentCount,
  };
}

session.deactivate();
session.dispose();
const finalSnapshot = readSessionSnapshot();
if (
  finalSnapshot.state !== "disposed" ||
  !finalSnapshot.worldDisposed ||
  finalSnapshot.nodeCount !== 0 ||
  finalSnapshot.componentCount !== 0
) {
  throw new Error("Scene session disposal did not release the runtime graph.");
}

console.log("Packed @codogma/cge consumer smoke passed.");
