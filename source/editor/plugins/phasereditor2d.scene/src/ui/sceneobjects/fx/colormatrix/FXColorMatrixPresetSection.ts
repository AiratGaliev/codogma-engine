namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixPresetSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixPresetSection", "Color Matrix Preset", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyEnumRow(comp, FXColorMatrixComponent.matrixPreset);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix
                && obj.operationType === ColorMatrixOperationType.SET_MATRIX;
        }

        canEditNumber(n: number): boolean {
            return n > 0;
        }
    }
}
