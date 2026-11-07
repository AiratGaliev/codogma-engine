export const BUILTIN_COMPONENT_TYPES = {
  imageRenderer: "com.codogma.renderer.image",
  textRenderer: "com.codogma.renderer.text",
  container: "com.codogma.renderer.container",
} as const;

export type BuiltinRendererComponentType =
  (typeof BUILTIN_COMPONENT_TYPES)[keyof typeof BUILTIN_COMPONENT_TYPES];

export const FX_COMPONENT_TYPES = {
  Circle: "com.codogma.fx.circle",
  Bloom: "com.codogma.fx.bloom",
  Gradient: "com.codogma.fx.gradient",
  Shine: "com.codogma.fx.shine",
} as const;

export type BuiltinFxComponentType =
  (typeof FX_COMPONENT_TYPES)[keyof typeof FX_COMPONENT_TYPES];

export const BUILTIN_COMPONENT_TYPE_IDS: ReadonlySet<string> = new Set([
  ...Object.values(BUILTIN_COMPONENT_TYPES),
  ...Object.values(FX_COMPONENT_TYPES),
]);
