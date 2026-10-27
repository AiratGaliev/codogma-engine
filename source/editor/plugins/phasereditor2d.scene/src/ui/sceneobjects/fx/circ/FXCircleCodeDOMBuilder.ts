/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircleCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {

        constructor() {
            super("Circle");
        }

        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {
            // Параметры и дополнительные графические слои формируются при создании объекта сцены.
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {

            const obj = args.obj as FXCircle;
            const parent = args.parentVarName;
            const scale = Math.max(0.01, obj.scale);
            const call = new core.code.MethodCallCodeDOM("AddMaskShape", "Phaser.Actions");

            call.arg(parent);
            call.arg(`{ shape: "circle", aspectRatio: 1, useInternal: true, region: new Phaser.Geom.Rectangle((${parent}.width ?? ${parent}.displayWidth ?? 128) * (1 - ${scale}) / 2, (${parent}.height ?? ${parent}.displayHeight ?? 128) * (1 - ${scale}) / 2, (${parent}.width ?? ${parent}.displayWidth ?? 128) * ${scale}, (${parent}.height ?? ${parent}.displayHeight ?? 128) * ${scale}), blurRadius: ${Math.max(0, obj.feather * 128)}, blurSteps: 4, blurQuality: 1, scaleMode: 0, padding: 0 }`);

            return call;
        }
    }
}
