import {
  createRuntimeComponentIdentity,
  createRuntimeEntityIdentity,
  isRuntimeIdentityInScope,
  type ComponentWorld,
  type ComponentInstanceDocument,
  type NodeDocument,
  type RuntimeComponentIdentity,
  type RuntimeComponentPropertyInspection,
  type RuntimeComponentSnapshot,
  type RuntimeEntityIdentity,
  type RuntimeIdentityScope,
  type RuntimeNode,
  type RuntimeSceneGraph,
  type RuntimeSceneGraphNode,
  type RuntimeSelectionIdentity,
  type RuntimeTransform,
  type TransformData,
} from "@codogma/cge";

export interface BrowserPreviewRuntimeComponentSnapshot {
  readonly identity: RuntimeComponentIdentity;
  readonly enabled: boolean;
  readonly started: boolean;
  /** null means this Component was created only in the current runtime session. */
  readonly persistedEnabled: boolean | null;
  /** null means this Component has no exact persisted Project Model counterpart. */
  readonly persistedProperties: Readonly<Record<string, unknown>> | null;
  readonly properties: Readonly<Record<string, RuntimeComponentPropertyInspection>>;
}

export interface BrowserPreviewRuntimeNodeSnapshot {
  readonly identity: RuntimeEntityIdentity;
  readonly name: string;
  readonly active: boolean;
  /** null means this Node was created only in the current runtime session. */
  readonly persistedActive: boolean | null;
  readonly runtimeTransform: Readonly<RuntimeTransform>;
  /** null means this Node has no exact persisted Project Model counterpart. */
  readonly persistedTransform: Readonly<TransformData> | null;
  readonly components: readonly BrowserPreviewRuntimeComponentSnapshot[];
  readonly children: readonly BrowserPreviewRuntimeNodeSnapshot[];
}

/** Immutable, session-scoped view; persisted and live values remain separate. */
export interface BrowserPreviewRuntimeSnapshot extends RuntimeIdentityScope {
  readonly nodes: readonly BrowserPreviewRuntimeNodeSnapshot[];
}

function indexDocuments(
  nodes: readonly NodeDocument[],
  nodeDocuments: Map<string, NodeDocument>,
  componentDocuments: Map<string, { readonly nodeId: string; readonly document: ComponentInstanceDocument }>,
): void {
  for (const node of nodes) {
    nodeDocuments.set(node.id, node);
    for (const component of node.components) {
      componentDocuments.set(component.id, { nodeId: node.id, document: component });
    }
    indexDocuments(node.children, nodeDocuments, componentDocuments);
  }
}

function createNodeSnapshot(
  scope: RuntimeIdentityScope,
  node: RuntimeNode,
  persistedNode: NodeDocument | undefined,
  children: readonly BrowserPreviewRuntimeNodeSnapshot[],
  componentsByNode: ReadonlyMap<string, readonly RuntimeComponentSnapshot[]>,
  componentDocuments: ReadonlyMap<string, { readonly nodeId: string; readonly document: ComponentInstanceDocument }>,
  world: ComponentWorld,
): BrowserPreviewRuntimeNodeSnapshot {
  const components: BrowserPreviewRuntimeComponentSnapshot[] = [];
  for (const component of componentsByNode.get(node.id) ?? []) {
    const inspection = world.inspectComponent(component.id);
    // Inspection providers are user code and may synchronously detach another
    // Component. A stale entry must not invalidate the entire runtime snapshot.
    if (!inspection || inspection.nodeId !== node.id || inspection.typeId !== component.typeId) continue;

    const source = componentDocuments.get(component.id);
    const persisted = source?.nodeId === node.id && source.document.typeId === component.typeId
      ? source.document
      : undefined;
    components.push(Object.freeze({
      identity: createRuntimeComponentIdentity(scope, node.id, component.id, component.typeId),
      enabled: component.enabled,
      started: component.started,
      persistedEnabled: persisted?.enabled ?? null,
      persistedProperties: persisted?.properties ?? null,
      properties: inspection.properties,
    }));
  }

  return Object.freeze({
    identity: createRuntimeEntityIdentity(scope, node.id),
    name: node.name,
    active: node.active,
    persistedActive: persistedNode?.active ?? null,
    runtimeTransform: Object.freeze({ ...node.transform }),
    persistedTransform: persistedNode
      ? Object.freeze({ ...persistedNode.transform })
      : null,
    components: Object.freeze(components),
    children: Object.freeze([...children]),
  });
}

