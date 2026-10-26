/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCombineColorMatrixComponent extends Component<FXCombineColorMatrix> {

        // In Phaser 4, the transfer texture is stored as a WebGL texture wrapper,
        // so the editor caches the texture key and applies it with setTexture().
        // Limitation: the color matrices (colorMatrixSelf / colorMatrixTransfer),
        // the additions / multiplications weights, and the setupAlphaTransfer()
        // preset are not exposed by the editor, they are managed in user code.
        static texture = FXProperty(FXTextureKeyProperty("texture", "", "Transfer Texture", "phaser:Phaser.Filters.CombineColorMatrix.setTexture",
            (fx: Phaser.Filters.CombineColorMatrix, key: string) => {

                if (key) {

                    fx.setTexture(key);
                }
            }));

        constructor(obj: FXCombineColorMatrix) {
            super(obj, [
                FXCombineColorMatrixComponent.texture
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            // The texture key is a constructor-only argument
            // (it is passed in the addCombineColorMatrix() call).
        }
    }
}
