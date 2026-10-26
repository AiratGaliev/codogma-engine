/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXDisplacementComponent extends Component<FXDisplacement> {

        // In Phaser 4, Displacement.texture is a WebGL texture wrapper,
        // so the editor caches the texture key and applies it with setTexture().
        // Only whole textures are supported (no atlas or sprite sheet frames).
        static texture = FXProperty(FXTextureKeyProperty("texture", "", "Texture", "phaser:Phaser.Filters.Displacement.setTexture",
            (fx: Phaser.Filters.Displacement, key: string) => {

                if (key) {

                    fx.setTexture(key);
                }
            }));

        static x = FXProperty(SimpleProperty("x", 0.005, "X", "phaser:Phaser.Filters.Displacement.x", false, undefined, 0.001));
        static y = FXProperty(SimpleProperty("y", 0.005, "Y", "phaser:Phaser.Filters.Displacement.y", false, undefined, 0.001));

        constructor(obj: FXDisplacement) {
            super(obj, [
                FXDisplacementComponent.texture,
                FXDisplacementComponent.x,
                FXDisplacementComponent.y
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // The texture key is a constructor-only argument
                // (it is passed in the addDisplacement() call).

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXDisplacementComponent.x,
                    FXDisplacementComponent.y
                );
            }
        }
    }
}
