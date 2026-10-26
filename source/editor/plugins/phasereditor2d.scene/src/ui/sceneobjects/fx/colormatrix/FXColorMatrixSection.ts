namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixSection extends SceneGameObjectSection<FXColorMatrix> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXColorMatrixSection", "Color Matrix Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            const label = this.createLabel(comp,
                "The color transformations are set in user code (filter.colorMatrix).",
                "The Color Matrix filter transforms the colors with a mathematical matrix. Use filter.colorMatrix.sepia(), grayscale(), brightness(), contrast(), etc.");

            label.style.gridColumn = "1 / span 3";
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXColorMatrix;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
