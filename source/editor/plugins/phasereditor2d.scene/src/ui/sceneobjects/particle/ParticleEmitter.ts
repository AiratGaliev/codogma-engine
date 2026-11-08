namespace phasereditor2d.scene.ui.sceneobjects {

    export class ParticleEmitter extends Phaser.GameObjects.Particles.ParticleEmitter implements ISceneGameObject {

        // authored properties: texture + frames of the particles

        public configTexture: string;
        public configFrame: any[];

        private _editorSupport: ParticleEmitterEditorSupport;
        private _disableUpdateConfig: boolean;
        private _previewAdvance: number;
        private _previewActive: boolean;

        constructor(scene: Scene, x: number, y: number, texture?: string) {
            super(scene, x, y, texture);

            this.configTexture = texture;
            this.configFrame = [];

            this._disableUpdateConfig = false;
            this._previewAdvance = 1000;
            this._previewActive = true;

            // the hand-written Phaser type defs lack width/height on ParticleEmitter,
            // so we set a default size for picking and rendering purposes.

            if (texture === undefined) {

                (this as any).width = 32;
                (this as any).height = 32;
            }

            this._editorSupport = new ParticleEmitterEditorSupport(this, scene);
        }

        get previewAdvance() {

            return this._previewAdvance;
        }

        set previewAdvance(value: number) {

            this._previewAdvance = value;

            this.fastForward(value);
        }

        get previewActive() {

            return this._previewActive;
        }

        set previewActive(value: boolean) {

            this._previewActive = value;

            this.active = value;
        }

        getEditorSupport(): ParticleEmitterEditorSupport {

            return this._editorSupport;
        }

        // emitters have no meaningful display origin, particles render from the emitter position
        get displayOriginX() {

            return 0;
        }

        get displayOriginY() {

            return 0;
        }

        disableUpdateConfig(disable: boolean) {

            this._disableUpdateConfig = disable;
        }

        updateConfig(config?: any): this {

            if (config !== undefined) {

                // passthrough call of the runtime API, our editor config always covers it
                return super.updateConfig(config);
            }

            if (this._disableUpdateConfig) {

                return this;
            }

            const editorConfig = this._editorSupport.generateConfig();

            if (this._previewActive) {

                this.setConfig(editorConfig);

            } else {

                this.active = true;
                this.setConfig(editorConfig);
                this.fastForward(this._previewAdvance);
                this.active = false;
            }

            return this;
        }
    }
}
