namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlendSection extends SceneGameObjectSection<FXBlend> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXBlendSection", "Blend Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyStringRow(comp, FXBlendComponent.texture);

            this.createNumberProperty(comp, FXBlendComponent.blendMode);

            this.createNumberProperty(comp, FXBlendComponent.amount);

            this.createPropertyColorRow(comp, FXBlendComponent.color, false);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXBlend;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
