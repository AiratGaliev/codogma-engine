/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircleCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {

        constructor() {
            super("Circle");
        }

        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {

            const obj = args.obj as FXCircle;

            const thickness = obj.thickness;
            const color = parseInt(obj.color.replace("#", ""), 16);
            const backgroundColor = parseInt(obj.backgroundColor.replace("#", ""), 16);
            const scale = obj.scale;
            const feather = obj.feather;

            call.argFloat(thickness);
            call.argFloat(color);
            call.argFloat(backgroundColor);
            call.argFloat(scale);
            call.argFloat(feather);
        }
    }
}