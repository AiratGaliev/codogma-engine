namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBarrelSection extends SceneGameObjectSection<FXBarrel> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXBarrelSection", "Barrel Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXBarrelComponent.amount);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXBarrel;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
