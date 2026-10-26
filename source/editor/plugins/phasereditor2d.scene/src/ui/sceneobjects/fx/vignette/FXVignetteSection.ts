namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXVignetteSection extends SceneGameObjectSection<FXVignette> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXVignetteSection", "Vignette Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            this.createPropertyColorRow(comp, FXVignetteComponent.color, false);

            this.createNumberProperty(comp, FXVignetteComponent.x);

            this.createNumberProperty(comp, FXVignetteComponent.y);

            this.createNumberProperty(comp, FXVignetteComponent.radius);

            this.createNumberProperty(comp, FXVignetteComponent.strength);

            this.createNumberProperty(comp, FXVignetteComponent.blendMode);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXVignette;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
