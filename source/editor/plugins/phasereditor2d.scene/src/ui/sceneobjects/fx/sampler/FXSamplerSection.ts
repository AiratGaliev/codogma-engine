namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXSamplerSection extends SceneGameObjectSection<FXSampler> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXSamplerSection", "Sampler Filter", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            const label = this.createLabel(comp,
                "The callback is set in user code (filter.callback).",
                "The Sampler filter reads pixel data and passes it to a callback. The editor uses a no-op placeholder callback.");

            label.style.gridColumn = "1 / span 3";

            this.createNumberProperty(comp, FXSamplerComponent.regionX);

            this.createNumberProperty(comp, FXSamplerComponent.regionY);

            this.createNumberProperty(comp, FXSamplerComponent.regionWidth);

            this.createNumberProperty(comp, FXSamplerComponent.regionHeight);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXSampler;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
