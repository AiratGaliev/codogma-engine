namespace phasereditor2d.scene.ui.sceneobjects {

    export function FXProperty(prop: IProperty<any>): IProperty<FXObject> {

        return {
            ...prop,
            getValue: obj => {

                return prop.getValue(obj.getPhaserFX());
            },
            setValue: (obj, value) => {

                prop.setValue(obj.getPhaserFX(), value);
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

                prop.setValue(obj.getPhaserFX(), value);
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

                if (typeof value === "string" && value.trim() === "") {

                    value = defValue;
                }

                try {

                    applyColor(fx, value);

                    fx["color__" + name] = value;

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
     * Reads a color hex string as normalized RGBA floats (0..1), for code generation.
     */
    export function FXColorToNormalizedArray(fx: any, name: string, defValue: string): number[] {

        const val = fx["color__" + name];

        const hex = val === undefined ? defValue : val;

        const rgba = colibri.ui.controls.Colors.parseColor(hex);

        return [rgba.r / 255, rgba.g / 255, rgba.b / 255];
    }
}