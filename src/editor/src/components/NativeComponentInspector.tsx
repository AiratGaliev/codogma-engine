import { For, Match, Show, Switch } from "solid-js";
import type {
  AssetReference,
  ComponentPropertySchema,
  ComponentTypeSchemaV1,
  CoreDiagnostic,
  JsonValue,
} from "@codogma/cge";
import type { SceneNodeEntry } from "../domain/scene-model.js";

interface Props {
  instanceId: string;
  schema: ComponentTypeSchemaV1;
  properties: Record<string, unknown>;
  assets: readonly AssetReference[];
  nodes: readonly SceneNodeEntry[];
  ownerNodeId: string;
  diagnostics: readonly CoreDiagnostic[];
  drafts: Readonly<Record<string, string>>;
  onDraftChange: (key: string, value: string | undefined) => void;
  onCommit: (propertyName: string, value: JsonValue | undefined) => boolean;
}

function draftKey(instanceId: string, propertyName: string): string {
  return `${instanceId}:${propertyName}`;
}

function fieldValue(props: Props, name: string, property: ComponentPropertySchema): unknown {
  if (Object.prototype.hasOwnProperty.call(props.properties, name)) return props.properties[name];
  return property.defaultValue;
}

function formatValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function PropertyMessages(props: { diagnostics: readonly CoreDiagnostic[]; propertyName: string }) {
  const messages = () => props.diagnostics.filter((item) => item.propertyName === props.propertyName);
  return (
    <For each={messages()}>
      {(item) => (
        <div class={item.severity === "warning" ? "component-property-warning" : "component-property-error"} role={item.severity === "error" ? "alert" : "status"}>
          {item.message}
        </div>
      )}
    </For>
  );
}

function StringControl(props: {
  field: Props;
  name: string;
  schema: Extract<ComponentPropertySchema, { type: "string" }>;
  invalid: boolean;
}) {
  const key = draftKey(props.field.instanceId, props.name);
  const raw = () => props.field.drafts[key] ?? formatValue(fieldValue(props.field, props.name, props.schema));
  const label = () => props.schema.label ?? props.name;
  return (
    <>
      <input
        aria-label={label()}
        type="text"
        value={raw()}
        minLength={props.schema.minLength}
        maxLength={props.schema.maxLength}
        pattern={props.schema.pattern}
        required={props.schema.required}
        aria-invalid={props.invalid ? "true" : undefined}
        onInput={(event) => props.field.onDraftChange(key, event.currentTarget.value)}
        onBlur={() => {
          if (props.field.onCommit(props.name, raw())) props.field.onDraftChange(key, undefined);
        }}
      />
    </>
  );
}

function NumberControl(props: {
  field: Props;
  name: string;
  schema: Extract<ComponentPropertySchema, { type: "number" }>;
  invalid: boolean;
}) {
  const key = draftKey(props.field.instanceId, props.name);
  const raw = () => props.field.drafts[key] ?? formatValue(fieldValue(props.field, props.name, props.schema));
  const label = () => props.schema.label ?? props.name;
  return (
    <input
      aria-label={label()}
      type="number"
      value={raw()}
      min={props.schema.min}
      max={props.schema.max}
      step={props.schema.integer ? 1 : "any"}
      required={props.schema.required}
      aria-invalid={props.invalid ? "true" : undefined}
      onInput={(event) => props.field.onDraftChange(key, event.currentTarget.value)}
      onBlur={() => {
        const draft = raw().trim();
        const nextValue = draft.length === 0 ? undefined : Number(draft);
        if (props.field.onCommit(props.name, nextValue)) props.field.onDraftChange(key, undefined);
      }}
    />
  );
}

function BooleanControl(props: {
  field: Props;
  name: string;
  schema: Extract<ComponentPropertySchema, { type: "boolean" }>;
  invalid: boolean;
}) {
  const value = fieldValue(props.field, props.name, props.schema);
  return (
    <input
      aria-label={props.schema.label ?? props.name}
      type="checkbox"
      checked={typeof value === "boolean" ? value : false}
      aria-invalid={props.invalid ? "true" : undefined}
      onChange={(event) => props.field.onCommit(props.name, event.currentTarget.checked)}
    />
  );
}

function EnumControl(props: {
  field: Props;
  name: string;
  schema: Extract<ComponentPropertySchema, { type: "enum" }>;
  invalid: boolean;
}) {
  const value = fieldValue(props.field, props.name, props.schema);
  return (
    <select
      aria-label={props.schema.label ?? props.name}
      value={typeof value === "string" ? value : ""}
      required={props.schema.required}
      aria-invalid={props.invalid ? "true" : undefined}
      onChange={(event) => props.field.onCommit(props.name, event.currentTarget.value || undefined)}
    >
      <option value="">Select…</option>
      <For each={props.schema.options}>{(option) => <option value={option}>{option}</option>}</For>
    </select>
  );
}

