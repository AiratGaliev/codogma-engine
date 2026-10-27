/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXCircleCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {
        constructor() {
            super("Circle");
        }
        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {
            // Конфигурация формируется через Phaser.Actions.AddMaskShape.
        }
        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {
            const obj = args.obj as FXCircle;
            const call = new core.code.MethodCallCodeDOM("AddMaskShape", "Phaser.Actions");
            call.arg(args.parentVarName);
            const parent = args.parentVarName;
            call.arg(`{ shape: ${JSON.stringify(obj.shape)}, aspectRatio: ${obj.aspectRatio}, invert: ${obj.invert}, useInternal: true, region: new Phaser.Geom.Rectangle(0, 0, ${parent}.width ?? ${parent}.displayWidth ?? 128, ${parent}.height ?? ${parent}.displayHeight ?? 128), blurRadius: ${Math.max(0, obj.blurRadius)}, blurSteps: ${Math.max(1, Math.round(obj.blurSteps))}, blurQuality: ${Math.max(0, Math.min(2, Math.round(obj.blurQuality)))}, scaleMode: ${obj.scaleMode}, padding: ${Math.max(0, obj.padding)} }`);
            return call;
        }
    }
}
