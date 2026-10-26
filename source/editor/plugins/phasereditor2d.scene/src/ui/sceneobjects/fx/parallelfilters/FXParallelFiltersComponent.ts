/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXParallelFiltersComponent extends Component<FXParallelFilters> {

        // Limitation: the ParallelFilters controller has no simple properties.
        // The `top` and `bottom` FilterLists and the `blend` Blend controller
        // are managed in user code (e.g. `filter.top.addBlur()`,
        // `filter.blend.blendMode = Phaser.BlendModes.ADD`).

        constructor(obj: FXParallelFilters) {
            super(obj, []);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {
            // Nothing to generate: the top/bottom filter lists and the blend
            // controller are runtime-managed (see the limitation above).
        }
    }
}
