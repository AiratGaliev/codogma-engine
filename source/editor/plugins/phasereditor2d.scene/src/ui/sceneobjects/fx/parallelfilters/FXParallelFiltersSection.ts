namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXParallelFiltersSection extends SceneGameObjectSection<FXParallelFilters> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXParallelFiltersSection", "Parallel Filters", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 3);

            const label = this.createLabel(comp,
                "The filters of the top and bottom lists, and the blend configuration, are set in user code (filter.top, filter.bottom, filter.blend).",
                "The Parallel Filters controller splits the input into two filter lists and blends the results.");

            label.style.gridColumn = "1 / span 3";
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXParallelFilters;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
