export interface NativeComponentModuleSourceInput {
  typeId: string;
  name: string;
  version: string;
}

/**
 * Creates an editable TypeScript starter for a native Component module.
 * Metadata is emitted as JSON string literals, never as executable input.
 */
export function createNativeComponentModuleSource(input: NativeComponentModuleSourceInput): string {
  const typeId = input.typeId.trim();
  const name = input.name.trim();
  const version = input.version.trim();
  if (!typeId || !name || !version) throw new TypeError("Component typeId, display name, and version must be non-empty.");
  return [
    "/** Native Codogma Component Definition. Edit the schema and factory below. */",
    "export const componentDefinition = {",
    "  schema: {",
    "    schemaVersion: 1 as const,",
    "    typeId: " + JSON.stringify(typeId) + ",",
    "    name: " + JSON.stringify(name) + ",",
    "    version: " + JSON.stringify(version) + ",",
    "    properties: {},",
    "  },",
    "  create(_context: {",
    "    readonly instanceId: string;",
    "    readonly node: { readonly id: string; readonly name: string; readonly active: boolean };",
    "    readonly properties: Readonly<Record<string, unknown>>;",
    "    readonly signal?: AbortSignal;",
    "  }) {",
    "    return {};",
    "  },",
    "};",
    "",
  ].join("\n");
}
