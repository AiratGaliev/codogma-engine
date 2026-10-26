/// <reference path="./SceneSection.ts" />

namespace phasereditor2d.scene.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class Box2DSection extends SceneSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.editor.properties.Box2DSection",
                "Box2D Physics", false, true);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);

            comp.style.gridTemplateColumns = "auto 1fr";

            this.createBooleanField(comp, "box2dEnabled",

                this.createLabel(comp, "Enable Box2D",
                    "Enable the Box2D physics world in this scene. The compiler emits the creation of the world in the scene's create method."));

            this.createFloatField(comp, "box2dGravityX", "Gravity X",
                "The horizontal gravity of the Box2D world.");

            this.createFloatField(comp, "box2dGravityY", "Gravity Y",
                "The vertical gravity of the Box2D world. Use a positive value for a top-down-to-bottom gravity.");

            this.createBooleanField(comp, "box2dAllowSleep",

                this.createLabel(comp, "Allow Sleep",
                    "If enabled, the bodies are allowed to sleep when they come to rest."));

            this.createBooleanField(comp, "box2dDebugDraw",

                this.createLabel(comp, "Debug Draw",
                    "If enabled, the Box2D world renders debug information."));
        }

        private createFloatField(comp: HTMLElement, name: string, label: string, tooltip: string) {

            const labelElement = this.createLabel(comp, label, tooltip);

            const textElement = this.createText(comp);
            textElement.type = "number";
            textElement.step = "any";

            this.addUpdater(() => {

                const value = this.getSettings()[name];

                textElement.value = value === undefined ? "" : value.toString();
            });

            textElement.addEventListener("change", e => {

                const editor = this.getEditor();

                const value = this.parseNumberExpression(textElement, false);

                if (isNaN(value)) {

                    this.updateWithSelection();

                } else {

                    editor.getUndoManager().add(new ChangeSettingsPropertyOperation({
                        editor: editor,
                        props: [{
                            name,
                            value: value,
                        }],
                        repaint: true
                    }));
                }
            });

            return {
                label: labelElement,
                text: textElement
            };
        }
    }
}