/**
 * Builds a snapshot from the live Core World. The immutable Scene graph supplies
 * persisted hierarchy/order and authoring counterparts; the World supplies the
 * current Node and Component membership. Runtime-created entries have no saved
 * counterpart, while destroyed entries disappear instead of poisoning the
 * entire snapshot.
 */
export function createBrowserPreviewRuntimeSnapshot(
  scope: RuntimeIdentityScope,
  graph: RuntimeSceneGraph,
  world: ComponentWorld,
): BrowserPreviewRuntimeSnapshot {
  const nodeDocuments = new Map<string, NodeDocument>();
  const componentDocuments = new Map<string, { readonly nodeId: string; readonly document: ComponentInstanceDocument }>();
  indexDocuments(graph.document.rootNodes, nodeDocuments, componentDocuments);

  const liveNodes = world.listNodes();
  const liveNodesById = new Map(liveNodes.map((node) => [node.id, node] as const));
  const liveComponents = world.listComponents();
  const componentsByNode = new Map<string, RuntimeComponentSnapshot[]>();
  for (const component of liveComponents) {
    const components = componentsByNode.get(component.nodeId) ?? [];
    components.push(component);
    componentsByNode.set(component.nodeId, components);
  }

  const graphNodeIds = new Set<string>();
  const materializePersistedNode = (
    graphNode: RuntimeSceneGraphNode,
  ): BrowserPreviewRuntimeNodeSnapshot[] => {
    graphNodeIds.add(graphNode.id);
    // If an authoring Node was destroyed at runtime, its surviving children
    // become roots in this snapshot. Core World has no mutable parent relation.
    const children = graphNode.children.flatMap(materializePersistedNode);
    const runtimeNode = liveNodesById.get(graphNode.id);
    if (!runtimeNode) return children;

    return [createNodeSnapshot(
      scope,
      runtimeNode,
      nodeDocuments.get(runtimeNode.id),
      children,
      componentsByNode,
      componentDocuments,
      world,
    )];
  };

  const nodes = graph.rootNodes.flatMap(materializePersistedNode);
  // Runtime-created Nodes are independent Core entities (Core currently has no
  // reparenting API), so expose them as root entries without saved counterparts.
  for (const node of liveNodes) {
    if (graphNodeIds.has(node.id)) continue;
    nodes.push(createNodeSnapshot(scope, node, undefined, [], componentsByNode, componentDocuments, world));
  }

  return Object.freeze({ ...scope, nodes: Object.freeze(nodes) });
}

/** Canonicalizes an identity only while its exact runtime Node/Component is alive. */
export function resolveRuntimeIdentityInWorld(
  identity: RuntimeSelectionIdentity,
  scope: RuntimeIdentityScope,
  world: ComponentWorld,
): RuntimeSelectionIdentity | undefined {
  if (!isRuntimeIdentityInScope(identity, scope)) return undefined;
  const node = world.getNode(identity.nodeId);
  if (!node) return undefined;
  if (identity.kind === "node") return createRuntimeEntityIdentity(scope, node.id);

  const component = world.listComponents().find((item) => item.id === identity.componentInstanceId);
  if (!component || component.nodeId !== node.id || component.typeId !== identity.typeId) return undefined;
  return createRuntimeComponentIdentity(scope, node.id, component.id, component.typeId);
}
