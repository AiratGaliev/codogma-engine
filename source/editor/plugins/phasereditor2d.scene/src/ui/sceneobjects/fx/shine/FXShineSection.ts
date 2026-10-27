namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FXShineSection extends SceneGameObjectSection<FXShine> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXShineSection", "Shine", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXShineComponent.radius);
            this.createNumberProperty(comp, FXShineComponent.direction);
            this.createNumberProperty(comp, FXShineComponent.scale);
            this.createNumberProperty(comp, FXShineComponent.duration);
            this.createPropertyBoolean(comp, FXShineComponent.reveal);
            this.createPropertyBoolean(comp, FXShineComponent.yoyo);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof FXShine;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}
