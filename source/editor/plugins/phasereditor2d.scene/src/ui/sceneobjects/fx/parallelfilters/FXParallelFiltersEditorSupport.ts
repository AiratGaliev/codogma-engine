/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXParallelFiltersEditorSupport extends FXObjectEditorSupport<FXParallelFilters> {

        constructor(obj: FXParallelFilters, scene: Scene) {
            super(FXParallelFiltersExtension.getInstance(), obj, scene);

            this.addComponent(new FXParallelFiltersComponent(obj));
        }
    }
}
