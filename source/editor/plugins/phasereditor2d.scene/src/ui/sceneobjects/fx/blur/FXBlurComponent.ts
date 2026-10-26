/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlurComponent extends Component<FXBlur> {

        static quality = FXProperty(SimpleProperty("quality", 0, "Quality", "phaser:Phaser.Filters.Blur.quality", false, undefined, 1, 0, 2));
        static x = FXProperty(SimpleProperty("x", 2, "X", "phaser:Phaser.Filters.Blur.x", false, undefined, 0.1));
        static y = FXProperty(SimpleProperty("y", 2, "Y", "phaser:Phaser.Filters.Blur.y", false, undefined, 0.1));
        static strength = FXProperty(SimpleProperty("strength", 1, "Strength", "phaser:Phaser.Filters.Blur.strength", false, undefined, 0.01, 0));
        static color = FXProperty(NumberColorProperty("color", "#ffffff", "Color", "phaser:Phaser.Filters.Blur.color"));
        static steps = FXProperty(SimpleProperty("steps", 4, "Steps", "phaser:Phaser.Filters.Blur.steps", false, undefined, 1, 1));

        constructor(obj: FXBlur) {
            super(obj, [
                FXBlurComponent.quality,
                FXBlurComponent.x,
                FXBlurComponent.y,
                FXBlurComponent.strength,
                FXBlurComponent.color,
                FXBlurComponent.steps
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXBlurComponent.quality,
                    FXBlurComponent.x,
                    FXBlurComponent.y,
                    FXBlurComponent.strength,
                    NumberColorPropertyCodeDomAdapter2(FXBlurComponent.color),
                    FXBlurComponent.steps
                );
            }
        }
    }
}
