namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPixelateSection extends SceneGameObjectSection<FXPixelate> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXPixelateSection", "Pixelate Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXPixelateComponent.amount);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXPixelate;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
