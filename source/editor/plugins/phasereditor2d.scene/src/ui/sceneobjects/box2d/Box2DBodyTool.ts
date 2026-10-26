/// <reference path="../../editor/tools/SceneTool.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class Box2DBodyTool extends editor.tools.SceneTool {

        static ID = "phasereditor2d.scene.ui.sceneobjects.Box2DBodyTool";
        static TOOL_COLOR = "orange";

        constructor() {
            super({
                id: Box2DBodyTool.ID,
                command: editor.commands.CMD_EDIT_BOX2D_BODY,
            });
        }

        canEdit(obj: unknown): boolean {

            return this.canRenderObj(obj);
        }

        canRender(obj: unknown): boolean {

            return this.canRenderObj(obj);
        }

        private canRenderObj(obj: unknown): boolean {

            if (!GameObjectEditorSupport.hasObjectComponent(obj, Box2DBodyComponent)) {

                return false;
            }

            const bodyComp = GameObjectEditorSupport.getObjectComponent(obj, Box2DBodyComponent) as Box2DBodyComponent;

            return bodyComp.isActive() && Box2DBodyComponent.isBodyEnabled(bodyComp.getObject());
        }

        render(args: editor.tools.ISceneToolRenderArgs): void {

            for (const obj of args.objects) {

                if (this.canRenderObj(obj)) {

                    this.renderObj(args, obj as ISceneGameObject);
                }
            }
        }

        private renderObj(args: editor.tools.ISceneToolRenderArgs, obj: ISceneGameObject) {

            const ctx = args.canvasContext;

            ctx.save();

            if (Box2DBodyComponent.isCircleShape(obj)) {

                this.renderCircle(obj, args, ctx);

            } else {

                this.renderRect(obj, args, ctx);
            }

            ctx.restore();
        }

        private transformLocalPoint(obj: ISceneGameObject, x: number, y: number,
            args: editor.tools.ISceneToolRenderArgs): { x: number, y: number } {

            const p = new Phaser.Math.Vector2();

            const tx = (obj as any).getWorldTransformMatrix();
            // removes rotation
            tx.rotate(-tx.rotation);
            tx.transformPoint(x, y, p);

            const sp = args.camera.getScreenPoint(p.x, p.y);

            return { x: sp.x, y: sp.y };
        }

        private renderRect(obj: ISceneGameObject, args: editor.tools.ISceneToolRenderArgs,
            ctx: CanvasRenderingContext2D) {

            const origin = obj.getEditorSupport().computeDisplayOrigin();

            if (obj instanceof Container) {

                origin.displayOriginX = 0;
                origin.displayOriginY = 0;
            }

            const width = Box2DBodyComponent.computeShapeWidth(obj);
            const height = Box2DBodyComponent.computeShapeHeight(obj);

            const x1 = origin.displayOriginX - width / 2;
            const y1 = origin.displayOriginY - height / 2;
            const x2 = origin.displayOriginX + width / 2;
            const y2 = origin.displayOriginY + height / 2;

            const p1 = this.transformLocalPoint(obj, x1, y1, args);
            const p2 = this.transformLocalPoint(obj, x2, y2, args);

            ctx.strokeStyle = "black";
            ctx.lineWidth = 3;
            ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

            ctx.strokeStyle = Box2DBodyTool.TOOL_COLOR;
            ctx.lineWidth = 1;
            ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        }

        private renderCircle(obj: ISceneGameObject, args: editor.tools.ISceneToolRenderArgs,
            ctx: CanvasRenderingContext2D) {

            const origin = obj.getEditorSupport().computeDisplayOrigin();

            if (obj instanceof Container) {

                origin.displayOriginX = 0;
                origin.displayOriginY = 0;
            }

            const radius = Box2DBodyComponent.computeShapeRadius(obj);

            const p1 = this.transformLocalPoint(
                obj, origin.displayOriginX - radius, origin.displayOriginY - radius, args);
            const p2 = this.transformLocalPoint(
                obj, origin.displayOriginX + radius, origin.displayOriginY + radius, args);

            const r = (p2.x - p1.x) / 2;
            const x = p1.x + r;
            const y = p1.y + r;

            ctx.strokeStyle = "black";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r, 0, 0, 360);
            ctx.stroke();

            ctx.strokeStyle = Box2DBodyTool.TOOL_COLOR;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r, 0, 0, 360);
            ctx.stroke();
        }
    }
}
