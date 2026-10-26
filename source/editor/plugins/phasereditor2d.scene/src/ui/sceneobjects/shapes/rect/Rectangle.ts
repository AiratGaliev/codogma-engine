namespace phasereditor2d.scene.ui.sceneobjects {

    export class Rectangle extends Phaser.GameObjects.Rectangle implements ISceneGameObject {

        // authored rounded properties, they are read by the RectangleComponent properties

        public rounded = false;
        public roundedRadius = 20;

        private _editorSupport: RectangleEditorSupport;

        constructor(scene: Scene, x: number, y: number) {
            super(scene, x, y);

            this._editorSupport = new RectangleEditorSupport(scene, this);
        }

        getEditorSupport() {

            return this._editorSupport;
        }

        setSize(width: number, height: number) {

            super.setSize(width, height);

            const geom = this.geom as Phaser.Geom.Rectangle;

            geom.setSize(width, height);

            this.updateDisplayOrigin();

            const self = this as any;

            self.updateData();

            return this;
        }
    }
}