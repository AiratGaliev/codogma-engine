/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXTextureMaskComponent extends Component<FXTextureMask> {

        // In Phaser 4, Mask.glTexture is a WebGL texture wrapper,
        // so the editor caches the texture key and applies it with setTexture().
        // A texture mask is static: it does not update between frames.
        static texture = FXProperty(FXTextureKeyProperty("texture", "", "Mask Texture", "phaser:Phaser.Filters.Mask.setTexture",
            (fx: Phaser.Filters.Mask, key: string) => {

                if (key) {

                    fx.setTexture(key);
                }
            }));

        static invert = FXProperty(SimpleProperty("invert", false, "Invert", "phaser:Phaser.Filters.Mask.invert"));

        static scaleFactor = FXProperty(SimpleProperty("scaleFactor", 1, "Scale Factor", "phaser:Phaser.Filters.Mask.scaleFactor", false, undefined, 0.01));

        constructor(obj: FXTextureMask) {
            super(obj, [
                FXTextureMaskComponent.texture,
                FXTextureMaskComponent.invert,
                FXTextureMaskComponent.scaleFactor
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // The texture key is a constructor-only argument
                // (it is passed in the addMask() call).

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXTextureMaskComponent.invert
                );

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXTextureMaskComponent.scaleFactor
                );
            }
        }
    }
}
