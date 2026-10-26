/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlendComponent extends Component<FXBlend> {

        // In Phaser 4, Blend.texture is a WebGL texture wrapper,
        // so the editor caches the texture key and applies it with setTexture().
        static texture = FXProperty(FXTextureKeyProperty("texture", "", "Texture", "phaser:Phaser.Filters.Blend.setTexture",
            (fx: Phaser.Filters.Blend, key: string) => {

                if (key) {

                    fx.setTexture(key);
                }
            }));

        // blendMode is a Phaser.BlendModes value.
        static blendMode = FXProperty(SimpleProperty("blendMode", Phaser.BlendModes.NORMAL, "Blend Mode", "phaser:Phaser.Filters.Blend.blendMode", false, undefined, 1));

        static amount = FXProperty(SimpleProperty("amount", 1, "Amount", "phaser:Phaser.Filters.Blend.amount", false, undefined, 0.01));

        // In Phaser 4, Blend.color is a normalized RGBA array,
        // so the editor stores a hex string and applies it to the channels.
        static color = FXProperty(FXColorProperty("color", "#ffffff", "Color", "phaser:Phaser.Filters.Blend.color",
            (fx: Phaser.Filters.Blend, hex: string) => {

                const rgba = colibri.ui.controls.Colors.parseColor(hex);

                fx.color[0] = rgba.r / 255;
                fx.color[1] = rgba.g / 255;
                fx.color[2] = rgba.b / 255;
                fx.color[3] = 1;
            }));

        constructor(obj: FXBlend) {
            super(obj, [
                FXBlendComponent.texture,
                FXBlendComponent.blendMode,
                FXBlendComponent.amount,
                FXBlendComponent.color
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // The texture key is a constructor-only argument
                // (it is passed in the addBlend() call).

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXBlendComponent.blendMode,
                    FXBlendComponent.amount
                );
            }
        }
    }
}
