namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class RectangleSection extends SceneGameObjectSection<Rectangle> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.RectangleSection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, RectangleSection.SECTION_ID, "Rectangle", false, false);
        }

        getSectionHelpPath() {

            return "scene-editor/shape-object.html";
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElementWithPropertiesXY(parent);

            // rounded

            this.createPropertyBoolean(comp, RectangleComponent.rounded)
                .checkElement.style.gridColumn = "3 / span 4";

            // roundedRadius

            this.createPropertyFloatRow(comp, RectangleComponent.roundedRadius)
                .style.gridColumn = "3 / span 4";
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof Rectangle;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