function AssetControl(props: {
  field: Props;
  name: string;
  schema: Extract<ComponentPropertySchema, { type: "asset" }>;
  invalid: boolean;
}) {
  const value = () => fieldValue(props.field, props.name, props.schema);
  const label = () => props.schema.label ?? props.name;
  const currentAssetId = () => {
    const candidate = value();
    return candidate && typeof candidate === "object" && "assetId" in candidate && typeof candidate.assetId === "string"
      ? candidate.assetId
      : "";
  };
  const currentSubResourceId = () => {
    const candidate = value();
    return candidate && typeof candidate === "object" && "subResourceId" in candidate &&
      typeof candidate.subResourceId === "string"
      ? candidate.subResourceId
      : "";
  };
  const options = () => props.field.assets.filter((asset) =>
    !props.schema.assetKinds || props.schema.assetKinds.includes(asset.kind),
  );
  const registeredAsset = () => props.field.assets.find((asset) => asset.id === currentAssetId());
  const selectedAsset = () => options().find((asset) => asset.id === currentAssetId());
  const currentIsSelectable = () => selectedAsset() !== undefined;
  const showSubResource = () => props.schema.allowSubResource === true || currentSubResourceId().length > 0;
  const availableSubResourceId = () => props.schema.allowSubResource === true ? selectedAsset()?.subResourceId ?? "" : "";
  const subResourceIsSelectable = () =>
    currentSubResourceId().length === 0 || currentSubResourceId() === availableSubResourceId();

  return (
    <>
      <select
        aria-label={label()}
        value={currentAssetId()}
        required={props.schema.required}
        aria-invalid={props.invalid ? "true" : undefined}
        onChange={(event) => {
          const assetId = event.currentTarget.value;
          if (!assetId) {
            props.field.onCommit(props.name, undefined);
            return;
          }
          const selected = options().find((asset) => asset.id === assetId);
          if (!selected) return;
          // Changing the Asset clears the old sub-resource. It must never be
          // silently reassigned to a different Asset.
          props.field.onCommit(props.name, { assetId: selected.id });
        }}
      >
        <option value="">{options().length > 0 ? "Select Asset…" : "No compatible Assets in this Project"}</option>
        <Show when={currentAssetId() && !currentIsSelectable()}>
          <option value={currentAssetId()} disabled>
            {registeredAsset() ? "Incompatible Asset" : "Missing Asset"} ({currentAssetId()})
          </option>
        </Show>
        <For each={options()}>
          {(asset) => <option value={asset.id}>{asset.path} · {asset.kind}</option>}
        </For>
      </select>
      <Show when={showSubResource()}>
        <select
          aria-label={`${label()} sub-resource`}
          value={currentSubResourceId()}
          disabled={!availableSubResourceId() && !currentSubResourceId()}
          aria-invalid={props.invalid ? "true" : undefined}
          onChange={(event) => {
            const assetId = currentAssetId();
            if (!assetId) return;
            const subResourceId = event.currentTarget.value;
            props.field.onCommit(props.name, subResourceId ? { assetId, subResourceId } : { assetId });
          }}
        >
          <option value="">No sub-resource</option>
          <Show when={currentSubResourceId() && !subResourceIsSelectable()}>
            <option value={currentSubResourceId()} disabled>
              Missing or incompatible sub-resource ({currentSubResourceId()})
            </option>
          </Show>
          <Show when={availableSubResourceId()}>
            <option value={availableSubResourceId()}>{availableSubResourceId()}</option>
          </Show>
        </select>
      </Show>
    </>
  );
}

function NodeControl(props: {
  field: Props;
  name: string;
  schema: Extract<ComponentPropertySchema, { type: "node" }>;
  invalid: boolean;
}) {
  const value = () => fieldValue(props.field, props.name, props.schema);
  const currentNodeId = () => {
    const candidate = value();
    return candidate && typeof candidate === "object" && "nodeId" in candidate && typeof candidate.nodeId === "string"
      ? candidate.nodeId
      : "";
  };
  const registeredNode = () => props.field.nodes.find((node) => node.id === currentNodeId());
  const options = () => props.field.nodes.filter((node) =>
    (props.schema.allowSelf !== false || node.id !== props.field.ownerNodeId) &&
    (!props.schema.nodeKinds || props.schema.nodeKinds.includes(node.type)),
  );
  const currentIsSelectable = () => options().some((node) => node.id === currentNodeId());
  return (
    <select
      aria-label={props.schema.label ?? props.name}
      value={currentNodeId()}
      required={props.schema.required}
      aria-invalid={props.invalid ? "true" : undefined}
      onChange={(event) => {
        const nodeId = event.currentTarget.value;
        if (!nodeId) props.field.onCommit(props.name, undefined);
        else if (options().some((node) => node.id === nodeId)) props.field.onCommit(props.name, { nodeId });
      }}
    >
      <option value="">{options().length > 0 ? "Select Node…" : "No compatible Nodes in the active Scene"}</option>
      <Show when={currentNodeId() && !currentIsSelectable()}>
        <option value={currentNodeId()} disabled>
          {registeredNode() ? "Incompatible Node" : "Missing Node"} ({currentNodeId()})
        </option>
      </Show>
      <For each={options()}>
        {(node) => <option value={node.id}>{node.name} · {node.type}</option>}
      </For>
    </select>
  );
}

