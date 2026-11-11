export const moduleVersion = "1.0.0";

export const componentDefinition = {
  schema: {
    schemaVersion: 1 as const,
    typeId: "com.codogma.acceptance.follow-target",
    name: "Follow Target",
    version: moduleVersion,
    properties: {
      sprite: { type: "asset" as const, assetKinds: ["image"] as ["image"], required: true },
      target: { type: "node" as const, allowSelf: false, required: true },
      speed: { type: "number" as const, min: 0, defaultValue: 1 },
      editorLabel: { type: "string" as const, storage: "editorOnly" as const },
      runtimeElapsedSeconds: { type: "number" as const, storage: "runtime" as const },
    },
  },
  create(context: {
    readonly instanceId: string;
    readonly node: { readonly id: string; readonly name: string; readonly active: boolean };
    readonly properties: Readonly<Record<string, unknown>>;
  }) {
    let elapsedSeconds = 0;
    return {
      onUpdate(deltaSeconds: number) {
        elapsedSeconds += deltaSeconds;
      },
      inspect() {
        return { runtimeElapsedSeconds: elapsedSeconds };
      },
      get instanceId() {
        return context.instanceId;
      },
      get elapsedSeconds() {
        return elapsedSeconds;
      },
    };
  },
};
