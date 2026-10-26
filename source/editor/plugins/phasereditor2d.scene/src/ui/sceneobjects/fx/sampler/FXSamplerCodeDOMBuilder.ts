namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXSamplerCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Sampler> {

        constructor() {
            super("Sampler");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Sampler): void {

            // Phaser 4 signature: addSampler(callback, region)
            // Limitations: the editor cannot provide the user callback, a no-op
            // placeholder is emitted (user code should assign `filter.callback`).
            // The `region` is not emitted either, it should be set in user code.
            call.arg("() => { /* TODO: set the sampler callback */ }");
        }
    }
}