function PropertyControl(props: { field: Props; name: string; schema: ComponentPropertySchema; invalid: boolean }) {
  return (
    <Switch fallback={<span class="inspector-note">Unsupported property type.</span>}>
      <Match when={props.schema.type === "string"}>
        <StringControl field={props.field} name={props.name} schema={props.schema as Extract<ComponentPropertySchema, { type: "string" }>} invalid={props.invalid} />
      </Match>
      <Match when={props.schema.type === "number"}>
        <NumberControl field={props.field} name={props.name} schema={props.schema as Extract<ComponentPropertySchema, { type: "number" }>} invalid={props.invalid} />
      </Match>
      <Match when={props.schema.type === "boolean"}>
        <BooleanControl field={props.field} name={props.name} schema={props.schema as Extract<ComponentPropertySchema, { type: "boolean" }>} invalid={props.invalid} />
      </Match>
      <Match when={props.schema.type === "enum"}>
        <EnumControl field={props.field} name={props.name} schema={props.schema as Extract<ComponentPropertySchema, { type: "enum" }>} invalid={props.invalid} />
      </Match>
      <Match when={props.schema.type === "asset"}>
        <AssetControl field={props.field} name={props.name} schema={props.schema as Extract<ComponentPropertySchema, { type: "asset" }>} invalid={props.invalid} />
      </Match>
      <Match when={props.schema.type === "node"}>
        <NodeControl field={props.field} name={props.name} schema={props.schema as Extract<ComponentPropertySchema, { type: "node" }>} invalid={props.invalid} />
      </Match>
    </Switch>
  );
}

export function NativeComponentInspector(props: Props) {
  const schemaEntries = () => Object.entries(props.schema.properties);
  const warnings = () => props.diagnostics.filter((item) => item.severity === "warning");
  return (
    <div class="native-component-inspector" data-testid={`component-inspector-${props.instanceId}`}>
      <Show when={warnings().length > 0}>
        <For each={warnings()}>
          {(item) => <div class="component-property-warning" role="status">{item.message}</div>}
        </For>
      </Show>
      <For each={schemaEntries()}>
        {([name, property]) => {
          const label = property.label ?? name;
          const storage = property.storage ?? "persisted";
          return (
            <div class="component-property-field" data-property={name}>
              <div class="component-property-heading">
                <span>{label}{property.required ? " *" : ""}</span>
                <Show when={property.defaultValue !== undefined}>
                  <span class="component-property-default">Default: {formatValue(property.defaultValue)}</span>
                </Show>
              </div>
              <Show when={property.description}>
                <div class="component-property-description">{property.description}</div>
              </Show>
              <Show when={storage === "persisted"} fallback={
                <div class="component-property-storage-note">
                  {storage === "editorOnly" ? "Editor-only value is not stored in Scene documents." : "Runtime-only value is supplied by the runtime, not the persisted Scene."}
                </div>
              }>
                <PropertyControl
                  field={props}
                  name={name}
                  schema={property}
                  invalid={props.diagnostics.some((item) => item.propertyName === name && item.severity === "error")}
                />
                <Show when={!property.required}>
                  <button
                    type="button"
                    class="component-property-clear"
                    disabled={fieldValue(props, name, property) === undefined && props.drafts[draftKey(props.instanceId, name)] === undefined}
                    onClick={() => {
                      const key = draftKey(props.instanceId, name);
                      if (props.onCommit(name, undefined)) props.onDraftChange(key, undefined);
                    }}
                  >
                    Reset
                  </button>
                </Show>
                <PropertyMessages diagnostics={props.diagnostics} propertyName={name} />
              </Show>
            </div>
          );
        }}
      </For>
      <Show when={schemaEntries().length === 0}>
        <div class="component-empty">This Component Schema declares no properties.</div>
      </Show>
    </div>
  );
}
