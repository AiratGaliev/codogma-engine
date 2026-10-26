/// <reference path="./ParticleEmitterComponent.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    class SelectEmitterTextureOperation extends SceneGameObjectOperation<ParticleEmitter> {

        constructor(editor: editor.SceneEditor, objects: ParticleEmitter[], value: ITextureKeys) {
            super(editor, objects, value);
        }

        getValue(obj: ParticleEmitter): ITextureKeys {

            return {
                key: obj.editorTexture,
                frame: obj.editorFrame
            };
        }

        setValue(obj: ParticleEmitter, value: ITextureKeys): void {

            obj.editorTexture = value.key ?? "";

            obj.editorFrame = (value.frame as any) ?? "";

            ParticleEmitterComponent.applyConfig(obj);
        }
    }

    export class ParticleEmitterSection extends SceneGameObjectSection<ParticleEmitter> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterSection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, ParticleEmitterSection.SECTION_ID, "Particle Emitter", false, false);
        }

        getSectionHelpPath() {

            return "";
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElementWithPropertiesXY(parent);

            // texture

            this.createPropertyStringRow(comp, ParticleEmitterComponent.texture)
                .text.style.gridColumn = "3 / span 3";

            const selectTextureBtn = this.createButton(comp, "Select Texture", () => {

                this.openSelectTextureDialog();
            });

            selectTextureBtn.style.gridColumn = "6";

            // frame / animation / quantity

            this.createPropertyStringRow(comp, ParticleEmitterComponent.frame)
                .text.style.gridColumn = "3 / span 4";

            this.createPropertyStringRow(comp, ParticleEmitterComponent.animationKey)
                .text.style.gridColumn = "3 / span 4";

            this.createPropertyFloatRow(comp, ParticleEmitterComponent.quantity)
                .style.gridColumn = "3 / span 4";

            // emitter configuration

            this.createPropertyXYRow(comp, ParticleEmitterComponent.speed);
            this.createPropertyXYRow(comp, ParticleEmitterComponent.angle);
            this.createPropertyXYRow(comp, ParticleEmitterComponent.gravity);
            this.createPropertyXYRow(comp, ParticleEmitterComponent.lifespan);
            this.createPropertyXYRow(comp, ParticleEmitterComponent.scale);
            this.createPropertyXYRow(comp, ParticleEmitterComponent.alpha);
        }

        private openSelectTextureDialog() {

            const editor = this.getEditor();

            const cache = editor.getScene().getPackCache();

            const selectedFrames = this.getSelection()

                .filter(obj => obj instanceof ParticleEmitter)

                .map(obj => cache.getImage(obj.editorTexture, obj.editorFrame) as pack.core.AssetPackImageFrame)

                .filter(frame => Boolean(frame));

            const callback = (sel: pack.core.AssetPackImageFrame[]) => {

                const frame = sel[0];

                if (!frame) {

                    return;
                }

                const item = frame.getPackItem();

                item.addToPhaserCache(editor.getGame(), editor.getScene().getPackCache());

                let keys: ITextureKeys;

                if (item instanceof pack.core.ImageAssetPackItem) {

                    keys = { key: item.getKey() };

                } else {

                    keys = { key: item.getKey(), frame: frame.getName() as any };
                }

                editor.getUndoManager().add(new SelectEmitterTextureOperation(
                    editor,
                    this.getSelection() as ParticleEmitter[],
                    keys));
            };

            TextureSelectionDialog.createDialog(editor, selectedFrames, callback);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof ParticleEmitter;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
