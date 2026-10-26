namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXNormalToolsSection extends SceneGameObjectSection<FXNormalTools> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXNormalToolsSection", "Normal Tools Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createNumberProperty(comp, FXNormalToolsComponent.rotation);

            this.createNumberProperty(comp, FXNormalToolsComponent.facingPower);

            this.createPropertyBoolean(comp, FXNormalToolsComponent.outputRatio);

            this.createNumberProperty(comp, FXNormalToolsComponent.ratioRadius);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXNormalTools;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
