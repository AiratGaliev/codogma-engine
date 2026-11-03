import type { CoreDiagnostic } from "../diagnostics.js";
import { cloneJsonValue, type JsonObject } from "../json.js";
import { validateComponentProperties, type ComponentSchemaContext } from "./component-schema.js";
import {
  ComponentRegistry,
  type ComponentBehavior,
  type ComponentNodeContext,
  type ComponentTypeDefinition,
} from "./component-registry.js";

export interface RuntimeTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
}

export interface RuntimeNode extends ComponentNodeContext {
  active: boolean;
  transform: RuntimeTransform;
}

export interface RuntimeComponentSnapshot {
  readonly id: string;
  readonly typeId: string;
  readonly nodeId: string;
  readonly enabled: boolean;
  readonly started: boolean;
}

export interface ComponentSystem {
  readonly id: string;
  update(deltaSeconds: number, world: ComponentWorld): void;
  dispose?(): void;
}

export interface ComponentWorldOptions {
  idFactory?: () => string;
  schemaContext?: Omit<ComponentSchemaContext, "ownerNodeId">;
}

interface ComponentRecord {
  id: string;
  typeId: string;
  nodeId: string;
  definition: ComponentTypeDefinition;
  behavior: ComponentBehavior;
  enabled: boolean;
  started: boolean;
  activeNotified: boolean;
  destroyed: boolean;
}

type Mutation = () => void;

function makeRuntimeTransform(input?: Partial<RuntimeTransform>): RuntimeTransform {
  const transform: RuntimeTransform = {
    x: input?.x ?? 0,
    y: input?.y ?? 0,
    rotation: input?.rotation ?? 0,
    scaleX: input?.scaleX ?? 1,
    scaleY: input?.scaleY ?? 1,
    originX: input?.originX ?? 0.5,
    originY: input?.originY ?? 0.5,
  };
  for (const [key, value] of Object.entries(transform)) {
    if (!Number.isFinite(value)) throw new TypeError("Runtime transform " + key + " must be finite.");
  }
  return transform;
}

function defaultIdFactory(): () => string {
  let sequence = 0;
  return () => {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    sequence += 1;
    return "cge-component-" + sequence;
  };
}

export class ComponentWorld {
  private readonly nodes = new Map<string, RuntimeNode>();
  private readonly components = new Map<string, ComponentRecord>();
  private readonly componentsByNode = new Map<string, string[]>();
  private readonly systems: ComponentSystem[] = [];
  private readonly queuedMutations: Mutation[] = [];
  private readonly idFactory: () => string;
  private readonly schemaContext: Omit<ComponentSchemaContext, "ownerNodeId">;
  private updating = false;
  private flushing = false;
  private disposed = false;

  constructor(
    readonly sceneId: string,
    private readonly registry: ComponentRegistry,
    options: ComponentWorldOptions = {},
  ) {
    if (!sceneId.trim()) throw new TypeError("A ComponentWorld requires a stable scene id.");
    this.idFactory = options.idFactory ?? defaultIdFactory();
    this.schemaContext = options.schemaContext ?? {};
  }

  get isDisposed(): boolean { return this.disposed; }
  get nodeCount(): number { return this.nodes.size; }
  get componentCount(): number { return this.components.size; }

  createNode(input: {
    id: string;
    name: string;
    active?: boolean;
    transform?: Partial<RuntimeTransform>;
  }): RuntimeNode {
    this.assertUsable();
    if (this.updating || this.flushing) throw new Error("Nodes must be created outside a ComponentWorld update boundary.");
    if (!input.id.trim() || !input.name.trim()) throw new TypeError("Runtime nodes require stable ids and non-empty names.");
    if (this.nodes.has(input.id)) throw new Error("Runtime node " + input.id + " already exists.");
    const node: RuntimeNode = {
      id: input.id,
      name: input.name,
      active: input.active ?? true,
      transform: makeRuntimeTransform(input.transform),
    };
    this.nodes.set(node.id, node);
    this.componentsByNode.set(node.id, []);
    return node;
  }

  getNode(nodeId: string): RuntimeNode | undefined { return this.nodes.get(nodeId); }
  listNodes(): RuntimeNode[] { return [...this.nodes.values()]; }

  attachComponent(
    nodeId: string,
    typeId: string,
    properties: JsonObject = {},
    options: { instanceId?: string; enabled?: boolean } = {},
  ): string {
    this.assertUsable();
    const instanceId = options.instanceId ?? this.idFactory();
    if (!instanceId.trim()) throw new TypeError("A component instance requires a stable id.");
    this.schedule(() => this.attachComponentNow(nodeId, typeId, properties, instanceId, options.enabled ?? true));
    return instanceId;
  }

