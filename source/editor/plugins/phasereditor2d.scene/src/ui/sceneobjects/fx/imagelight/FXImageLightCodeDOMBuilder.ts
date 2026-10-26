namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXImageLightCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.ImageLight> {

        constructor() {
            super("ImageLight");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.ImageLight): void {

            // Phaser 4 signature: addImageLight(config)
            // The config keys are environmentMap / normalMap / modelRotation / bulge.
            const keys: string[] = [];

            const environment = FXGetTextureKey(fx, "environmentTexture", "");

            if (environment) {

                keys.push(`environmentMap: ${JSON.stringify(environment)}`);
            }

            const normal = FXGetTextureKey(fx, "normalTexture", "");

            if (normal) {

                keys.push(`normalMap: ${JSON.stringify(normal)}`);
            }

            if (fx.modelRotation !== 0) {

                keys.push(`modelRotation: ${fx.modelRotation}`);
            }

            if (fx.bulge !== 0) {

                keys.push(`bulge: ${fx.bulge}`);
            }

            if (keys.length > 0) {

                call.arg(`{ ${keys.join(", ")} }`);
            }
        }
    }
}
