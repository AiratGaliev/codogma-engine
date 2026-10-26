namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXTextureMaskSection extends SceneGameObjectSection<FXTextureMask> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXTextureMaskSection", "Texture Mask Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyStringRow(comp, FXTextureMaskComponent.texture);

            this.createPropertyBoolean(comp, FXTextureMaskComponent.invert);

            this.createNumberProperty(comp, FXTextureMaskComponent.scaleFactor);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXTextureMask;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
