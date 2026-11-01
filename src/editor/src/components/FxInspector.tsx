import { For, Show, createSignal } from "solid-js";
import type { FxEntry, FxObject, FxType } from "../domain/fx-model.ts";

interface NumericField {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step: number;
  initial: number;
  description: string;
}

interface TextField {
  key: string;
  label: string;
  initial: string;
  description: string;
  color?: boolean;
}

interface BooleanField {
  key: "reveal" | "yoyo";
  label: string;
  initial: boolean;
  description: string;
}

type FxField = NumericField | TextField | BooleanField;

interface Props {
  effects: FxEntry[];
  unsupportedTypes: string[];
  onAdd: (type: FxType) => void;
  onUpdate: (id: string, patch: Partial<FxObject>) => void;
  onRemove: (id: string) => void;
  onError: (message: string) => void;
}

const FX_TYPES: FxType[] = ["Circle", "Bloom", "Gradient", "Shine"];

function fieldsFor(effect: FxObject): FxField[] {
  switch (effect.type) {
    case "Circle":
      return [
        { key: "label", label: "Effect Name", initial: "Circle", description: "Name shown in the effect stack." },
        { key: "thickness", label: "Thickness", min: 0, step: 0.01, initial: 8, description: "Ring width in local pixels." },
        { key: "color", label: "Ring Color", step: 1, initial: "#ff33b2", description: "Color of the circular outline.", color: true },
        { key: "backgroundColor", label: "Background Color", step: 1, initial: "#ff0000", description: "Color behind the masked texture.", color: true },
        { key: "scale", label: "Scale", min: 0.01, step: 0.01, initial: 1, description: "Circle size relative to the parent bounds." },
        { key: "feather", label: "Feather", min: 0, step: 0.001, initial: 0.005, description: "Softness of the circular mask edge." },
      ];
    case "Bloom":
      return [
        { key: "label", label: "Effect Name", initial: "Bloom", description: "Name shown in the effect stack." },
        { key: "threshold", label: "Threshold", min: 0, max: 1, step: 0.01, initial: 0.5, description: "Minimum luminance that contributes to bloom." },
        { key: "blurRadius", label: "Blur Radius", min: 0, step: 0.1, initial: 2, description: "Blur radius applied to bright pixels." },
        { key: "blurSteps", label: "Blur Steps", min: 1, step: 1, initial: 4, description: "Number of blur sampling steps." },
        { key: "blurQuality", label: "Blur Quality", min: 0, max: 2, step: 1, initial: 0, description: "0 = low, 1 = medium, 2 = high." },
        { key: "blendAmount", label: "Blend Amount", min: 0, step: 0.05, initial: 1, description: "Contribution of the bloom path to the source." },
      ];
    case "Gradient":
      return [
        { key: "label", label: "Effect Name", initial: "Gradient", description: "Name shown in the effect stack." },
        { key: "color1", label: "Start Color", step: 1, initial: "#ff0000", description: "Start color of the gradient band.", color: true },
        { key: "color2", label: "End Color", step: 1, initial: "#00ff00", description: "End color of the gradient band.", color: true },
        { key: "alpha", label: "Alpha", min: 0, max: 1, step: 0.01, initial: 0.2, description: "Opacity of the gradient colors." },
        { key: "fromX", label: "Start X", min: 0, max: 1, step: 0.01, initial: 0, description: "Normalized horizontal gradient origin." },
        { key: "fromY", label: "Start Y", min: 0, max: 1, step: 0.01, initial: 0, description: "Normalized vertical gradient origin." },
        { key: "toX", label: "End X", min: 0, max: 1, step: 0.01, initial: 0, description: "Normalized horizontal gradient end." },
        { key: "toY", label: "End Y", min: 0, max: 1, step: 0.01, initial: 1, description: "Normalized vertical gradient end." },
        { key: "size", label: "Band Size", min: 0, step: 0.01, initial: 0, description: "Zero uses the full color ramp." },
      ];
    case "Shine":
      return [
        { key: "label", label: "Effect Name", initial: "Shine", description: "Name shown in the effect stack." },
        { key: "radius", label: "Radius", min: 0.01, step: 0.01, initial: 0.5, description: "Width of the shine band." },
        { key: "direction", label: "Direction", step: 0.01, initial: 0.5, description: "Direction in radians." },
        { key: "scale", label: "Travel Scale", min: 0.1, step: 0.1, initial: 2, description: "Travel distance relative to the parent bounds." },
        { key: "duration", label: "Duration (ms)", min: 1, step: 100, initial: 2000, description: "Time for one shine cycle." },
        { key: "reveal", label: "Reveal", initial: false, description: "Reveal the shine instead of wiping it away." },
        { key: "yoyo", label: "Yoyo", initial: false, description: "Reverse the shine at the end of each cycle." },
      ];
  }
}

function fieldValue(effect: FxObject, field: FxField): unknown {
  return effect[field.key] ?? field.initial;
}

function isBooleanField(field: FxField): field is BooleanField {
  return "initial" in field && typeof field.initial === "boolean";
}

function isTextField(field: FxField): field is TextField {
  return "initial" in field && typeof field.initial === "string";
}

