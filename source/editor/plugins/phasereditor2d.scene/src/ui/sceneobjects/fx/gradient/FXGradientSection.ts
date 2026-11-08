namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FXGradientSection extends SceneGameObjectSection<FXGradient> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXGradientSection", "Gradient", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyColorRow(comp, FXGradientComponent.color1, false);
            this.createPropertyColorRow(comp, FXGradientComponent.color2, false);
            this.createNumberProperty(comp, FXGradientComponent.alpha);
            this.createNumberProperty(comp, FXGradientComponent.fromX);
            this.createNumberProperty(comp, FXGradientComponent.fromY);
            this.createNumberProperty(comp, FXGradientComponent.toX);
            this.createNumberProperty(comp, FXGradientComponent.toY);
            this.createNumberProperty(comp, FXGradientComponent.size);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof FXGradient;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}