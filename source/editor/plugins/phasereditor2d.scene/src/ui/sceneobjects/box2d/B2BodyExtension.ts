/// <reference path="../SceneGameObjectExtension.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class B2Body extends Phaser.GameObjects.GameObject implements ISceneGameObject {

        private _editorSupport: B2BodyEditorSupport;
        private _parent: ISceneGameObject | Phaser.GameObjects.DisplayList;

        constructor(scene: Scene) {
            super(scene, "B2Body");
            this._editorSupport = new B2BodyEditorSupport(scene, this);
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

    export class B2BodyEditorSupport extends GameObjectEditorSupport<B2Body> {

        static DEFAULT_PARENT_VARIABLE_TYPES = ["Image", "Sprite", "ScriptNode", "Phaser.GameObjects.GameObject", "Phaser.Scene"];

        constructor(scene: Scene, obj: B2Body) {
            super(B2BodyExtension.getInstance(), obj, scene);
        }

        destroy(): boolean | void {
            this.getObject().removeFromParent();
            super.destroy();
        }

        isDisplayObject(): boolean {
            return false;
        }

        setInteractive(): void {
            // nothing
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

    export class B2BodyExtension extends SceneGameObjectExtension {

        private static _instance: B2BodyExtension;

        static getInstance() {
            return this._instance || (this._instance = new B2BodyExtension());
        }

        private constructor() {
            super({
                typeName: "b2Body",
                phaserTypeName: "B2Body",
                category: SCENE_OBJECT_SCRIPT_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_BUILD)
            });
        }

        getHelp(): string {
            return "A Box2D physics body object.";
        }

        acceptsDropData(data: any): boolean {
            return false;
        }

        createSceneObjectWithAsset(args: ICreateWithAssetArgs): ISceneGameObject {
            return null;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {
            const obj = new B2Body(args.scene);
            obj.getEditorSupport().readJSON(args.data);
            return obj;
        }

        async getAssetsFromObjectData(args: IGetAssetsFromObjectArgs): Promise<any[]> {
            return [];
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {
            return new B2BodyCodeDOMBuilder();
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {
            return [new B2Body(args.scene)];
        }
    }

    export class B2BodyCodeDOMBuilder extends GameObjectCodeDOMBuilder {

        constructor() {
            super("add");
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {
            // Non-display object: no factory call needed; the body creation code
            // is emitted by the scene compiler through Box2DBodyComponent.
            // Return an empty/no-op call so the compiler keeps the variable.
            const call = new core.code.MethodCallCodeDOM("new", args.sceneExpr);
            call.setConstructor(true);
            call.arg("B2Body");
            return call;
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs): void {
            // nothing extra
        }

        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {
            // nothing extra
        }

        buildPrefabConstructorDeclarationSupperCallCodeDOM(args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {
            // nothing extra
        }
    }
}
