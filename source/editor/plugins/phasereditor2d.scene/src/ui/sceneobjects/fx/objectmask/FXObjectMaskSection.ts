namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXObjectMaskSection extends SceneGameObjectSection<FXObjectMask> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXObjectMaskSection", "Object Mask Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyBoolean(comp, FXObjectMaskComponent.invert);

            this.createPropertyBoolean(comp, FXObjectMaskComponent.autoUpdate);

            this.createNumberProperty(comp, FXObjectMaskComponent.scaleFactor);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXObjectMask;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
