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

export interface ComponentFactoryContext {
  readonly instanceId: string;
  readonly node: ComponentNodeContext;
  readonly properties: Readonly<JsonObject>;
}

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
      create: definition.create,
    });
    this.definitions.set(typeId, registeredDefinition);
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