  removeComponent(instanceId: string): void {
    this.assertUsable();
    this.schedule(() => this.removeComponentNow(instanceId));
  }

  setComponentEnabled(instanceId: string, enabled: boolean): void {
    this.assertUsable();
    this.schedule(() => {
      const component = this.components.get(instanceId);
      if (!component) throw new Error("Component instance " + instanceId + " was not found.");
      if (component.enabled === enabled) return;
      component.enabled = enabled;
      this.synchronizeEnabledState(component);
    });
  }

  setNodeActive(nodeId: string, active: boolean): void {
    this.assertUsable();
    this.schedule(() => {
      const node = this.nodes.get(nodeId);
      if (!node) throw new Error("Runtime node " + nodeId + " was not found.");
      if (node.active === active) return;
      node.active = active;
      for (const id of this.componentsByNode.get(nodeId) ?? []) {
        const component = this.components.get(id);
        if (component) this.synchronizeEnabledState(component);
      }
    });
  }

  destroyNode(nodeId: string): void {
    this.assertUsable();
    this.schedule(() => {
      if (!this.nodes.has(nodeId)) return;
      for (const id of [...(this.componentsByNode.get(nodeId) ?? [])]) this.removeComponentNow(id);
      this.componentsByNode.delete(nodeId);
      this.nodes.delete(nodeId);
    });
  }

  registerSystem(system: ComponentSystem): void {
    this.assertUsable();
    if (!system.id.trim()) throw new TypeError("A component system requires a stable id.");
    this.schedule(() => {
      if (this.systems.some((item) => item.id === system.id)) throw new Error("Component system " + system.id + " is already registered.");
      this.systems.push(system);
    });
  }

  removeSystem(systemId: string): void {
    this.assertUsable();
    this.schedule(() => {
      const index = this.systems.findIndex((item) => item.id === systemId);
      if (index < 0) return;
      const system = this.systems[index];
      this.systems.splice(index, 1);
      try { system?.dispose?.(); }
      catch (error) { throw new AggregateError([error], "Component system disposal failed."); }
    });
  }

  listComponents(): RuntimeComponentSnapshot[] {
    return [...this.components.values()].map((item) => ({
      id: item.id,
      typeId: item.typeId,
      nodeId: item.nodeId,
      enabled: item.enabled,
      started: item.started,
    }));
  }

  update(deltaSeconds: number): void {
    this.assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new ComponentWorldError("CORE_INVALID_DELTA", "ComponentWorld delta must be finite and non-negative.");
    }
    if (this.updating || this.flushing) throw new Error("ComponentWorld update is not re-entrant.");

