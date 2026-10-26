namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCombineColorMatrixSection extends SceneGameObjectSection<FXCombineColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXCombineColorMatrixSection", "Combine Color Matrix Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyStringRow(comp, FXCombineColorMatrixComponent.texture);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXCombineColorMatrix;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
