namespace phasereditor2d.scene.ui.sceneobjects {

    export class ParticleEmitter extends Phaser.GameObjects.Particles.ParticleEmitter implements ISceneGameObject {

        // authored properties of the emitter configuration.
        // they are plain fields so the properties can read/write them directly.

        public speedMin = 0;
        public speedMax = 0;
        public angleMin = 0;
        public angleMax = 360;
        public gravityX = 0;
        public gravityY = 0;
        public lifespanMin = 1000;
        public lifespanMax = 1000;
        public scaleStart = 1;
        public scaleEnd = 1;
        public alphaStart = 1;
        public alphaEnd = 1;

        // editor data: texture, frame, animation and emission quantity

        public editorTexture = "";
        public editorFrame = "";
        public editorAnimationKey = "";
        public editorQuantity = 1;

        private _editorSupport: ParticleEmitterEditorSupport;

        constructor(scene: Scene, x: number, y: number, texture?: string, config?: object) {
            super(scene, x, y, texture || undefined, config as any);

            // the hand-written Phaser type defs lack width/height on ParticleEmitter,
            // so we set a default size for picking and rendering purposes.

            if (!texture) {

                (this as any).width = 32;
                (this as any).height = 32;
            }

            this._editorSupport = new ParticleEmitterEditorSupport(this, scene);
        }

        getEditorSupport(): ParticleEmitterEditorSupport {

            return this._editorSupport;
        }
    }
}
