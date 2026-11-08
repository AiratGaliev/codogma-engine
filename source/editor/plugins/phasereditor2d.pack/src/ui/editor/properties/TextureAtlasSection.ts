namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class TextureAtlasSection extends BaseSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.TextureAtlasSection", "Texture (Atlas)", core.TEXTURE_TYPE);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof core.TextureAtlasAssetPackItem && super.canEdit(obj, n);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);
            comp.style.gridTemplateColumns = "auto 1fr auto";

            // shortcut: runtime support for compressed textures (KTX2/PVR/ETC/ASTC) not implemented in Phaser 4.2.1
            for (const format of ["IMG", ...core.SUPPORTED_COMPRESSED_TEXTURE_FORMATS]) {
                this.createFileField(comp, `${format} Atlas URL`, `url.${format}.atlasURL`, webContentTypes.core.CONTENT_TYPE_TEXTURE, `The atlasURL of the compressed textures (${format}) file to load.`);
                this.createFileField(comp, `${format} Texture URL`, `url.${format}.textureURL`, webContentTypes.core.CONTENT_TYPE_TEXTURE, `The textureURL of the compressed textures (${format}) file to load.`);
            }
        }
    }
}