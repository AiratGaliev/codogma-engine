namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXImageLightSection extends SceneGameObjectSection<FXImageLight> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXImageLightSection", "Image Light Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyStringRow(comp, FXImageLightComponent.environmentTexture);

            this.createPropertyStringRow(comp, FXImageLightComponent.normalTexture);

            this.createNumberProperty(comp, FXImageLightComponent.modelRotation);

            this.createNumberProperty(comp, FXImageLightComponent.bulge);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXImageLight;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
