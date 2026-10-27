/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {

        constructor() {
            super("Gradient");
        }

        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {

            const obj = args.obj as FXGradient;

            const color1 = parseInt(obj.color1.replace("#", ""), 16);
            const color2 = parseInt(obj.color2.replace("#", ""), 16);
            const alpha = obj.alpha;
            const fromX = obj.fromX;
            const fromY = obj.fromY;
            const toX = obj.toX;
            const toY = obj.toY;
            const size = obj.size;

            call.argFloat(color1);
            call.argFloat(color2);
            call.argFloat(alpha);
            call.argFloat(fromX);
            call.argFloat(fromY);
            call.argFloat(toX);
            call.argFloat(toY);
            call.argFloat(size);
        }
    }
}