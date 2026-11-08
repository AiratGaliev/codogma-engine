namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixHueSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixHueSection", "Color Matrix Hue", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.hueRotation);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_HUE;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
