/// <reference path="../FXObjectCodeDOMBuilder.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXGradientCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Controller> {
        constructor() {
            super("Gradient");
        }
        buildAddFXMethodArgs(call: core.code.MethodCallCodeDOM, fx: Phaser.Filters.Controller, args: IBuildObjectFactoryCodeDOMArgs): void {
            // Gradient — самостоятельный Game Object, а не Filter.
        }
        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {
            const obj = args.obj as FXGradient;
            const parent = args.parentVarName;
            const colorToRGBA = (value: string | number): string => {
                const color = colorValueToNumber(value, 0xffffff);
                return `[${((color >> 16) & 0xff) / 255}, ${((color >> 8) & 0xff) / 255}, ${(color & 0xff) / 255}, ${obj.alpha}]`;
            };
            const call = new core.code.MethodCallCodeDOM("gradient", `${args.sceneExpr}.add`);
            call.arg(`{ bands: [{ colorStart: ${colorToRGBA(obj.color1)}, colorEnd: ${colorToRGBA(obj.color2)}, size: ${obj.size > 0 ? obj.size : 1} }], start: { x: ${obj.fromX}, y: ${obj.fromY} }, shape: { x: ${obj.toX - obj.fromX}, y: ${obj.toY - obj.fromY} }, dither: true }`);
            if (parent) {
                call.arg(`${parent}.x ?? 0`);
                call.arg(`${parent}.y ?? 0`);
                call.arg(`${parent}.width ?? ${parent}.displayWidth ?? 128`);
                call.arg(`${parent}.height ?? ${parent}.displayHeight ?? 128`);
            } else {
                call.arg("0");
                call.arg("0");
                call.arg("128");
                call.arg("128");
            }
            return call;
        }
    }
}
