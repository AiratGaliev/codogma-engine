import type { CoreDiagnostic } from "../diagnostics.js";
import { cloneJsonValue, isJsonValue, type JsonObject, type JsonValue } from "../json.js";
import { isValidStableId } from "../project-model/contracts.js";
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

interface RegisteredComponentSystem {
  readonly id: string;
  update(deltaSeconds: number, world: ComponentWorld): unknown;
  dispose?(): unknown;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function";
}

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

function freezeJsonValue<T extends JsonValue>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJsonValue(child);
    Object.freeze(value);
  }
  return value;
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
  private readonly systems: RegisteredComponentSystem[] = [];
  private readonly queuedMutations: Mutation[] = [];
  private readonly idFactory: () => string;
  private readonly schemaContext: Omit<ComponentSchemaContext, "ownerNodeId">;
  private updating = false;
  private flushing = false;
  private disposing = false;
  private disposed = false;

  constructor(
    readonly sceneId: string,
    private readonly registry: ComponentRegistry,
    options: ComponentWorldOptions = {},
  ) {
    if (!isValidStableId(sceneId)) throw new TypeError("A ComponentWorld requires a valid stable scene ID.");
    this.idFactory = options.idFactory ?? defaultIdFactory();
    this.schemaContext = options.schemaContext ?? {};
  }

  get isDisposed(): boolean { return this.disposed || this.disposing; }
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
    if (!isValidStableId(input.id) || !input.name.trim()) throw new TypeError("Runtime nodes require valid stable IDs and non-empty names.");
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
    if (!isJsonValue(properties)) throw new TypeError("Component properties must be JSON-compatible.");
    const propertiesSnapshot = cloneJsonValue(properties);
    const instanceId = options.instanceId ?? this.idFactory();
    if (!isValidStableId(instanceId)) throw new TypeError("A component instance requires a valid stable ID.");
    if (!isValidStableId(nodeId) || !isValidStableId(typeId)) throw new TypeError("Component attachment requires stable Node and type IDs.");
    const enabled = options.enabled ?? true;
    this.schedule(() => this.attachComponentNow(nodeId, typeId, propertiesSnapshot, instanceId, enabled));
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
      const errors: unknown[] = [];
      for (const id of this.componentsByNode.get(nodeId) ?? []) {
        const component = this.components.get(id);
        if (!component) continue;
        try {
          this.synchronizeEnabledState(component);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "One or more components failed during Node activation change.");
      }
    });
  }

  destroyNode(nodeId: string): void {
    this.assertUsable();
    this.schedule(() => {
      if (!this.nodes.has(nodeId)) return;
      const errors: unknown[] = [];
      for (const id of [...(this.componentsByNode.get(nodeId) ?? [])]) {
        this.removeComponentNow(id, errors);
      }
      this.componentsByNode.delete(nodeId);
      this.nodes.delete(nodeId);
      if (errors.length > 0) {
        throw new AggregateError(errors, "Node destruction encountered component lifecycle errors.");
      }
    });
  }

  registerSystem(system: ComponentSystem): void {
    this.assertUsable();
    if (!system || typeof system !== "object" ||
        !isValidStableId(system.id) ||
        typeof system.update !== "function" ||
        (system.dispose !== undefined && typeof system.dispose !== "function")) {
      throw new TypeError("A component system requires a stable ID, update function and optional dispose function.");
    }

    const systemId = system.id;
    const update = system.update;
    const dispose = system.dispose;
    const registeredSystem: RegisteredComponentSystem = Object.freeze({
      id: systemId,
      update(deltaSeconds: number, world: ComponentWorld): unknown {
        return update.call(system, deltaSeconds, world);
      },
      ...(dispose === undefined ? {} : {
        dispose(): unknown {
          return dispose.call(system);
        },
      }),
    });

    this.schedule(() => {
      if (this.systems.some((item) => item.id === systemId)) throw new Error("Component system " + systemId + " is already registered.");
      this.systems.push(registeredSystem);
    });
  }

  removeSystem(systemId: string): void {
    this.assertUsable();
    this.schedule(() => {
      const index = this.systems.findIndex((item) => item.id === systemId);
      if (index < 0) return;
      const system = this.systems[index];
      this.systems.splice(index, 1);
      const errors: unknown[] = [];
      try {
        this.assertSynchronous(system?.dispose?.(), errors, "ComponentSystem.dispose");
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) throw new AggregateError(errors, "Component system disposal failed.");
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
        try {
          this.assertSynchronous(system.update(deltaSeconds, this), errors, "ComponentSystem.update");
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.updating = false;
      this.flushMutations(errors);
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more component lifecycle callbacks failed.");
  }

  dispose(): void {
    if (this.disposed || this.disposing) return;
    if (this.updating || this.flushing) throw new Error("ComponentWorld.dispose() must run outside an update boundary.");
    const errors: unknown[] = [];
    this.disposing = true;
    try {
      this.disposeNow(errors);
    } finally {
      this.disposed = true;
      this.disposing = false;
    }
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
    const factoryResult: unknown = definition.create({
      instanceId,
      node,
      properties: freezeJsonValue(cloneJsonValue(validation.value)),
    });
    if (isThenable(factoryResult)) {
      void Promise.resolve(factoryResult).catch(() => undefined);
      throw new TypeError("Component factories must complete synchronously; Promise results are not supported.");
    }
    if (!factoryResult || typeof factoryResult !== "object") {
      throw new TypeError("Factory for component " + typeId + " did not return a behavior object.");
    }
    const behavior = factoryResult as ComponentBehavior;

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

  private removeComponentNow(instanceId: string, collectedErrors?: unknown[]): void {
    const errors = collectedErrors ?? [];
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
    if (collectedErrors === undefined && errors.length > 0) {
      throw new AggregateError(errors, "Component removal encountered lifecycle errors.");
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
    if (this.updating || this.flushing) {
      this.queuedMutations.push(mutation);
      return;
    }

    const errors: unknown[] = [];
    this.flushing = true;
    try {
      try { mutation(); }
      catch (error) { errors.push(error); }
      this.drainQueuedMutations(errors);
    } finally {
      this.flushing = false;
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "ComponentWorld mutations failed.");
  }

  private flushMutations(errors: unknown[]): void {
    if (this.flushing || this.queuedMutations.length === 0) return;
    this.flushing = true;
    try {
      this.drainQueuedMutations(errors);
    } finally {
      this.flushing = false;
    }
  }

  private drainQueuedMutations(errors: unknown[]): void {
    let operations = 0;
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
  }

  private disposeNow(errors: unknown[]): void {
    for (const id of [...this.components.keys()]) this.removeComponentNow(id, errors);
    for (const system of [...this.systems].reverse()) {
      try {
        this.assertSynchronous(system.dispose?.(), errors, "ComponentSystem.dispose");
      } catch (error) {
        errors.push(error);
      }
    }
    this.systems.length = 0;
    this.nodes.clear();
    this.components.clear();
    this.componentsByNode.clear();
    this.queuedMutations.length = 0;
  }

  private invoke(
    receiver: object,
    callback: (() => void) | ((deltaSeconds: number) => void) | undefined,
    errors: unknown[],
    deltaSeconds?: number,
  ): boolean {
    if (!callback) return true;
    try {
      const result = deltaSeconds === undefined
        ? (callback as () => unknown).call(receiver)
        : (callback as (deltaSeconds: number) => unknown).call(receiver, deltaSeconds);
      return this.assertSynchronous(result, errors, "Component lifecycle callbacks");
    } catch (error) {
      errors.push(error);
      return false;
    }
  }

  private assertSynchronous(result: unknown, errors: unknown[], owner: string): boolean {
    if (!isThenable(result)) return true;
    // Lifecycle operations are host-tick owned and therefore synchronous.
    // Consume an eventual rejection before rolling back the current operation.
    void Promise.resolve(result).catch(() => undefined);
    errors.push(new TypeError(owner + " must complete synchronously; Promise results are not supported."));
    return false;
  }

  private assertUsable(): void {
    if (this.disposed || this.disposing) throw new ComponentWorldError("CORE_WORLD_DISPOSED", "ComponentWorld is disposed or disposing.");
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
