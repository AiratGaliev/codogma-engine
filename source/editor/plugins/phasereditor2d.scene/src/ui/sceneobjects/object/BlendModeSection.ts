/// <reference path="./properties/SceneGameObjectSection.ts" />
/// <reference path="./BlendModeComponent.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class BlendModeSection extends SceneGameObjectSection<ISceneGameObject> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.BlendModeSection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, BlendModeSection.SECTION_ID, "Blend Mode", false, false);
        }

        getSectionHelpPath() {

            return "";
        }

        createForm(parent: HTMLDivElement) {

            // attach the component dynamically to the selected objects

            for (const obj of this.getSelection()) {

                const objES = obj.getEditorSupport();

                if (objES && !objES.hasComponent(BlendModeComponent)) {

                    objES.addComponent(new BlendModeComponent(obj));
                }
            }

            const comp = this.createGridElementWithPropertiesXY(parent);

            this.createPropertyEnumRow(comp, BlendModeComponent.blendMode)
                .style.gridColumn = "3 / span 4";
        }

        canEdit(obj: any, n: number): boolean {

            return isGameObject(obj) && (obj as any).blendMode !== undefined;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
