namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXParallelFiltersCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.ParallelFilters> {

        constructor() {
            super("ParallelFilters");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.ParallelFilters): void {

            // Phaser 4 signature: addParallelFilters()
            // Limitation: the filters of the `top` and `bottom` lists and the
            // `blend` controller are runtime-managed, nothing is emitted here.
        }
    }
}
