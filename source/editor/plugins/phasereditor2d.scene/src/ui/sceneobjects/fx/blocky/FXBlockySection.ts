namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlockySection extends SceneGameObjectSection<FXBlocky> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXBlockySection", "Blocky Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXBlockyComponent.sizeX);

            this.createNumberProperty(comp, FXBlockyComponent.sizeY);

            this.createNumberProperty(comp, FXBlockyComponent.offsetX);

            this.createNumberProperty(comp, FXBlockyComponent.offsetY);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXBlocky;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
