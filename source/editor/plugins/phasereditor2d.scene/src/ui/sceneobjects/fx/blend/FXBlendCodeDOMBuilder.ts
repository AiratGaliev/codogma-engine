namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXBlendCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Blend> {

        constructor() {
            super("Blend");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Blend): void {

            // Phaser 4 signature: addBlend(texture, blendMode, amount, color)
            const texture = FXGetTextureKey(fx, "texture", "");

            call.arg(texture ? JSON.stringify(texture) : "undefined");

            call.argFloat(fx.blendMode);
            call.argFloat(fx.amount);

            // The color is a normalized RGBA array. The editor stores an opaque
            // RGB color, the alpha channel is always 1.
            const rgba = FXColorToNormalizedArray(fx, "color", "#ffffff");

            call.arg(`[${rgba[0]}, ${rgba[1]}, ${rgba[2]}, 1]`);
        }
    }
}
