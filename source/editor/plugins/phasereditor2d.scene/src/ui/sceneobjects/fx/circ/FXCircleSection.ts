namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FXCircleSection extends SceneGameObjectSection<FXCircle> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXCircleSection", "Circle Mask", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyStringRow(comp, FXCircleComponent.shape);
            this.createNumberProperty(comp, FXCircleComponent.aspectRatio);
            this.createPropertyBoolean(comp, FXCircleComponent.invert);
            this.createNumberProperty(comp, FXCircleComponent.blurRadius);
            this.createNumberProperty(comp, FXCircleComponent.blurSteps);
            this.createNumberProperty(comp, FXCircleComponent.blurQuality);
            this.createNumberProperty(comp, FXCircleComponent.scaleMode);
            this.createNumberProperty(comp, FXCircleComponent.padding);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof FXCircle;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}
