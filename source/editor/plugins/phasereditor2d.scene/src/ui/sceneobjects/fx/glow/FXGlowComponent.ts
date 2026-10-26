/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGlowComponent extends Component<FXGlow> {

        static color = FXProperty(NumberColorProperty("color", "#ffffff", "Color", "phaser:Phaser.Filters.Glow.color"));
        static outerStrength = FXProperty(SimpleProperty("outerStrength", 4, "Outer Strength", "phaser:Phaser.Filters.Glow.outerStrength", false, undefined, 1, 0));
        static innerStrength = FXProperty(SimpleProperty("innerStrength", 0, "Inner Strength", "phaser:Phaser.Filters.Glow.innerStrength", false, undefined, 1, 0));
        static knockout = FXProperty(SimpleProperty("knockout", false, "Knockout", "phaser:Phaser.Filters.Glow.knockout"));

        // quality and distance cannot be changed after the filter is created
        // (they are read-only in Phaser.Filters.Glow). They are stored as custom
        // fields of the phaser FX object and passed to the `addGlow()` constructor
        // call by the code DOM builder. Changing them in the editor requires
        // re-creating the filter (e.g. reloading the scene) to see the result.
        static quality = FXProperty({
            ...SimpleProperty("quality", 10, "Quality", "phaser:Phaser.Filters.Glow.quality", false, undefined, 1, 1),
            getValue: (fx: Phaser.Filters.Glow) => fx["__editor_quality"] ?? fx.quality,
            setValue: (fx: Phaser.Filters.Glow, value: number) => {

                fx["__editor_quality"] = value;
            }
        });
        static distance = FXProperty({
            ...SimpleProperty("distance", 10, "Distance", "phaser:Phaser.Filters.Glow.distance", false, undefined, 1, 1),
            getValue: (fx: Phaser.Filters.Glow) => fx["__editor_distance"] ?? fx.distance,
            setValue: (fx: Phaser.Filters.Glow, value: number) => {

                fx["__editor_distance"] = value;
            }
        });

        constructor(obj: FXGlow) {
            super(obj, [
                FXGlowComponent.color,
                FXGlowComponent.outerStrength,
                FXGlowComponent.innerStrength,
                FXGlowComponent.knockout,
                FXGlowComponent.quality,
                FXGlowComponent.distance
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();

            const objES = obj.getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                NumberColorPropertyCodeDomAdapter
                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    NumberColorPropertyCodeDomAdapter2(FXGlowComponent.color),
                    FXGlowComponent.outerStrength,
                    FXGlowComponent.innerStrength,
                );

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXGlowComponent.knockout
                );

                // quality and distance are constructor-only arguments,
                // they are emitted by the code DOM builder, no assignments here.
            }
        }
    }
}