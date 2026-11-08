namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class SceneSpritesheetPreviewSection extends pack.ui.properties.SpritesheetPreviewSection {

        constructor(page: controls.properties.PropertyPage) {

            super(page, "phasereditor2d.scene.ui.sceneobjects.SceneSpritesheetPreviewSection", false);
        }

        createForm(parent: HTMLDivElement) {

            super.createForm(parent);

            const control = this.getImageControl();

            control.setMinHeight(300);

            control.getCanvas().parentElement.style.height = "300px";
        }

        protected async getSelectedSpritesheet(): Promise<pack.core.SpritesheetAssetPackItem> {

            const obj = this.getSelectionFirstElement();

            if (!this.canEdit(obj, 1)) {

                return null as any;
            }

            const textureComp = obj.getEditorSupport().getComponent(TextureComponent);

            if (textureComp) {

                const { key } = textureComp.getTextureKeys();

                const finder = new pack.core.PackFinder();
                await finder.preload();

                const item = finder.findAssetPackItem(key);

                if (item instanceof pack.core.SpritesheetAssetPackItem) {

                    return item;
                }
            }

            return null as any;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }

        canEdit(obj: any, n: number): boolean {

            if (GameObjectEditorSupport.hasEditorSupport(obj)) {

                const textureComp = obj.getEditorSupport().getComponent(TextureComponent);

                if (textureComp) {

                    const { key, frame } = textureComp.getTextureKeys();

                    if (typeof frame === "number") {

                        const editor = colibri.Platform.getWorkbench().getActiveEditor();

                        if (editor && editor instanceof ui.editor.SceneEditor) {

                            const image = editor.getScene().getPackCache().getSpritesheetImage(key);

                            return Boolean(image);
                        }
                    }
                }
            }

            return false;
        }
    }
}
