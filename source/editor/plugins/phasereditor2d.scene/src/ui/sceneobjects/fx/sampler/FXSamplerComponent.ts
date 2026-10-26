/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXSamplerComponent extends Component<FXSampler> {

        // Limitation: the callback of the Sampler is not exposed by the editor,
        // a no-op placeholder is used (see FXSampler). In the generated code the
        // callback is a no-op too, user code should assign `filter.callback`.
        //
        // The region is stored as a plain object ({x, y, width, height}) in the
        // custom field `__editor_region` of the phaser filter, and applied to
        // `filter.region` (a point object samples a pixel, a rectangle samples
        // an area, null samples the whole view). Because `region` is not a
        // primitive value, it is not emitted as code, only the filter creation
        // is generated.

        static getRegion(fx: any): { x: number, y: number, width: number, height: number } {

            let region = fx["__editor_region"];

            if (!region) {

                region = { x: 0, y: 0, width: 0, height: 0 };

                fx["__editor_region"] = region;
            }

            return region;
        }

        static applyRegion(fx: any) {

            const region = FXSamplerComponent.getRegion(fx);

            if (region.width > 0 && region.height > 0) {

                fx.region = { x: region.x, y: region.y, width: region.width, height: region.height };

            } else if (region.x !== 0 || region.y !== 0) {

                // a point (an object with x and y but no width) samples a pixel.
                fx.region = { x: region.x, y: region.y };

            } else {

                fx.region = null;
            }
        }

        static regionX = FXProperty({
            ...SimpleProperty("regionX", 0, "Region X", "phaser:Phaser.Filters.Sampler.region", false, undefined, 1),
            getValue: (fx: Phaser.Filters.Sampler) => FXSamplerComponent.getRegion(fx).x,
            setValue: (fx: Phaser.Filters.Sampler, value: number) => {

                FXSamplerComponent.getRegion(fx).x = value;

                FXSamplerComponent.applyRegion(fx);
            }
        });

        static regionY = FXProperty({
            ...SimpleProperty("regionY", 0, "Region Y", "phaser:Phaser.Filters.Sampler.region", false, undefined, 1),
            getValue: (fx: Phaser.Filters.Sampler) => FXSamplerComponent.getRegion(fx).y,
            setValue: (fx: Phaser.Filters.Sampler, value: number) => {

                FXSamplerComponent.getRegion(fx).y = value;

                FXSamplerComponent.applyRegion(fx);
            }
        });

        static regionWidth = FXProperty({
            ...SimpleProperty("regionWidth", 0, "Region Width", "phaser:Phaser.Filters.Sampler.region", false, undefined, 1),
            getValue: (fx: Phaser.Filters.Sampler) => FXSamplerComponent.getRegion(fx).width,
            setValue: (fx: Phaser.Filters.Sampler, value: number) => {

                FXSamplerComponent.getRegion(fx).width = value;

                FXSamplerComponent.applyRegion(fx);
            }
        });

        static regionHeight = FXProperty({
            ...SimpleProperty("regionHeight", 0, "Region Height", "phaser:Phaser.Filters.Sampler.region", false, undefined, 1),
            getValue: (fx: Phaser.Filters.Sampler) => FXSamplerComponent.getRegion(fx).height,
            setValue: (fx: Phaser.Filters.Sampler, value: number) => {

                FXSamplerComponent.getRegion(fx).height = value;

                FXSamplerComponent.applyRegion(fx);
            }
        });

        constructor(obj: FXSampler) {
            super(obj, [
                FXSamplerComponent.regionX,
                FXSamplerComponent.regionY,
                FXSamplerComponent.regionWidth,
                FXSamplerComponent.regionHeight
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            // Nothing to generate: the callback and the region are not
            // code-generated (see the limitations above).
        }
    }
}