function isInternalFx(effect: FxObject): boolean {
  return effect.preFX === true;
}

function colorPreview(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `#${Math.max(0, Math.floor(value)).toString(16).slice(-6).padStart(6, "0")}`;
  if (typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return value;
  return "transparent";
}

function EffectFields(props: { effect: FxObject; onUpdate: Props["onUpdate"]; onError: Props["onError"] }) {
  const fields = () => fieldsFor(props.effect);

  return (
    <div class="fx-field-list">
      <For each={fields()}>
        {(field) => (
          <Show
            when={isBooleanField(field)}
            fallback={
              <label class="inspector-field fx-inspector-field" title={field.description}>
                <span>{field.label}</span>
                <div class="fx-field-control">
                  <Show when={isTextField(field) && field.color}>
                    <span class="fx-color-swatch" aria-hidden="true" style={{ background: colorPreview(fieldValue(props.effect, field)) }} />
                  </Show>
                  <input
                  aria-label={`${props.effect.type} ${field.label}`}
                  type={isTextField(field) ? "text" : "number"}
                  min={isBooleanField(field) || isTextField(field) ? undefined : field.min}
                  max={isBooleanField(field) || isTextField(field) ? undefined : field.max}
                  step={isBooleanField(field) || isTextField(field) ? undefined : field.step}
                  value={String(fieldValue(props.effect, field))}
                  onChange={(event) => {
                    const value = isTextField(field) ? event.currentTarget.value : Number(event.currentTarget.value);
                    if (typeof value === "number" && !Number.isFinite(value)) return;
                    try {
                      props.onUpdate(props.effect.id, { [field.key]: value } as Partial<FxObject>);
                    } catch (error) {
                      props.onError(error instanceof Error ? error.message : String(error));
                    }
                  }}
                />
                </div>
              </label>
            }
          >
            <label class="inspector-field fx-inspector-toggle" title={field.description}>
              <span>{field.label}</span>
              <input
                aria-label={`${props.effect.type} ${field.label}`}
                type="checkbox"
                checked={Boolean(fieldValue(props.effect, field))}
                onChange={(event) => props.onUpdate(props.effect.id, { [field.key]: event.currentTarget.checked } as Partial<FxObject>)}
              />
            </label>
          </Show>
        )}
      </For>
    </div>
  );
}

function FxInspector(props: Props) {
  const [newType, setNewType] = createSignal<FxType>("Bloom");

  return (
    <section class="inspector-section fx-inspector" data-testid="fx-inspector">
      <div class="inspector-section-heading">
        <span>Effects</span>
        <span class="component-count">{props.effects.length}</span>
      </div>
      <div class="fx-add-row">
        <label class="fx-add-select-label">
          <span class="visually-hidden">New FX type</span>
          <select
            aria-label="New FX type"
            value={newType()}
            onChange={(event) => setNewType(event.currentTarget.value as FxType)}
          >
            <For each={FX_TYPES}>{(type) => <option value={type}>{type}</option>}</For>
          </select>
        </label>
        <button class="subtle-button" data-testid="add-fx" onClick={() => props.onAdd(newType())}>Add effect</button>
      </div>
      <Show when={props.unsupportedTypes.length > 0}>
        <div class="inspector-note" role="status" data-testid="unsupported-fx-note">
          Legacy effects not editable in this Host: {props.unsupportedTypes.join(", ")}. Their serialized data is preserved.
        </div>
      </Show>
      <Show when={props.effects.length > 0} fallback={<div class="component-empty">No supported effects. Add Circle, Bloom, Gradient or Shine to this object.</div>}>
        <For each={props.effects}>
          {(entry) => (
            <article class="fx-effect-card" data-testid={`fx-card-${entry.id}`}>
              <div class="fx-effect-header">
                <div class="fx-effect-title">
                  <strong>{entry.source.type}</strong>
                  <span>{entry.source.label ?? entry.source.type}</span>
                </div>
                <button
                  class="toolbar-icon-button tiny"
                  type="button"
                  aria-label={`Remove ${entry.source.type} effect`}
                  title="Remove effect"
                  onClick={() => props.onRemove(entry.id)}
                >×</button>
              </div>
              <Show when={entry.source.type === "Bloom" || entry.source.type === "Shine"}>
                <label class="inspector-field fx-stage-field">
                  <span>Filter stage</span>
                  <select
                    aria-label={`${entry.source.type} filter stage`}
                    value={isInternalFx(entry.source) ? "internal" : "external"}
                    onChange={(event) => props.onUpdate(entry.id, { preFX: event.currentTarget.value === "internal" } as Partial<FxObject>)}
                  >
                    <option value="internal">Internal · object space</option>
                    <option value="external">External · screen space</option>
                  </select>
                </label>
              </Show>
              <Show when={entry.source.type === "Circle" || entry.source.type === "Gradient"}>
                <div class="fx-stage-note">
                  {entry.source.type === "Circle" ? "Internal mask · object space" : "Gradient Game Object · sibling render layer"}
                </div>
              </Show>
              <EffectFields effect={entry.source} onUpdate={props.onUpdate} onError={props.onError} />
            </article>
          )}
        </For>
      </Show>
    </section>
  );
}

export default FxInspector;
