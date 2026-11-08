namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixGrayscaleSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixGrayscaleSection", "Color Matrix Grayscale", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.grayscale);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_GRAYSCALE;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
