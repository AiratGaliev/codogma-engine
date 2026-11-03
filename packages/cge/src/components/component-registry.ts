import type { CoreDiagnostic } from "../diagnostics.js";
import type { JsonObject } from "../json.js";
import { validateComponentTypeSchema, type ComponentTypeSchemaV1 } from "./component-schema.js";

export interface ComponentNodeContext {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface ComponentBehavior {
  onCreate?(): void;
  onEnable?(): void;
  onStart?(): void;
  onUpdate?(deltaSeconds: number): void;
  onDisable?(): void;
  onDestroy?(): void;
}

/**
 * Factory input is a per-instance immutable JSON snapshot. Component factories
 * must be side-effect-free: acquire external resources in onCreate(), where
 * the returned behavior can participate in the normal cleanup lifecycle.
 */
export interface ComponentFactoryContext {
  readonly instanceId: string;
  readonly node: ComponentNodeContext;
  readonly properties: Readonly<JsonObject>;
}

/**
 * A versioned component implementation. Keep typeId stable across compatible
 * releases; bump schemaVersion for incompatible schema-contract changes and
 * version for changes to the component implementation/authoring definition.
 */
export interface ComponentTypeDefinition {
  readonly schema: ComponentTypeSchemaV1;
  create(context: ComponentFactoryContext): ComponentBehavior;
}

export class ComponentRegistrationError extends Error {
  readonly diagnostics: CoreDiagnostic[];

  constructor(message: string, diagnostics: CoreDiagnostic[] = []) {
    super(message);
    this.name = "ComponentRegistrationError";
    this.diagnostics = diagnostics;
  }
}

function cloneAndFreezeSchema(schema: ComponentTypeSchemaV1): ComponentTypeSchemaV1 {
  const snapshot = JSON.parse(JSON.stringify(schema)) as ComponentTypeSchemaV1;
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(snapshot);
  return snapshot;
}

export class ComponentRegistry {
  private readonly definitions = new Map<string, ComponentTypeDefinition>();

  register(definition: ComponentTypeDefinition): void {
    if (!definition || typeof definition !== "object" || typeof definition.create !== "function") {
      throw new ComponentRegistrationError(
        "Component type definition requires a factory function.",
        [{
          code: "COMPONENT_INVALID_SCHEMA",
          severity: "error",
          message: "Component factory must be a synchronous function.",
        }],
      );
    }
    const validation = validateComponentTypeSchema(definition.schema);
    if (!validation.valid || !validation.value) {
      throw new ComponentRegistrationError("Component type has an invalid schema.", validation.diagnostics);
    }
    const typeId = validation.value.typeId;
    if (this.definitions.has(typeId)) {
      throw new ComponentRegistrationError(
        "Component type " + typeId + " is already registered.",
        [{
          code: "CORE_DUPLICATE_REGISTRATION",
          severity: "error",
          message: "Component type " + typeId + " is already registered.",
        }],
      );
    }
    const registeredDefinition = Object.freeze({
      schema: cloneAndFreezeSchema(validation.value),
      create: (context: ComponentFactoryContext) => definition.create(context),
    });
    this.definitions.set(typeId, registeredDefinition);
  }

  /**
   * Removes a definition from future resolution. Worlds that already attached
   * the definition retain their immutable registration snapshot until teardown.
   */
  unregister(typeId: string): boolean {
    return this.definitions.delete(typeId);
  }

  get(typeId: string): ComponentTypeDefinition | undefined {
    return this.definitions.get(typeId);
  }

  has(typeId: string): boolean {
    return this.definitions.has(typeId);
  }

  list(): ComponentTypeDefinition[] {
    return [...this.definitions.values()];
  }

  get typeIds(): ReadonlySet<string> {
    return new Set(this.definitions.keys());
  }
}
