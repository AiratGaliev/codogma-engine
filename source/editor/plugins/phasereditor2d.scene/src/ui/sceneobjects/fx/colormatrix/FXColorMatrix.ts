/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The ColorMatrix operation of the editor: each FXColorMatrix object
     * holds a single operation (a preset matrix or a parametric color
     * transformation) applied to the internal `Phaser.Display.ColorMatrix`
     * instance of the Phaser 4 filter.
     */
    export enum ColorMatrixOperationType {
        NOP = 0,
        SET_MATRIX = 1,
        SET_BRIGHTNESS = 2,
        SET_SATURATE = 3,
        SET_HUE = 4,
        SET_GRAYSCALE = 5,
        SET_CONTRAST = 6,
        SET_NIGHT = 7,
    }

    /**
     * A Color Matrix filter: it transforms the colors of the image with a
     * mathematical matrix (hue, saturation, brightness, contrast, ...).
     *
     * In Phaser 4 the color operations are applied to the internal
     * `Phaser.Display.ColorMatrix` instance (e.g. `filter.colorMatrix.sepia()`).
     * The editor caches the values of the current operation and applies them
     * to the live filter, so the codegen can emit the same calls.
     */
    export class FXColorMatrix extends FXObject {

        private _editorSupport: FXColorMatrixEditorSupport;

        private _operationType: ColorMatrixOperationType = ColorMatrixOperationType.NOP;
        private _matrixPreset: string;
        private _brightness = 0;
        private _saturate = 0;
        private _hueRotation = 0;
        private _grayscale = 1;
        private _contrast = 0;
        private _nightIntensity = 0.1;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXColorMatrixExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addColorMatrix();

            this._editorSupport = new FXColorMatrixEditorSupport(this, scene);
        }

        get operationType() {

            return this._operationType;
        }

        set operationType(value: ColorMatrixOperationType) {

            this._operationType = value;
        }

        get matrixPreset() {

            return this._matrixPreset;
        }

        set matrixPreset(name: string) {

            if (name) {

                this.getPhaserFX().colorMatrix.set((Phaser.Display.ColorMatrix as any)[name]);
            }

            this._matrixPreset = name;
        }

        get brightness() {

            return this._brightness;
        }

        set brightness(value: number) {

            this.getPhaserFX().colorMatrix.brightness(value);

            this._brightness = value;
        }

        get saturate() {

            return this._saturate;
        }

        set saturate(value: number) {

            this.getPhaserFX().colorMatrix.saturate(value);

            this._saturate = value;
        }

        get hueRotation() {

            return this._hueRotation;
        }

        set hueRotation(value: number) {

            this.getPhaserFX().colorMatrix.hue(value);

            this._hueRotation = value;
        }

        get grayscale() {

            return this._grayscale;
        }

        set grayscale(value: number) {

            this.getPhaserFX().colorMatrix.grayscale(value);

            this._grayscale = value;
        }

        get contrast() {

            return this._contrast;
        }

        set contrast(value: number) {

            this.getPhaserFX().colorMatrix.contrast(value);

            this._contrast = value;
        }

        get nightIntensity() {

            return this._nightIntensity;
        }

        set nightIntensity(value: number) {

            this.getPhaserFX().colorMatrix.night(value);

            this._nightIntensity = value;
        }

        getPhaserFX(): Phaser.Filters.ColorMatrix {

            return super.getPhaserFX() as Phaser.Filters.ColorMatrix;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
