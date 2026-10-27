/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXShineComponent extends Component<FXShine> {
        static radius = FXProperty(SimpleProperty("radius", 0.5, "Radius", "phaser:Phaser.Types.Actions.AddEffectShineConfig.radius", false, undefined, 0.01, 0.01));
        static direction = FXProperty(SimpleProperty("direction", 0.5, "Direction (radians)", "phaser:Phaser.Types.Actions.AddEffectShineConfig.direction", false, undefined, 0.01));
        static scale = FXProperty(SimpleProperty("scale", 2, "Travel Scale", "phaser:Phaser.Types.Actions.AddEffectShineConfig.scale", false, undefined, 0.1, 0.1));
        static duration = FXProperty(SimpleProperty("duration", 2000, "Duration (ms)", "phaser:Phaser.Types.Actions.AddEffectShineConfig.duration", false, undefined, 100, 1));
        static reveal = FXProperty(SimpleProperty("reveal", false, "Reveal", "phaser:Phaser.Types.Actions.AddEffectShineConfig.reveal"));
        static yoyo = FXProperty(SimpleProperty("yoyo", false, "Yoyo", "phaser:Phaser.Types.Actions.AddEffectShineConfig.yoyo"));

        constructor(obj: FXShine) {
            super(obj, [
                FXShineComponent.radius,
                FXShineComponent.direction,
                FXShineComponent.scale,
                FXShineComponent.duration,
                FXShineComponent.reveal,
                FXShineComponent.yoyo
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {
            // Параметры передаются в Phaser.Actions.AddEffectShine при создании эффекта.
        }
    }
}
