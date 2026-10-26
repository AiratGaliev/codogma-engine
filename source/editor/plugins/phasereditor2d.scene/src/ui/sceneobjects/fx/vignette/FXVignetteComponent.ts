/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXVignetteComponent extends Component<FXVignette> {

        // In Phaser 4, Vignette.color is a Phaser.Display.Color object,
        // so the editor stores a hex string and applies it with setColor().
        static color = FXProperty(FXColorProperty("color", "#000000", "Color", "phaser:Phaser.Filters.Vignette.color",
            (fx: Phaser.Filters.Vignette, hex: string) => fx.setColor(hex)));

        static x = FXProperty(SimpleProperty("x", 0.5, "X", "phaser:Phaser.Filters.Vignette.x", false, undefined, 0.01, 0, 1));
        static y = FXProperty(SimpleProperty("y", 0.5, "Y", "phaser:Phaser.Filters.Vignette.y", false, undefined, 0.01, 0, 1));
        static radius = FXProperty(SimpleProperty("radius", 0.5, "Radius", "phaser:Phaser.Filters.Vignette.radius", false, undefined, 0.01, 0, 1));
        static strength = FXProperty(SimpleProperty("strength", 0.5, "Strength", "phaser:Phaser.Filters.Vignette.strength", false, undefined, 0.01, 0));

        // Only NORMAL, ADD, MULTIPLY, and SCREEN blend modes are supported.
        static blendMode = FXProperty(SimpleProperty("blendMode", Phaser.BlendModes.NORMAL, "Blend Mode", "phaser:Phaser.Filters.Vignette.blendMode", false, undefined, 1));

        constructor(obj: FXVignette) {
            super(obj, [
                FXVignetteComponent.color,
                FXVignetteComponent.x,
                FXVignetteComponent.y,
                FXVignetteComponent.radius,
                FXVignetteComponent.strength,
                FXVignetteComponent.blendMode
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXVignetteComponent.x,
                    FXVignetteComponent.y,
                    FXVignetteComponent.radius,
                    FXVignetteComponent.strength,
                    FXVignetteComponent.blendMode
                );
            }
        }
    }
}
