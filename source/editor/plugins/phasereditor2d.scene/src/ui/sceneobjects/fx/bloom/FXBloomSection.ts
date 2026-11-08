namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FXBloomSection extends SceneGameObjectSection<FXBloom> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXBloomSection", "Bloom", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXBloomComponent.threshold);
            this.createNumberProperty(comp, FXBloomComponent.blurRadius);
            this.createNumberProperty(comp, FXBloomComponent.blurSteps);
            this.createNumberProperty(comp, FXBloomComponent.blurQuality);
            this.createNumberProperty(comp, FXBloomComponent.blendAmount);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof FXBloom;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}
