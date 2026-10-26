namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXThresholdSection extends SceneGameObjectSection<FXThreshold> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXThresholdSection", "Threshold Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXThresholdComponent.edge1);

            this.createNumberProperty(comp, FXThresholdComponent.edge2);

            this.createPropertyBoolean(comp, FXThresholdComponent.invert);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXThreshold;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
