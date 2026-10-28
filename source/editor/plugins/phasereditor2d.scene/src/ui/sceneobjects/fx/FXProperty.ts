namespace phasereditor2d.scene.ui.sceneobjects {

    export function FXProperty(prop: IProperty<any>): IProperty<FXObject> {

        return {
            ...prop,
            getValue: obj => {

                return prop.getValue(obj.getPhaserFX());
            },
            setValue: (obj, value) => {

                const target = obj.getPhaserFX();
                prop.setValue(target, value);
                if (target === obj) {
                    obj.onEditorPropertyChanged();
                }
            },
        };
    };

    export function FXEnumProperty(prop: IEnumProperty<any, any>): IEnumProperty<FXObject, any> {

        return {
            name: prop.name,
            defValue: prop.defValue,
            label: prop.label,
            tooltip: prop.tooltip,
            local: prop.local,
            codeName: prop.codeName,
            valueToCodeConverter: prop.valueToCodeConverter,
            getValue: obj => {

                return prop.getValue(obj.getPhaserFX());
            },
            setValue: (obj, value) => {

                const target = obj.getPhaserFX();
                prop.setValue(target, value);
                if (target === obj) {
                    obj.onEditorPropertyChanged();
                }
            },
            values: prop.values,
            getEnumValues: object => prop.getEnumValues(object.getPhaserFX()),
            getValueLabel: value => prop.getValueLabel(value)
        };
    };

    /**
     * Property for texture-key values.
     *
     * Phaser 4 filters store textures as internal wrappers (or Texture objects),
     * not as string keys, so the editor caches the key in a custom field
     * of the phaser FX object (`__editor_` prefix) and optionally applies it
     * to the live filter with the given callback.
     */
    export function FXTextureKeyProperty(
        name: string, defValue: string, label: string, tooltip: string,
        applyKey?: (fx: any, key: string) => void): IProperty<any> {

        return {
            name,
            defValue,
            label,
            tooltip,
            local: false,
            getValue: fx => {

                const val = fx["__editor_" + name];

                return val === undefined ? defValue : val;
            },
            setValue: (fx, value: string) => {

                const key = typeof value === "string" && value.trim() !== "" ? value : defValue;

                fx["__editor_" + name] = key;

                if (applyKey) {

                    applyKey(fx, key);
                }
            }
        };
    }

    /**
     * Reads the texture key cached by `FXTextureKeyProperty`, for code generation.
     */
    export function FXGetTextureKey(fx: any, name: string, defValue: string): string {

        const val = fx["__editor_" + name];

        return val === undefined ? defValue : val;
    }

    /**
     * Property for filters whose color is not a plain number
     * (it may be a `Phaser.Display.Color` object or a normalized RGBA array).
     *
     * The editor value is a hex string like `#ff0000`, cached in a custom field
     * of the phaser FX object (`color__` prefix, like `NumberColorProperty`),
     * and applied to the live filter with the given callback.
     */
    export function FXColorProperty(
        name: string, defValue: string, label: string, tooltip: string,
        applyColor: (fx: any, hexString: string) => void): IProperty<any> {

        return {
            name,
            defValue,
            label,
            tooltip,
            local: false,
            getValue: fx => {

                const val = fx["color__" + name];

                return val === undefined ? defValue : val;
            },
            setValue: (fx, value: string) => {

                // numeric colors (Phaser convention) are normalized first,
                // otherwise parseColor would throw and the value be dropped
                const hex = colorValueToHexString(value, defValue);

                try {

                    applyColor(fx, hex);

                    fx["color__" + name] = hex;

                } catch (e) {

                    // possible color syntax error.
                    console.log(e);
                }
            }
        };
    }

    /**
     * Reads the color of an `FXColorProperty` as a hex integer, for code generation.
     */
    export function FXColorToCode(fx: any, name: string, defValue: string): number {

        const val = fx["color__" + name];

        const hex = val === undefined ? defValue : val;

        const rgba = colibri.ui.controls.Colors.parseColor(hex);

        return Phaser.Display.Color.GetColor(rgba.r, rgba.g, rgba.b);
    }

    /**
     * Colors reach the editor as `#hex` strings (editor convention, scene JSON,
     * Inspector) or as numbers (Phaser convention: 0xRRGGBB, e.g. tint /
     * fillColor values coming from external tools or prefabs).
     * `Colors.parseColor` only understands strings, so a raw numeric value
     * used to throw inside `setValue` and be silently dropped by its catch,
     * leaving the default color applied and polluting the console.
     * This helper normalizes BOTH representations to the canonical `#rrggbb`
     * string (or returns the default when the value is unusable), so color
     * properties, model caches and code generators never assume one type.
     */
    export function colorValueToHexString(value: string | number | undefined | null, defValue: string): string {

        // only non-negative finite numbers are valid Phaser colors; anything
        // else (NaN, ±Infinity, negatives) falls back to the property default
        // instead of being masked into a destructive value (e.g. black tint)
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {

            return "#" + (Math.floor(value) & 0xffffff).toString(16).padStart(6, "0");
        }

        return typeof value === "string" && value.trim() !== "" ? value : defValue;
    }

    /**
     * Inverse of `colorValueToHexString`: parses an editor color value — a
     * `#hex` string or a number already stored by `NumberColorProperty` —
     * into a plain number for Phaser APIs (graphics lineStyle, rectangle
     * fills) and code generation. The FX wrappers hold the raw model field,
     * which may be either representation depending on load order, so the
     * consumers must never call string methods on it directly.
     */
    export function colorValueToNumber(value: string | number | undefined | null, defValue: number): number {

        if (typeof value === "number" && Number.isFinite(value)) {

            return value;
        }

        if (typeof value === "string" && value.trim() !== "") {

            const parsed = parseInt(value.trim().replace(/^#/, ""), 16);

            if (!Number.isNaN(parsed)) {

                return parsed;
            }
        }

        return defValue;
    }

    /**
     * Marker for Phaser game objects created by FX wrappers as render helpers
     * (the Circle background/ring graphics, the Gradient object). They live in
     * the Phaser display list (or the parent container) so Phaser renders them,
     * but they are NOT editor objects: they have no EditorSupport and must
     * never reach the editor object model (outline, selection, code generation,
     * migrations). Iteration points that read raw Phaser lists filter them out
     * through `isFXHelperObject`.
     */
    export function markFXHelperObject(obj: Phaser.GameObjects.GameObject): void {

        (obj as any)["__codogmaFXHelper"] = true;
    }

    export function isFXHelperObject(obj: any): boolean {

        return Boolean(obj && obj["__codogmaFXHelper"]);
    }

    /**
     * Reads a color hex string as normalized RGBA floats (0..1), for code generation.
     */
    export function FXColorToNormalizedArray(fx: any, name: string, defValue: string): number[] {

        const val = fx["color__" + name];

        const hex = val === undefined ? defValue : val;

        const rgba = colibri.ui.controls.Colors.parseColor(hex);

        return [rgba.r / 255, rgba.g / 255, rgba.b / 255];
    }
}
