namespace phasereditor2d.scene.ui.sceneobjects {

    export class Video extends Phaser.GameObjects.Video implements ISceneGameObject {

        // authored properties, they are read by the VideoComponent properties
        public url = "";
        public loop = false;
        public mute = false;
        public autoplay = false;

        private _editorSupport: VideoEditorSupport;

        constructor(scene: Scene, x: number, y: number, key?: string) {
            super(scene, x, y, key);

            this._editorSupport = new VideoEditorSupport(this, scene);
        }

        getEditorSupport(): VideoEditorSupport {

            return this._editorSupport;
        }
    }
}