    const errors: unknown[] = [];
    this.updating = true;
    try {
      for (const node of this.nodes.values()) {
        if (!node.active) continue;
        for (const id of [...(this.componentsByNode.get(node.id) ?? [])]) {
          const component = this.components.get(id);
          if (!component || !component.enabled || component.destroyed) continue;
          if (!component.started) {
            if (!this.invoke(component.behavior, component.behavior.onStart, errors)) continue;
            component.started = true;
          }
          this.invoke(component.behavior, component.behavior.onUpdate, errors, deltaSeconds);
        }
      }
      for (const system of [...this.systems]) {
        try { system.update(deltaSeconds, this); }
        catch (error) { errors.push(error); }
      }
    } finally {
      this.updating = false;
      this.flushMutations(errors);
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more component lifecycle callbacks failed.");
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.updating || this.flushing) throw new Error("ComponentWorld.dispose() must run outside an update boundary.");
    const errors: unknown[] = [];
    this.disposeNow(errors);
    if (errors.length > 0) throw new AggregateError(errors, "ComponentWorld disposal encountered lifecycle errors.");
  }

  private attachComponentNow(
    nodeId: string,
    typeId: string,
    inputProperties: JsonObject,
    instanceId: string,
    enabled: boolean,
  ): void {
    if (this.components.has(instanceId)) throw new Error("Component instance " + instanceId + " already exists.");
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error("Runtime node " + nodeId + " was not found.");
    const definition = this.registry.get(typeId);
    if (!definition) throw new ComponentWorldError("CORE_UNKNOWN_COMPONENT", "Component type " + typeId + " is not registered.");
    const validation = validateComponentProperties(definition.schema, inputProperties, {
      ...this.schemaContext,
      ownerNodeId: nodeId,
    });
    if (!validation.valid || !validation.value) {
      throw new ComponentWorldError("COMPONENT_INVALID_VALUE", "Properties for component " + typeId + " are invalid.", validation.diagnostics);
    }
    const behavior = definition.create({
      instanceId,
      node,
      properties: cloneJsonValue(validation.value),
    });
    if (!behavior || typeof behavior !== "object") throw new TypeError("Factory for component " + typeId + " did not return a behavior object.");

    const record: ComponentRecord = {
      id: instanceId,
      typeId,
      nodeId,
      definition,
      behavior,
      enabled,
      started: false,
      activeNotified: false,
      destroyed: false,
    };
    this.components.set(instanceId, record);
    this.componentsByNode.get(nodeId)?.push(instanceId);

    const errors: unknown[] = [];
    if (!this.invoke(behavior, behavior.onCreate, errors)) {
      this.removeComponentNow(instanceId, errors);
      throw new AggregateError(errors, "Component " + typeId + " failed during creation.");
    }
    if (this.isEffectivelyEnabled(record)) {
      if (this.invoke(behavior, behavior.onEnable, errors)) record.activeNotified = true;
      else {
        this.removeComponentNow(instanceId, errors);
        throw new AggregateError(errors, "Component " + typeId + " failed during enable.");
      }
    }
  }

  private removeComponentNow(instanceId: string, errors: unknown[] = []): void {
    const component = this.components.get(instanceId);
    if (!component || component.destroyed) return;
    if (component.activeNotified) {
      this.invoke(component.behavior, component.behavior.onDisable, errors);
      component.activeNotified = false;
    }
    component.destroyed = true;
    this.invoke(component.behavior, component.behavior.onDestroy, errors);
    this.components.delete(instanceId);
    const ids = this.componentsByNode.get(component.nodeId);
    if (ids) {
      const index = ids.indexOf(instanceId);
      if (index >= 0) ids.splice(index, 1);
    }
  }

  private isEffectivelyEnabled(component: ComponentRecord): boolean {
    return component.enabled && this.nodes.get(component.nodeId)?.active === true && !component.destroyed;
  }

  private synchronizeEnabledState(component: ComponentRecord): void {
    const nextActive = this.isEffectivelyEnabled(component);
    if (component.activeNotified === nextActive) return;
    const errors: unknown[] = [];
    const callback = nextActive ? component.behavior.onEnable : component.behavior.onDisable;
    const success = this.invoke(component.behavior, callback, errors);
    component.activeNotified = nextActive && success;
    if (errors.length > 0) throw new AggregateError(errors, "Component " + component.typeId + " could not change enabled state.");
  }

  private schedule(mutation: Mutation): void {
    if (this.updating || this.flushing) this.queuedMutations.push(mutation);
    else mutation();
  }

  private flushMutations(errors: unknown[]): void {
    if (this.flushing || this.queuedMutations.length === 0) return;
    this.flushing = true;
    let operations = 0;
    try {
      while (this.queuedMutations.length > 0) {
        operations += 1;
        if (operations > 10_000) {
          errors.push(new Error("ComponentWorld mutation queue exceeded its 10,000 operation safety limit."));
          this.queuedMutations.length = 0;
          break;
        }
        const mutation = this.queuedMutations.shift();
        if (!mutation) continue;
        try { mutation(); }
        catch (error) { errors.push(error); }
      }
    } finally {
      this.flushing = false;
    }
  }

  private disposeNow(errors: unknown[]): void {
    for (const id of [...this.components.keys()]) this.removeComponentNow(id, errors);
    for (const system of [...this.systems].reverse()) {
      try { system.dispose?.(); }
      catch (error) { errors.push(error); }
    }
    this.systems.length = 0;
    this.nodes.clear();
    this.componentsByNode.clear();
    this.queuedMutations.length = 0;
    this.disposed = true;
  }

  private invoke(
    receiver: object,
    callback: (() => void) | ((deltaSeconds: number) => void) | undefined,
    errors: unknown[],
    deltaSeconds?: number,
  ): boolean {
    if (!callback) return true;
    try {
      if (deltaSeconds === undefined) (callback as () => void).call(receiver);
      else (callback as (deltaSeconds: number) => void).call(receiver, deltaSeconds);
      return true;
    } catch (error) {
      errors.push(error);
      return false;
    }
  }

  private assertUsable(): void {
    if (this.disposed) throw new ComponentWorldError("CORE_WORLD_DISPOSED", "ComponentWorld has already been disposed.");
  }
}

export class ComponentWorldError extends Error {
  readonly code: CoreDiagnostic["code"];
  readonly diagnostics: CoreDiagnostic[];

  constructor(code: CoreDiagnostic["code"], message: string, diagnostics: CoreDiagnostic[] = []) {
    super(message);
    this.name = "ComponentWorldError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}
