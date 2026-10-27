namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixSaturateSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixSaturateSection", "Color Matrix Saturate", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.saturate);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_SATURATE;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
