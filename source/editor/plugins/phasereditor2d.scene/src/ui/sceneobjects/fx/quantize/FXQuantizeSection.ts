namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXQuantizeSection extends SceneGameObjectSection<FXQuantize> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXQuantizeSection", "Quantize Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXQuantizeComponent.steps);

            this.createNumberProperty(comp, FXQuantizeComponent.gamma);

            this.createPropertyEnumRow(comp, FXQuantizeComponent.mode);

            this.createPropertyBoolean(comp, FXQuantizeComponent.dither);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXQuantize;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
