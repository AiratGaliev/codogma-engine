namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXDisplacementSection extends SceneGameObjectSection<FXDisplacement> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXDisplacementSection", "Displacement Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyStringRow(comp, FXDisplacementComponent.texture);

            this.createNumberProperty(comp, FXDisplacementComponent.x);

            this.createNumberProperty(comp, FXDisplacementComponent.y);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXDisplacement;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
