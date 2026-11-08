/// <reference path="../object/properties/SceneGameObjectSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class Box2DBodySection extends SceneGameObjectSection<ISceneGameObject> {

        static ID = "phasereditor2d.scene.ui.sceneobjects.Box2DBodySection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, Box2DBodySection.ID, "Box2D Body");
        }

        createMenu(menu: controls.Menu): void {

            this.createToolMenuItem(menu, Box2DBodyTool.ID);

            menu.addSeparator();

            menu.addCommand(ui.editor.commands.CMD_BOX2D_ENABLE_BODY);
            menu.addCommand(ui.editor.commands.CMD_BOX2D_DISABLE_BODY);

            menu.addSeparator();

            super.createMenu(menu);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElementWithPropertiesBoolXY(parent);

            this.createPropertyBoolean(comp, Box2DBodyComponent.enabled).checkElement.style.gridColumn = "span 4";

            this.createPropertyEnumRow(comp, Box2DBodyComponent.bodyType, false).style.gridColumn = "span 4";

            this.createSeparatorForXYGrid(comp, "Shape");

            this.createPropertyEnumRow(comp, Box2DBodyComponent.shapeType, false).style.gridColumn = "span 4";

            const sizeElements = this.createPropertyXYRow(comp, Box2DBodyComponent.shapeSize);

            const radiusInput = this.createPropertyFloatRow(comp, Box2DBodyComponent.shapeRadius);

            this.addShapeUpdater(sizeElements, [radiusInput]);

            this.createSeparatorForXYGrid(comp, "Material");

            for (const prop of [
                Box2DBodyComponent.density,
                Box2DBodyComponent.friction,
                Box2DBodyComponent.restitution,
                Box2DBodyComponent.linearDamping,
                Box2DBodyComponent.angularDamping,
                Box2DBodyComponent.gravityScale
            ]) {

                const input = this.createPropertyFloatRow(comp, prop);
                input.style.gridColumn = "4 / span 3";
            }

            this.createSeparatorForXYGrid(comp, "Flags");

            for (const prop of [
                Box2DBodyComponent.fixedRotation,
                Box2DBodyComponent.bullet,
                Box2DBodyComponent.allowSleep
            ]) {

                this.createPropertyBoolean(comp, prop).checkElement.style.gridColumn = "span 4";
            }

            this.createWorldWarning(comp);
        }

        private createWorldWarning(comp: HTMLElement) {

            const label = this.createLabel(comp,
                "Box2D physics is disabled in the scene settings.");

            label.style.gridColumn = "span 6";

            this.addUpdater(() => {

                const editor = this.getEditor();

                const scene = editor.getScene();

                const settings = scene.getSettings();
                label.style.display = settings.box2dEnabled || settings.box2dGenerateWorldCode
                    ? "none" : "block";
            });
        }

        private addShapeUpdater(boxElements: HTMLInputElement[], circleElements: HTMLInputElement[]) {

            this.addUpdater(() => {

                const isCircle = this.flatValues_BooleanAnd(
                    this.getSelection().map(obj => Box2DBodyComponent.isCircleShape(obj)));

                for (const elem of boxElements) {

                    elem.disabled = isCircle;
                }

                for (const elem of circleElements) {

                    elem.disabled = !isCircle;
                }
            });
        }

        canEdit(obj: any, n: number): boolean {

            return n > 0 && GameObjectEditorSupport.hasObjectComponent(obj, Box2DBodyComponent);
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
