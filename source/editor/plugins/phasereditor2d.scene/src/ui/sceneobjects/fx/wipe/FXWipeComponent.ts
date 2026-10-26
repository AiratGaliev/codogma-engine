/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXWipeComponent extends Component<FXWipe> {

        // The progress of the wipe is not a parameter of addWipe():
        // it is driven at runtime (e.g. with a Tween). In the generated code
        // it is only emitted as a property assignment in nested prefab instances.
        static progress = FXProperty(SimpleProperty("progress", 0, "Progress", "phaser:Phaser.Filters.Wipe.progress", false, undefined, 0.01, 0, 1));

        static wipeWidth = FXProperty(SimpleProperty("wipeWidth", 0.1, "Wipe Width", "phaser:Phaser.Filters.Wipe.wipeWidth", false, undefined, 0.01, 0, 1));

        static direction = FXProperty(SimpleProperty("direction", 0, "Direction", "phaser:Phaser.Filters.Wipe.direction", false, undefined, 1, 0, 1));

        static axis = FXProperty(SimpleProperty("axis", 0, "Axis", "phaser:Phaser.Filters.Wipe.axis", false, undefined, 1, 0, 1));

        // In Phaser 4, Wipe.reveal is a number (0 = wipe, 1 = reveal),
        // the editor exposes it as a boolean.
        static reveal = FXProperty({
            ...SimpleProperty("reveal", false, "Reveal", "phaser:Phaser.Filters.Wipe.reveal"),
            getValue: (fx: Phaser.Filters.Wipe) => fx.reveal > 0,
            setValue: (fx: Phaser.Filters.Wipe, value: boolean) => {

                fx.reveal = value ? 1 : 0;
            }
        });

        // In Phaser 4, Wipe.wipeTexture is a Texture object,
        // so the editor caches the texture key and applies it with setTexture().
        static wipeTexture = FXProperty(FXTextureKeyProperty("wipeTexture", "", "Wipe Texture", "phaser:Phaser.Filters.Wipe.setTexture",
            (fx: Phaser.Filters.Wipe, key: string) => {

                if (key) {

                    fx.setTexture(key);
                }
            }));

        constructor(obj: FXWipe) {
            super(obj, [
                FXWipeComponent.progress,
                FXWipeComponent.wipeWidth,
                FXWipeComponent.direction,
                FXWipeComponent.axis,
                FXWipeComponent.reveal,
                FXWipeComponent.wipeTexture
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // The wipe texture key is a constructor-only argument
                // (it is passed in the addWipe() call).

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXWipeComponent.progress,
                    FXWipeComponent.wipeWidth,
                    FXWipeComponent.direction,
                    FXWipeComponent.axis
                );

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXWipeComponent.reveal
                );
            }
        }
    }
}
