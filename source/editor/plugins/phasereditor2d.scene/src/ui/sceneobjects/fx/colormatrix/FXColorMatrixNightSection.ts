namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixNightSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixNightSection", "Color Matrix Night", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.nightIntensity);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_NIGHT;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
