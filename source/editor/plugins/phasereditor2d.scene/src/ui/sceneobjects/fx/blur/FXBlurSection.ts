namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlurSection extends SceneGameObjectSection<FXBlur> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXBlurSection", "Blur Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXBlurComponent.quality);

            this.createNumberProperty(comp, FXBlurComponent.x);

            this.createNumberProperty(comp, FXBlurComponent.y);

            this.createNumberProperty(comp, FXBlurComponent.strength);

            this.createPropertyColorRow(comp, FXBlurComponent.color, false);

            this.createNumberProperty(comp, FXBlurComponent.steps);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXBlur;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
