import type {
  ComponentInstanceDocument,
  RuntimeSelectionIdentity,
} from "@codogma/cge";
import type { SceneNodeEntry } from "./scene-model.js";

export type RuntimeAuthoringSelection =
  | { readonly status: "resolved"; readonly node: SceneNodeEntry; readonly component?: ComponentInstanceDocument }
  | { readonly status: "stale"; readonly node: null; readonly component: null };

function exactComponent(
  entry: SceneNodeEntry,
  instanceId: string,
  typeId: string,
): ComponentInstanceDocument | undefined {
  for (const candidate of [entry.node.components, entry.renderNode.components]) {
    const match = candidate.find((component) => component.id === instanceId);
    if (match) return match.typeId === typeId ? match : undefined;
  }
  return undefined;
}

/** Resolves runtime → authoring selection using exact persisted IDs only. */
export function resolveRuntimeAuthoringSelection(
  selection: RuntimeSelectionIdentity | null,
  entries: readonly SceneNodeEntry[],
): RuntimeAuthoringSelection | null {
  if (!selection) return null;
  const node = entries.find((entry) => entry.id === selection.nodeId);
  if (!node) return { status: "stale", node: null, component: null };
  if (selection.kind === "node") return { status: "resolved", node };

  const component = exactComponent(node, selection.componentInstanceId, selection.typeId);
  if (!component) return { status: "stale", node: null, component: null };
  return { status: "resolved", node, component };
}
