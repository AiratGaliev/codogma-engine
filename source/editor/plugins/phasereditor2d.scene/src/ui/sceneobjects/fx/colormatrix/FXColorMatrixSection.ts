namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixSection", "Color Matrix Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXColorMatrixComponent.alpha);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
