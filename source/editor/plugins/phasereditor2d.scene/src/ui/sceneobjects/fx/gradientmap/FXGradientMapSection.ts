namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientMapSection extends SceneGameObjectSection<FXGradientMap> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXGradientMapSection", "Gradient Map Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXGradientMapComponent.alpha);

            this.createPropertyBoolean(comp, FXGradientMapComponent.dither);

            this.createPropertyBoolean(comp, FXGradientMapComponent.unpremultiply);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXGradientMap;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
