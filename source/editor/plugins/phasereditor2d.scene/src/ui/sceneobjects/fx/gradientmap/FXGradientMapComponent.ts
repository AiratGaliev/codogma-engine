/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientMapComponent extends Component<FXGradientMap> {

        // Limitation: the `ramp` (a Phaser.Display.ColorRamp), `color` and
        // `colorFactor` (normalized RGBA arrays) config options are not exposed
        // by the editor, they require a ColorRamp object model out of scope here.
        static alpha = FXProperty(SimpleProperty("alpha", 1, "Alpha", "phaser:Phaser.Filters.GradientMap.alpha", false, undefined, 0.01, 0, 1));
        static dither = FXProperty(SimpleProperty("dither", false, "Dither", "phaser:Phaser.Filters.GradientMap.dither"));
        static unpremultiply = FXProperty(SimpleProperty("unpremultiply", true, "Unpremultiply", "phaser:Phaser.Filters.GradientMap.unpremultiply"));

        constructor(obj: FXGradientMap) {
            super(obj, [
                FXGradientMapComponent.alpha,
                FXGradientMapComponent.dither,
                FXGradientMapComponent.unpremultiply
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXGradientMapComponent.alpha
                );

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXGradientMapComponent.dither,
                    FXGradientMapComponent.unpremultiply
                );
            }
        }
    }
}
