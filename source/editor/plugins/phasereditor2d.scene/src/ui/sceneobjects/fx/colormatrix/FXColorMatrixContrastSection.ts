namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixContrastSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixContrastSection", "Color Matrix Contrast", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.contrast);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_CONTRAST;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
