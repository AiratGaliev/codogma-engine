namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPanoramaBlurSection extends SceneGameObjectSection<FXPanoramaBlur> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXPanoramaBlurSection", "Panorama Blur Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXPanoramaBlurComponent.radius);

            this.createNumberProperty(comp, FXPanoramaBlurComponent.samplesX);

            this.createNumberProperty(comp, FXPanoramaBlurComponent.samplesY);

            this.createNumberProperty(comp, FXPanoramaBlurComponent.power);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXPanoramaBlur;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
