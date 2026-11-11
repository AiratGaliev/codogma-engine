import assert from "node:assert/strict";
import test from "node:test";
import {
  ComponentRegistry,
  ComponentWorld,
  createRuntimeEntityIdentity,
  type ComponentTypeSchemaV1,
  type NodeDocument,
  type RuntimeSceneGraph,
  type RuntimeSceneGraphNode,
  type RuntimeIdentityScope,
} from "@codogma/cge";
import {
  createBrowserPreviewRuntimeSnapshot,
  resolveRuntimeIdentityInWorld,
} from "../src/runtime-snapshot.js";

const scope: RuntimeIdentityScope = {
  projectId: "project-runtime-membership",
  sceneId: "scene-runtime-membership",
  sessionId: "preview-runtime-membership:session-1",
};

const schema: ComponentTypeSchemaV1 = {
  schemaVersion: 1,
  typeId: "com.codogma.test.runtime-membership",
  name: "Runtime Membership",
  version: "1.0.0",
  properties: {
    elapsed: { type: "number", storage: "runtime" },
  },
};

function nodeDocument(id: string, name: string, componentIds: string[] = []): NodeDocument {
  return {
    id,
    name,
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: componentIds.map((componentId) => ({
      id: componentId,
      typeId: schema.typeId,
      schemaVersion: 1,
      enabled: true,
      properties: {},
    })),
    children: [],
  };
}

function graphNode(node: NodeDocument): RuntimeSceneGraphNode {
  return {
    id: node.id,
    name: node.name,
    active: node.active,
    transform: { ...node.transform },
    componentInstanceIds: node.components.map((component) => component.id),
    children: node.children.map(graphNode),
  };
}

test("runtime snapshots follow live World membership while preserving only exact persisted counterparts", () => {
  const registry = new ComponentRegistry();
  registry.register({
    schema,
    create: () => ({
      inspect: () => ({ elapsed: 12.5 }),
    }),
  });
  const world = new ComponentWorld(scope.sceneId, registry);
  world.createNode({ id: "node-player", name: "Player" });
  world.createNode({ id: "node-removed", name: "Removed" });
  world.attachComponent("node-player", schema.typeId, {}, { instanceId: "component-persisted" });

  const playerDocument = nodeDocument("node-player", "Player", ["component-persisted"]);
  const removedDocument = nodeDocument("node-removed", "Removed");
  const document = {
    schemaVersion: 1 as const,
    id: scope.sceneId,
    name: "Runtime Membership",
    rootNodes: [playerDocument, removedDocument],
    settings: {},
  };
  const graph: RuntimeSceneGraph = {
    sceneId: scope.sceneId,
    document,
    diagnostics: [],
    rootNodes: [graphNode(playerDocument), graphNode(removedDocument)],
    getNode: (id) => graph.rootNodes.find((node) => node.id === id),
    getComponent: (id) => {
      const component = world.listComponents().find((item) => item.id === id);
      return component ? Object.freeze(component) : undefined;
    },
    getAsset: () => undefined,
    getPrefab: () => undefined,
  };

  const initial = createBrowserPreviewRuntimeSnapshot(scope, graph, world);
  assert.deepEqual(initial.nodes.map((node) => node.identity.nodeId), ["node-player", "node-removed"]);
  assert.equal(initial.nodes[0]?.components[0]?.persistedEnabled, true);

  world.removeComponent("component-persisted");
  world.attachComponent("node-player", schema.typeId, {}, { instanceId: "component-runtime-only" });
  world.destroyNode("node-removed");
  world.createNode({ id: "node-runtime-created", name: "Runtime Created", transform: { x: 12, y: 24 } });

  const current = createBrowserPreviewRuntimeSnapshot(scope, graph, world);
  assert.deepEqual(current.nodes.map((node) => node.identity.nodeId), ["node-player", "node-runtime-created"]);
  const player = current.nodes[0]!;
  assert.equal(player.components.length, 1);
  assert.equal(player.components[0]?.identity.componentInstanceId, "component-runtime-only");
  assert.equal(player.components[0]?.persistedEnabled, null);
  assert.equal(player.components[0]?.persistedProperties, null);
  assert.equal(player.components[0]?.properties.elapsed?.status, "available");

  const runtimeCreated = current.nodes[1]!;
  assert.equal(runtimeCreated.name, "Runtime Created");
  assert.equal(runtimeCreated.persistedActive, null);
  assert.equal(runtimeCreated.persistedTransform, null);

  const staleRemovedNode = createRuntimeEntityIdentity(scope, "node-removed");
  assert.equal(resolveRuntimeIdentityInWorld(staleRemovedNode, scope, world), undefined);
  assert.equal(resolveRuntimeIdentityInWorld(runtimeCreated.identity, scope, world)?.kind, "node");
  world.dispose();
});
