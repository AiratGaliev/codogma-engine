namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBokehSection extends SceneGameObjectSection<FXBokeh> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXBokehSection", "Bokeh Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXBokehComponent.radius);

            this.createNumberProperty(comp, FXBokehComponent.amount);

            this.createNumberProperty(comp, FXBokehComponent.contrast);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXBokeh;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
