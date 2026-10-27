/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBloomCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {

        constructor() {
            super("Bloom");
        }

        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {

            const obj = args.obj as FXBloom;

            const color = parseInt(obj.color.replace("#", ""), 16);
            const offsetX = obj.offsetX;
            const offsetY = obj.offsetY;
            const blurStrength = obj.blurStrength;
            const strength = obj.strength;
            const steps = obj.steps;

            call.argFloat(color);
            call.argFloat(offsetX);
            call.argFloat(offsetY);
            call.argFloat(blurStrength);
            call.argFloat(strength);
            call.argFloat(steps);
        }
    }
}