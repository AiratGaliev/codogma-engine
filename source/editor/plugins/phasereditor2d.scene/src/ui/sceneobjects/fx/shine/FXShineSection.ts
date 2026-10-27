namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FXShineSection extends SceneGameObjectSection<FXShine> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXShineSection", "Shine", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXShineComponent.speed);
            this.createNumberProperty(comp, FXShineComponent.lineWidth);
            this.createNumberProperty(comp, FXShineComponent.gradient);
            this.createNumberProperty(comp, FXShineComponent.reveal);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof FXShine;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}