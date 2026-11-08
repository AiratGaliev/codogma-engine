/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXBloomCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {
        constructor() {
            super("Bloom");
        }
        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {
            // Конфигурация формируется через публичный Action Phaser 4.
        }
        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {
            const obj = args.obj as FXBloom;
            const call = new core.code.MethodCallCodeDOM("AddEffectBloom", "Phaser.Actions");
            call.arg(args.parentVarName);
            call.arg(`{ threshold: ${obj.threshold}, blurRadius: ${Math.max(0, obj.blurRadius)}, blurSteps: ${Math.max(1, Math.round(obj.blurSteps))}, blurQuality: ${Math.max(0, Math.min(2, Math.round(obj.blurQuality)))}, blendAmount: ${Math.max(0, obj.blendAmount)}, useInternal: ${obj.isPreFX()} }`);
            return call;
        }
    }
}
