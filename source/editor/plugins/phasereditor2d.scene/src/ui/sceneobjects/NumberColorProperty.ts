namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    function parseColor(color: string, alpha = false) {

        const rgba = controls.Colors.parseColor(color);

        if (alpha) {

            return Phaser.Display.Color.GetColor32(rgba.r, rgba.g, rgba.b, rgba.a);
        }

        return Phaser.Display.Color.GetColor(rgba.r, rgba.g, rgba.b);
    }

    export function NumberColorProperty(
        name: string,  defValue: string, label: string, tooltip: string): IProperty<any> {

        return {
            name,
            defValue: defValue,
            label,
            tooltip,
            local: false,
            getValue: obj => {

                const val = obj["color__" + name];

                return val === undefined ? defValue : val;
            },
            setValue: (obj, value: string) => {

                // colors may arrive as numbers (Phaser convention: tint,
                // fillColor from external tools/prefabs); normalize them to
                // the #hex string first, otherwise parseColor would throw and
                // the value silently fall back to the default
                value = colorValueToHexString(value, defValue);

                // update the real object color property

                try {

                    const color = parseColor(value);

                    obj[name] = color;

                    // store the original value in the object

                    obj["color__" + name] = value;

                } catch (e) {

                    // possible color syntax error.

                    console.log(e);
                }
            }
        };
    }

    export function NumberColorPropertyCodeDomAdapter2(p: IProperty<any>): IProperty<any> {

        const name = p.name;

        const defValue = parseColor(p.defValue);

        return {
            name: name,
            defValue,
            label: p.label,
            tooltip: p.tooltip,
            local: p.local,
            getValue: obj => {

                const val = p.getValue(obj) as string;

                const color = parseColor(val);

                return color;
            },

            setValue: (obj, value) => {

                throw new Error("Unreachable code!");
            }
        }
    }

    export function NumberColorPropertyCodeDomAdapter(p: IProperty<any>): IProperty<any> {

        const name = p.name;

        const defValue = parseColor(p.defValue);

        return {
            name: name,
            defValue,
            label: p.label,
            tooltip: p.tooltip,
            local: p.local,
            getValue: obj => {

                const val = obj["color__" + name];

                if (val === undefined) {

                    return defValue;
                }

                return parseColor(val);
            },

            setValue: (obj, value) => {

                throw new Error("Unreachable code!");
            }
        }
    }
}