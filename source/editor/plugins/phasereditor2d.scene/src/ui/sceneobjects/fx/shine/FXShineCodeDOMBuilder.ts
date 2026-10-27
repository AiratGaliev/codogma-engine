/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXShineCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {

        constructor() {
            super("Shine");
        }

        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {

            const obj = args.obj as FXShine;

            const speed = obj.speed;
            const lineWidth = obj.lineWidth;
            const gradient = obj.gradient;
            const reveal = obj.reveal;

            call.argFloat(speed);
            call.argFloat(lineWidth);
            call.argFloat(gradient);
            call.argFloat(reveal ? 1 : 0);
        }
    }
}