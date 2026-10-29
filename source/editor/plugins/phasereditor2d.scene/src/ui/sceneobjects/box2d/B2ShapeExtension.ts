/// <reference path="../SceneGameObjectExtension.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class B2Shape extends Phaser.GameObjects.GameObject implements ISceneGameObject {

        private _editorSupport: B2ShapeEditorSupport;
        private _parent: ISceneGameObject | Phaser.GameObjects.DisplayList;

        constructor(scene: Scene, typeName: string) {
            super(scene, typeName);
            this._editorSupport = new B2ShapeEditorSupport(scene, this);
            this._parent = scene.children;
        }

        getParentDisplayObject() {
            if (this._parent) {
                if (this._parent instanceof B2Body) {
                    return this._parent.getParentDisplayObject();
                } else if (isGameObject(this._parent)) {
                    return this._parent;
                }
            }
            return undefined;
        }

        willRender(camera: Phaser.Cameras.Scene2D.Camera): boolean {
            return false;
        }

        getEditorSupport() {
            return this._editorSupport;
        }

        getParent() {
            return this._parent;
        }

        setParent(parent: ISceneGameObject) {
            this._parent = parent;
        }

        removeFromParent() {
            if (isGameObject(this._parent)) {
                (this._parent as ISceneGameObject).getEditorSupport().removeObjectChild(this);
            } else {
                (this.scene as Scene).removeGameObject(this);
            }
            this._parent = undefined;
        }
    }

    export class B2ShapeEditorSupport extends GameObjectEditorSupport<B2Shape> {

        static DEFAULT_PARENT_VARIABLE_TYPES = ["B2Body", "Phaser.GameObjects.GameObject", "Phaser.Scene"];

        constructor(scene: Scene, obj: B2Shape) {
            super(B2ShapeExtension.getInstance(), obj, scene);
        }

        destroy(): boolean | void {
            this.getObject().removeFromParent();
            super.destroy();
        }

        isDisplayObject(): boolean {
            return false;
        }

        setInteractive(): void {}

        readJSON(data: any) {
            super.readJSON(data);
            (this.getObject() as any)["__b2Data"] = data;
        }

        getCellRenderer(): colibri.ui.controls.viewers.ICellRenderer {
            return new colibri.ui.controls.viewers.IconImageCellRenderer(
                resources.getIcon(resources.ICON_BUILD));
        }

        getObjectParent(): ISceneGameObject {
            const parent = this.getObject().getParent();
            if (isGameObject(parent)) {
                return parent as ISceneGameObject;
            }
            return undefined;
        }
    }

    export class B2ShapeExtension extends SceneGameObjectExtension {

        private static _instances: Map<string, B2ShapeExtension> = new Map();

        static getInstance(typeName = "b2BoxShape") {
            if (!this._instances.has(typeName)) {
                this._instances.set(typeName, new B2ShapeExtension(typeName));
            }
            return this._instances.get(typeName);
        }

        private constructor(typeName: string) {
            super({
                typeName,
                phaserTypeName: "B2Shape",
                category: SCENE_OBJECT_SCRIPT_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_BUILD)
            });
        }

        getHelp(): string {
            return "A Box2D shape object.";
        }

        acceptsDropData(data: any): boolean {
            return false;
        }

        createSceneObjectWithAsset(args: ICreateWithAssetArgs): ISceneGameObject {
            return null;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {
            const obj = new B2Shape(args.scene, this.getTypeName());
            obj.getEditorSupport().readJSON(args.data);
            return obj;
        }

        async getAssetsFromObjectData(args: IGetAssetsFromObjectArgs): Promise<any[]> {
            return [];
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {
            return new B2ShapeCodeDOMBuilder();
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {
            return [new B2Shape(args.scene, this.getTypeName())];
        }
    }

    export class B2ShapeCodeDOMBuilder extends GameObjectCodeDOMBuilder {

        constructor() {
            super("add");
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {
            const data = (args.obj as any)["__b2Data"] || {};
            const typeName = args.obj.getEditorSupport().getObjectType();
            const parentBodyVar = args.parentVarName || (data.scope === "CLASS" ? "this.scene.worldId" : "box2dWorldId");
            const methodName = typeName === "b2CircleShape" ? "b2CreateCircleShape"
                : (typeName === "b2BoxShape" || typeName === "b2PolygonShape") ? "b2CreatePolygonShape"
                : "b2CreateShape";
            const call = new core.code.MethodCallCodeDOM(methodName, args.sceneExpr);
            call.setDeclareReturnToVar(true);

            if (typeName === "b2BoxShape") {
                const halfWidth = data.halfWidth ?? 0;
                const halfHeight = data.halfHeight ?? 0;
                const density = data.density ?? 1;
                const shapeDef = [`...b2DefaultShapeDef()`];
                if (density !== 1) shapeDef.push(`density: ${density}`);

                call.arg(parentBodyVar);
                call.arg(`{ ${shapeDef.join(", ")} }`);
                call.arg(`b2MakeBox(pxm(${halfWidth}), pxm(${halfHeight}))`);

            } else if (typeName === "b2PolygonShape") {
                const pointsStr = data.points || "";
                const pointsArr = pointsStr.trim().split(/\s+/).filter(s => s.length > 0);
                const pairStrs: string[] = [];
                for (let i = 0; i < pointsArr.length; i += 2) {
                    const x = pointsArr[i];
                    const y = pointsArr[i + 1] !== undefined ? pointsArr[i + 1] : "0";
                    pairStrs.push(`new b2Vec2(pxm(${x}), pxm(${y}))`);
                }
                const friction = data.friction ?? 0.6;
                const filterCategoryBits = data.filterCategoryBits ?? 1;
                const filterMaskBits = data.filterMaskBits ?? 1;
                const filterGroupIndex = data.filterGroupIndex ?? 0;
                const shapeDef = [`...b2DefaultShapeDef()`];
                if (friction !== 0.6) shapeDef.push(`friction: ${friction}`);
                if (filterCategoryBits !== 1 || filterMaskBits !== 1 || filterGroupIndex !== 0) {
                    shapeDef.push(`filter: { categoryBits: ${filterCategoryBits}, maskBits: ${filterMaskBits}, groupIndex: ${filterGroupIndex} }`);
                }

                call.arg(parentBodyVar);
                call.arg(`{ ${shapeDef.join(", ")} }`);
                call.arg(`b2MakePolygon(b2ComputeHull([${pairStrs.join(", ")}], ${pairStrs.length / 2 || 0}), pxm(0))`);

            } else if (typeName === "b2CircleShape") {
                const radius = data.radius ?? 0;
                const friction = data.friction ?? 0.6;
                const filterCategoryBits = data.filterCategoryBits ?? 1;
                const filterMaskBits = data.filterMaskBits ?? 1;
                const filterGroupIndex = data.filterGroupIndex ?? 0;
                const shapeDef = [`...b2DefaultShapeDef()`];
                if (friction !== 0.6) shapeDef.push(`friction: ${friction}`);
                if (filterCategoryBits !== 1 || filterMaskBits !== 1 || filterGroupIndex !== 0) {
                    shapeDef.push(`filter: { categoryBits: ${filterCategoryBits}, maskBits: ${filterMaskBits}, groupIndex: ${filterGroupIndex} }`);
                }

                call.arg(parentBodyVar);
                call.arg(`{ ${shapeDef.join(", ")} }`);
                call.arg(`new b2Circle(new b2Vec2(pxm(0), pxm(0)), pxm(${radius}))`);

            } else {
                // shortcut: basic constructor call for unknown shape types
                const call2 = new core.code.MethodCallCodeDOM("new", args.sceneExpr);
                call2.setConstructor(true);
                const extName = args.obj.getEditorSupport().getObjectType();
                call2.arg(extName);
                return call2;
            }

            return call;
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs): void {}
        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {}
        buildPrefabConstructorDeclarationSupperCallCodeDOM(args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {}
    }
}
