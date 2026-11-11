import type { CoreDiagnostic } from "../diagnostics.js";
import { cloneJsonValue, isJsonValue, type JsonObject, type JsonValue } from "../json.js";
import { isValidStableId } from "../project-model/contracts.js";
import { validateComponentProperties, type ComponentSchemaContext } from "./component-schema.js";
import {
  ComponentRegistry,
  type ComponentActivationContext,
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
  readonly transform: RuntimeTransform;
}

export interface RuntimeComponentSnapshot {
  readonly id: string;
  readonly typeId: string;
  readonly nodeId: string;
  readonly enabled: boolean;
  readonly started: boolean;
}

export type RuntimeComponentPropertyInspection =
  | { readonly status: "available"; readonly value: JsonValue }
  | { readonly status: "unsupported"; readonly reason: "not-exposed" | "unsupported-value" }
  | { readonly status: "error"; readonly message: string };

export interface RuntimeComponentInspectionSnapshot extends RuntimeComponentSnapshot {
  /** Contains only Component Schema properties declared with storage: "runtime". */
  readonly properties: Readonly<Record<string, RuntimeComponentPropertyInspection>>;
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
  inspect: (() => unknown) | undefined;
  enabled: boolean;
  started: boolean;
  activeNotified: boolean;
  destroyed: boolean;
  readonly lifetimeController: AbortController;
  activationController: AbortController | undefined;
}

type Mutation = () => void;

interface RuntimeNodeRecord {
  node: RuntimeNode;
  active: boolean;
}

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

interface InspectionBudget {
  nodes: number;
  characters: number;
}

function snapshotInspectionValue(
  value: unknown,
  budget: InspectionBudget,
  depth = 0,
): JsonValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > 2_000 || depth > 8) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    budget.characters += value.length;
    return budget.characters <= 65_536 && value.length <= 8_192 ? value : undefined;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object") return undefined;

  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0 ||
        value.length > 256 || Object.getOwnPropertyNames(value).length !== value.length + 1) {
      return undefined;
    }
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
      const child = snapshotInspectionValue(descriptor.value, budget, depth + 1);
      if (child === undefined) return undefined;
      result.push(child);
    }
    return result;
  }

  if ((prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(value).length > 0) {
    return undefined;
  }
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length > 128) return undefined;
  const result = Object.create(null) as JsonObject;
  for (const key of keys) {
    if (key.length > 128 || key === "__proto__" || key === "prototype" || key === "constructor") {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    budget.characters += key.length;
    if (budget.characters > 65_536) return undefined;
    const child = snapshotInspectionValue(descriptor.value, budget, depth + 1);
    if (child === undefined) return undefined;
    Object.defineProperty(result, key, {
      value: child,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return result;
}

function captureInspectionCallback(behavior: ComponentBehavior): (() => unknown) | undefined {
  try {
    let owner: object | null = behavior;
    let depth = 0;
    while (owner && owner !== Object.prototype && depth < 8) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, "inspect");
      if (descriptor) {
        if ("value" in descriptor && typeof descriptor.value === "function") {
          const callback = descriptor.value as () => unknown;
          return () => callback.call(behavior);
        }
        return undefined;
      }
      owner = Object.getPrototypeOf(owner) as object | null;
      depth += 1;
    }
  } catch {
    // A hostile Proxy must not make inspection capability discovery fail.
  }
  return undefined;
}

function safeSnapshotInspectionValue(value: unknown, budget: InspectionBudget): JsonValue | undefined {
  try {
    return snapshotInspectionValue(value, budget);
  } catch {
    // Proxy traps and hostile object reflection must degrade to "unsupported".
    return undefined;
  }
}

function consumeInspectionThenable(value: unknown): boolean {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  try {
    let owner: object | null = value as object;
    let depth = 0;
    while (owner && depth < 8) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, "then");
      if (descriptor) {
        if (!("value" in descriptor)) return true;
        if (typeof descriptor.value !== "function") return false;
        try {
          // Consume an eventual rejection without awaiting or accepting the value.
          descriptor.value.call(value, () => undefined, () => undefined);
        } catch {
          // Invalid thenables are still rejected as inspection values.
        }
        return true;
      }
      owner = Object.getPrototypeOf(owner) as object | null;
      depth += 1;
    }
  } catch {
    return true;
  }
  return false;
}

function inspectionErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === "string" && error.message.length > 0) {
      return error.message.slice(0, 240);
    }
  } catch {
    // Untrusted error-like objects must not break Inspector refresh.
  }
  return "Runtime inspection failed.";
}

function matchesRuntimePropertySchema(
  schema: import("./component-schema.js").ComponentPropertySchema,
  value: JsonValue,
): boolean {
  switch (schema.type) {
    case "string":
      return typeof value === "string" &&
        (schema.minLength === undefined || value.length >= schema.minLength) &&
        (schema.maxLength === undefined || value.length <= schema.maxLength) &&
        (schema.pattern === undefined || new RegExp(schema.pattern).test(value));
    case "number":
      return typeof value === "number" && Number.isFinite(value) &&
        (!schema.integer || Number.isInteger(value)) &&
        (schema.min === undefined || value >= schema.min) &&
        (schema.max === undefined || value <= schema.max);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && schema.options.includes(value);
    case "asset":
      return value !== null && typeof value === "object" && !Array.isArray(value) &&
        typeof value.assetId === "string" &&
        (value.subResourceId === undefined || (schema.allowSubResource === true && typeof value.subResourceId === "string")) &&
        Object.keys(value).every((key) => key === "assetId" || key === "subResourceId");
    case "node":
      return value !== null && typeof value === "object" && !Array.isArray(value) &&
        typeof value.nodeId === "string" && Object.keys(value).every((key) => key === "nodeId");
  }
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
  private readonly nodes = new Map<string, RuntimeNodeRecord>();
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
    const nodeRecord: RuntimeNodeRecord = {
      node: undefined as unknown as RuntimeNode,
      active: input.active ?? true,
    };
    const node: RuntimeNode = Object.freeze({
      id: input.id,
      name: input.name,
      get active(): boolean { return nodeRecord.active; },
      transform: makeRuntimeTransform(input.transform),
    });
    nodeRecord.node = node;
    this.nodes.set(node.id, nodeRecord);
    this.componentsByNode.set(node.id, []);
    return node;
  }

  getNode(nodeId: string): RuntimeNode | undefined { return this.nodes.get(nodeId)?.node; }
  listNodes(): RuntimeNode[] { return [...this.nodes.values()].map((record) => record.node); }

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
      const nodeRecord = this.nodes.get(nodeId);
      if (!nodeRecord) throw new Error("Runtime node " + nodeId + " was not found.");
      if (nodeRecord.active === active) return;
      nodeRecord.active = active;
      const errors: unknown[] = [];
      for (const id of [...(this.componentsByNode.get(nodeId) ?? [])]) {
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
      const nodeRecord = this.nodes.get(nodeId);
      if (nodeRecord) nodeRecord.active = false;
      this.componentsByNode.delete(nodeId);
      this.nodes.delete(nodeId);
      if (errors.length > 0) {
        throw new AggregateError(errors, "Node destruction encountered component lifecycle errors.");
      }
    });
  }

  registerSystem(system: ComponentSystem): void {
    this.assertUsable();
    if (!system || typeof system !== "object") {
      throw new TypeError("A component system requires a stable ID, update function and optional dispose function.");
    }
    const { id: systemId, update, dispose } = system;
    if (!isValidStableId(systemId) ||
        typeof update !== "function" ||
        (dispose !== undefined && typeof dispose !== "function")) {
      throw new TypeError("A component system requires a stable ID, update function and optional dispose function.");
    }
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

  /** Reads the current enabled flag without allocating a Component snapshot. */
  isComponentEnabled(instanceId: string): boolean {
    this.assertUsable();
    return this.components.get(instanceId)?.enabled === true;
  }

  /**
   * Reads schema-declared runtime properties through an explicit Component
   * inspection callback. Authoring properties and private behavior fields are
   * never read or inferred by this method.
   */
  inspectComponent(instanceId: string): RuntimeComponentInspectionSnapshot | undefined {
    this.assertUsable();
    const component = this.components.get(instanceId);
    if (!component || component.destroyed) return undefined;

    const runtimeProperties = Object.entries(component.definition.schema.properties)
      .filter(([, property]) => (property.storage ?? "persisted") === "runtime");
    const properties = Object.create(null) as Record<string, RuntimeComponentPropertyInspection>;
    if (runtimeProperties.length === 0) {
      return Object.freeze({
        id: component.id,
        typeId: component.typeId,
        nodeId: component.nodeId,
        enabled: component.enabled,
        started: component.started,
        properties: Object.freeze(properties),
      });
    }

    let values: unknown;
    let inspectionError: string | undefined;
    if (!component.inspect) {
      // Missing inspection capability is distinct from a provider exception.
    } else {
      try {
        values = component.inspect();
        if (consumeInspectionThenable(values)) {
          inspectionError = "Component inspect() must return synchronously.";
        }
      } catch (error) {
        inspectionError = inspectionErrorMessage(error);
      }
    }

    let valuesAreRecord = false;
    if (values !== null && typeof values === "object") {
      try {
        const prototype = Object.getPrototypeOf(values);
        valuesAreRecord = !Array.isArray(values) &&
          (prototype === Object.prototype || prototype === null) &&
          Object.getOwnPropertySymbols(values).length === 0;
      } catch {
        valuesAreRecord = false;
      }
    }

    const budget: InspectionBudget = { nodes: 0, characters: 0 };
    for (const [name, schema] of runtimeProperties) {
      if (inspectionError !== undefined) {
        properties[name] = Object.freeze({ status: "error", message: inspectionError });
        continue;
      }
      if (!component.inspect || !valuesAreRecord) {
        properties[name] = Object.freeze({ status: "unsupported", reason: "not-exposed" });
        continue;
      }

      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(values, name);
      } catch {
        descriptor = undefined;
      }
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        properties[name] = Object.freeze({ status: "unsupported", reason: "not-exposed" });
        continue;
      }

      const safeValue = safeSnapshotInspectionValue(descriptor.value, budget);
      if (safeValue === undefined || !matchesRuntimePropertySchema(schema, safeValue)) {
        properties[name] = Object.freeze({ status: "unsupported", reason: "unsupported-value" });
        continue;
      }
      properties[name] = Object.freeze({ status: "available", value: freezeJsonValue(safeValue) });
    }

    return Object.freeze({
      id: component.id,
      typeId: component.typeId,
      nodeId: component.nodeId,
      enabled: component.enabled,
      started: component.started,
      properties: Object.freeze(properties),
    });
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
      for (const nodeRecord of this.nodes.values()) {
        if (!nodeRecord.active) continue;
        const node = nodeRecord.node;
        for (const id of [...(this.componentsByNode.get(node.id) ?? [])]) {
          const component = this.components.get(id);
          if (!component || !component.enabled || !component.activeNotified || component.destroyed) continue;
          if (!component.started) {
            if (!this.invoke(component.behavior, component.behavior.onStart, errors)) {
              this.schedule(() => this.removeComponentNow(component.id));
              continue;
            }
            component.started = true;
          }
          if (!this.invoke(component.behavior, component.behavior.onUpdate, errors, deltaSeconds)) {
            this.schedule(() => this.removeComponentNow(component.id));
          }
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
    const node = this.nodes.get(nodeId)?.node;
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
    const lifetimeController = new AbortController();
    let factoryResult: unknown;
    try {
      factoryResult = definition.create({
        instanceId,
        node,
        properties: freezeJsonValue(cloneJsonValue(validation.value)),
        signal: lifetimeController.signal,
      });
    } catch (error) {
      lifetimeController.abort(error);
      throw error;
    }
    if (isThenable(factoryResult)) {
      lifetimeController.abort(new TypeError("Component factories must complete synchronously."));
      void Promise.resolve(factoryResult).catch(() => undefined);
      throw new TypeError("Component factories must complete synchronously; Promise results are not supported.");
    }
    if (!factoryResult || typeof factoryResult !== "object") {
      lifetimeController.abort(new TypeError("Component factory returned an invalid behavior."));
      throw new TypeError("Factory for component " + typeId + " did not return a behavior object.");
    }
    const behavior = factoryResult as ComponentBehavior;

    const record: ComponentRecord = {
      id: instanceId,
      typeId,
      nodeId,
      definition,
      behavior,
      inspect: captureInspectionCallback(behavior),
      enabled,
      started: false,
      activeNotified: false,
      destroyed: false,
      lifetimeController,
      activationController: undefined,
    };
    this.components.set(instanceId, record);
    this.componentsByNode.get(nodeId)?.push(instanceId);

    const errors: unknown[] = [];
    if (!this.invoke(behavior, behavior.onCreate, errors)) {
      this.removeComponentNow(instanceId, errors);
      throw new AggregateError(errors, "Component " + typeId + " failed during creation.");
    }
    if (this.isEffectivelyEnabled(record) && !this.enableComponent(record, errors)) {
      this.removeComponentNow(instanceId, errors);
      throw new AggregateError(errors, "Component " + typeId + " failed during enable.");
    }
  }

  private removeComponentNow(instanceId: string, collectedErrors?: unknown[]): void {
    const errors = collectedErrors ?? [];
    const component = this.components.get(instanceId);
    if (!component || component.destroyed) return;
    if (component.activeNotified) {
      component.activationController?.abort();
      component.activationController = undefined;
      this.invoke(component.behavior, component.behavior.onDisable, errors);
      component.activeNotified = false;
    }
    component.lifetimeController.abort();
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
    if (nextActive) {
      if (!this.enableComponent(component, errors)) this.removeComponentNow(component.id, errors);
    } else {
      // Abort enabled-scope resources before invoking the user's disable hook.
      component.activationController?.abort();
      component.activationController = undefined;
      component.activeNotified = false;
      if (!this.invoke(component.behavior, component.behavior.onDisable, errors)) {
        this.removeComponentNow(component.id, errors);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Component " + component.typeId + " could not change enabled state.");
  }

  private enableComponent(component: ComponentRecord, errors: unknown[]): boolean {
    const controller = new AbortController();
    component.activationController = controller;
    const success = this.invoke(
      component.behavior,
      component.behavior.onEnable,
      errors,
      undefined,
      { signal: controller.signal },
    );
    component.activeNotified = success;
    if (!success) {
      controller.abort();
      component.activationController = undefined;
    }
    return success;
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
    for (const nodeRecord of this.nodes.values()) nodeRecord.active = false;
    this.nodes.clear();
    this.components.clear();
    this.componentsByNode.clear();
    this.queuedMutations.length = 0;
  }

  private invoke(
    receiver: object,
    callback:
      | (() => void)
      | ((deltaSeconds: number) => void)
      | ((context: ComponentActivationContext) => void)
      | undefined,
    errors: unknown[],
    deltaSeconds?: number,
    activationContext?: ComponentActivationContext,
  ): boolean {
    if (!callback) return true;
    try {
      const result = activationContext !== undefined
        ? (callback as (context: ComponentActivationContext) => unknown).call(receiver, activationContext)
        : deltaSeconds === undefined
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
