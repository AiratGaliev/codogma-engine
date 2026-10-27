namespace phasereditor2d.scene.ui.sceneobjects {
    export abstract class FXObject extends Phaser.GameObjects.GameObject implements ISceneGameObject {
        private _parent: ISceneGameObject;
        protected _phaserFX: Phaser.Filters.Controller;
        private _preFX: boolean;
        private _fxCleanup: (() => void) | undefined;

        constructor(scene: Scene, type: string, parent: ISceneGameObject, preFX: boolean) {
            super(scene, type);
            this._parent = parent;
            this._preFX = preFX;
        }

        abstract getEditorSupport(): GameObjectEditorSupport<ISceneGameObject>;

        removeFX(): void {
            const cleanup = this._fxCleanup;
            this._fxCleanup = undefined;
            if (cleanup) {
                cleanup();
            }
            if (this._phaserFX) {
                const parent = this._parent as any;
                if (parent && typeof parent.enableFilters === "function") {
                    this.getPipeline().remove(this._phaserFX);
                }
                this._phaserFX = undefined;
            }
        }

        getPhaserFX(): any {
            // Actions и Gradient хранят свойства редактора в этой модели; ColorMatrix использует контроллер фильтра.
            return this._phaserFX ?? this;
        }

        setFXCleanup(cleanup: () => void): void {
            this._fxCleanup = cleanup;
        }

        onEditorPropertyChanged(): void {
            this.refreshFX();
        }

        refreshFX(): void {
            // Реализации эффектов переопределяют метод, если live preview требует пересоздания ресурсов.
        }

        getPipeline(): Phaser.GameObjects.Components.FilterList {
            const obj = this._parent as unknown as Phaser.GameObjects.Image;
            if (!obj.filters) {
                obj.enableFilters();
            }
            return this._preFX ? obj.filters!.internal : obj.filters!.external;
        }

        isPreFX() {
            return this._preFX;
        }

        setPreFX(preFX: boolean) {
            if (this._preFX === preFX) {
                return;
            }
            this.removeFX();
            this._preFX = preFX;
            this.refreshFX();
        }

        getParent() {
            return this._parent;
        }

        setParent(parent: ISceneGameObject) {
            this.removeFX();
            this._parent = parent;
            this.refreshFX();
        }

        getParentDisplayObject() {
            return this._parent;
        }

        removeFromParent() {
            if (this._parent) {
                this._parent.getEditorSupport().removeObjectChild(this);
                this._parent = undefined;
            }
        }

        willRender(camera: Phaser.Cameras.Scene2D.Camera): boolean {
            return false;
        }
    }
}
