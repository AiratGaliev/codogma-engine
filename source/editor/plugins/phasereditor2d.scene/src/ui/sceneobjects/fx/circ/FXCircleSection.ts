namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FXCircleSection extends SceneGameObjectSection<FXCircle> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXCircleSection", "Circle", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXCircleComponent.thickness);
            this.createPropertyColorRow(comp, FXCircleComponent.color, false);
            this.createPropertyColorRow(comp, FXCircleComponent.backgroundColor, false);
            this.createNumberProperty(comp, FXCircleComponent.scale);
            this.createNumberProperty(comp, FXCircleComponent.feather);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof FXCircle;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}