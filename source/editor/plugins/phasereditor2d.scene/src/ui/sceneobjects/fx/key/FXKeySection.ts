namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXKeySection extends SceneGameObjectSection<FXKey> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXKeySection", "Key Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyColorRow(comp, FXKeyComponent.color, false);

            this.createNumberProperty(comp, FXKeyComponent.threshold);

            this.createNumberProperty(comp, FXKeyComponent.feather);

            this.createPropertyBoolean(comp, FXKeyComponent.isolate);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXKey;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
