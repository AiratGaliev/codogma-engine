namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXWipeSection extends SceneGameObjectSection<FXWipe> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXWipeSection", "Wipe Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXWipeComponent.progress);

            this.createNumberProperty(comp, FXWipeComponent.wipeWidth);

            this.createNumberProperty(comp, FXWipeComponent.direction);

            this.createNumberProperty(comp, FXWipeComponent.axis);

            this.createPropertyBoolean(comp, FXWipeComponent.reveal);

            this.createPropertyStringRow(comp, FXWipeComponent.wipeTexture);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXWipe;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
