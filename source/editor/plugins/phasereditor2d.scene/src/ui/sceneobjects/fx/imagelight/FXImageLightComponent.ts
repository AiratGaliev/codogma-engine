/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXImageLightComponent extends Component<FXImageLight> {

        // In Phaser 4, the ImageLight textures are read from the config object
        // (config keys: environmentMap / normalMap) and stored internally as
        // WebGL texture wrappers, so the editor caches the keys and applies
        // them with setEnvironmentMap() / setNormalMap().
        static environmentTexture = FXProperty(FXTextureKeyProperty("environmentTexture", "", "Environment Texture", "phaser:Phaser.Filters.ImageLight.setEnvironmentMap",
            (fx: Phaser.Filters.ImageLight, key: string) => {

                if (key) {

                    fx.setEnvironmentMap(key);
                }
            }));
        static normalTexture = FXProperty(FXTextureKeyProperty("normalTexture", "", "Normal Texture", "phaser:Phaser.Filters.ImageLight.setNormalMap",
            (fx: Phaser.Filters.ImageLight, key: string) => {

                if (key) {

                    fx.setNormalMap(key);
                }
            }));

        static modelRotation = FXProperty(SimpleProperty("modelRotation", 0, "Model Rotation", "phaser:Phaser.Filters.ImageLight.modelRotation", false, undefined, 0.01));
        static bulge = FXProperty(SimpleProperty("bulge", 0, "Bulge", "phaser:Phaser.Filters.ImageLight.bulge", false, undefined, 0.01));

        constructor(obj: FXImageLight) {
            super(obj, [
                FXImageLightComponent.environmentTexture,
                FXImageLightComponent.normalTexture,
                FXImageLightComponent.modelRotation,
                FXImageLightComponent.bulge
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXImageLightComponent.modelRotation,
                    FXImageLightComponent.bulge
                );

                // The texture keys are constructor-only arguments
                // (they are passed in the addImageLight() config object).
            }
        }
    }
}
