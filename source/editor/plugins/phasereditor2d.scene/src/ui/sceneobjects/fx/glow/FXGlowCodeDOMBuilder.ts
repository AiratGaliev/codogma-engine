namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXGlowCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Glow> {

        constructor() {
            super("Glow");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Glow): void {

            // Phaser 4 signature: addGlow(color, outerStrength, innerStrength, scale, knockout, quality, distance)
            call.argFloat(fx.color);
            call.argFloat(fx.outerStrength);
            call.argFloat(fx.innerStrength);
            call.argFloat(fx.scale);
            call.argBool(fx.knockout as any);

            // quality and distance are read-only in the Phaser 4 Glow filter:
            // they can only be passed to the constructor, never assigned.
            // The editor caches the values set in the Inspector, so the generated
            // code uses them (the editor preview requires re-creating the filter).
            call.argInt(FXGlowComponent.quality.getValue(fx as any) as number);
            call.argInt(FXGlowComponent.distance.getValue(fx as any) as number);
        }
    }
}