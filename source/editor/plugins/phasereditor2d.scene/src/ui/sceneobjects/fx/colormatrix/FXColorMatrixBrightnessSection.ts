namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixBrightnessSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixBrightnessSection", "Color Matrix Brightness", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.brightness);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_BRIGHTNESS;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
