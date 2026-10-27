/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXShineCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {
        constructor() {
            super("Shine");
        }
        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {
            // Конфигурация формируется через публичный Action Phaser 4.
        }
        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {
            const obj = args.obj as FXShine;
            const call = new core.code.MethodCallCodeDOM("AddEffectShine", "Phaser.Actions");
            call.arg(args.parentVarName);
            call.arg(`{ radius: ${Math.max(0.01, obj.radius)}, direction: ${obj.direction}, scale: ${Math.max(0.1, obj.scale)}, duration: ${Math.max(1, obj.duration)}, reveal: ${obj.reveal}, yoyo: ${obj.yoyo}, useExternal: ${!obj.isPreFX()} }`);
            return call;
        }
    }
}
