/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixComponent extends Component<FXColorMatrix> {

        static MATRIX_PRESETS_NAMES = [
            "BLACK_WHITE",
            "NEGATIVE",
            "DESATURATE_LUMINANCE",
            "SEPIA",
            "LSD",
            "BROWN",
            "VINTAGE",
            "KODACHROME",
            "TECHNICOLOR",
            "POLAROID",
            "SHIFT_BGR",
        ];

        // In Phaser 4 the alpha is on the internal Phaser.Display.ColorMatrix,
        // not on the filter controller (as it was in the Phaser 3.90 FX).
        static alpha: IProperty<FXColorMatrix> = {
            ...SimpleProperty("alpha", 1, "Alpha", "phaser:Phaser.Display.ColorMatrix.alpha", false, undefined, 0.01, 0, 1),
            codeName: "colorMatrix.alpha",
            getValue: fx => fx.getPhaserFX().colorMatrix.alpha,
            setValue: (fx, value) => fx.getPhaserFX().colorMatrix.alpha = value,
        };

        // shortcut: the preset is stored by name (official v4 stores the raw
        // matrix array). Scenes saved by the official editor with a SET_MATRIX
        // ColorMatrix load as NOP; upgrade path: match the array against the
        // Phaser.Display.ColorMatrix constants.
        static matrixPreset = SimpleEnumProperty(
            "matrixPreset", undefined,
            FXColorMatrixComponent.MATRIX_PRESETS_NAMES,
            FXColorMatrixComponent.MATRIX_PRESETS_NAMES,
            "Preset", "The color matrix preset.", undefined, undefined,
            (name: string) => `Phaser.Display.ColorMatrix.${name}`);

        static brightness = SimpleProperty("brightness", 0, "Brightness", "phaser:Phaser.Display.ColorMatrix.brightness(value)", false, undefined, 0.01, 0, 1);
        static saturate = SimpleProperty("saturate", 0, "Saturate", "phaser:Phaser.Display.ColorMatrix.saturate(value)", false, undefined, 0.01);
        static hueRotation = SimpleProperty("hueRotation", 0, "Rotation", "phaser:Phaser.Display.ColorMatrix.hue(rotation)", false, undefined, 1, -360, 360);
        static grayscale = SimpleProperty("grayscale", 1, "Grayscale", "phaser:Phaser.Display.ColorMatrix.grayscale(value)", false, undefined, 0.01);
        static contrast = SimpleProperty("contrast", 0, "Contrast", "phaser:Phaser.Display.ColorMatrix.contrast(value)", false, undefined, 0.01, 0);
        static nightIntensity = SimpleProperty("nightIntensity", 0.1, "Intensity", "phaser:Phaser.Display.ColorMatrix.night(intensity)", false, undefined, 0.01, 0);

        constructor(obj: FXColorMatrix) {
            super(obj, [FXColorMatrixComponent.alpha]);
        }

        override readJSON(ser: core.json.Serializer) {

            const obj = this.getObject();

            // read the operation first, so getProperties() (which depends on it)
            // can collect the right properties in super.readJSON()
            obj.operationType = ser.read("operationType", ColorMatrixOperationType.NOP);

            super.readJSON(ser);
        }

        override writeJSON(ser: core.json.Serializer) {

            const obj = this.getObject();

            ser.write("operationType", obj.operationType);

            super.writeJSON(ser);
        }

        override getProperties(): Set<IProperty<any>> {

            switch (this.getObject().operationType) {

                case ColorMatrixOperationType.SET_MATRIX:
                    return new Set([
                        FXColorMatrixComponent.matrixPreset,
                        FXColorMatrixComponent.alpha,
                    ]);

                case ColorMatrixOperationType.SET_BRIGHTNESS:
                    return new Set([
                        FXColorMatrixComponent.brightness,
                        FXColorMatrixComponent.alpha,
                    ]);

                case ColorMatrixOperationType.SET_SATURATE:
                    return new Set([
                        FXColorMatrixComponent.saturate,
                        FXColorMatrixComponent.alpha,
                    ]);

                case ColorMatrixOperationType.SET_HUE:
                    return new Set([
                        FXColorMatrixComponent.hueRotation,
                        FXColorMatrixComponent.alpha,
                    ]);

                case ColorMatrixOperationType.SET_GRAYSCALE:
                    return new Set([
                        FXColorMatrixComponent.grayscale,
                        FXColorMatrixComponent.alpha,
                    ]);

                case ColorMatrixOperationType.SET_CONTRAST:
                    return new Set([
                        FXColorMatrixComponent.contrast,
                        FXColorMatrixComponent.alpha,
                    ]);

                case ColorMatrixOperationType.SET_NIGHT:
                    return new Set([
                        FXColorMatrixComponent.nightIntensity,
                        FXColorMatrixComponent.alpha,
                    ]);
            }

            return new Set();
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();

            // Phaser 4 adaptation: the official v4 (Phaser 3.90) calls the color
            // operations on the filter itself; in Phaser 4 they are methods of
            // the internal `Phaser.Display.ColorMatrix` instance.
            const opTarget = `${args.objectVarName}.colorMatrix`;

            switch (obj.operationType) {

                case ColorMatrixOperationType.SET_MATRIX:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "set", FXColorMatrixComponent.matrixPreset);
                    break;

                case ColorMatrixOperationType.SET_BRIGHTNESS:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "brightness", FXColorMatrixComponent.brightness);
                    break;

                case ColorMatrixOperationType.SET_SATURATE:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "saturate", FXColorMatrixComponent.saturate);
                    break;

                case ColorMatrixOperationType.SET_HUE:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "hue", FXColorMatrixComponent.hueRotation);
                    break;

                case ColorMatrixOperationType.SET_GRAYSCALE:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "grayscale", FXColorMatrixComponent.grayscale);
                    break;

                case ColorMatrixOperationType.SET_CONTRAST:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "contrast", FXColorMatrixComponent.contrast);
                    break;

                case ColorMatrixOperationType.SET_NIGHT:
                    this.buildSetObjectPropertiesWithMethodCodeDOM_FloatProperty(
                        { ...args, objectVarName: opTarget }, "night", FXColorMatrixComponent.nightIntensity);
                    break;
            }

            this.buildSetObjectPropertyCodeDOM_FloatProperty(args, FXColorMatrixComponent.alpha);
        }
    }
}
