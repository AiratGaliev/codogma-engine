namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;
    import webContentTypes = phasereditor2d.webContentTypes;

    export class TextureSection extends BaseSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.TextureSection", "Texture", core.TEXTURE_TYPE);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof core.TextureAssetPackItem && super.canEdit(obj, n);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);
            comp.style.gridTemplateColumns = "auto 1fr auto";

            this.createFileField(comp, "IMG", "url.IMG", webContentTypes.core.CONTENT_TYPE_IMAGE, "The URL of the image file to load.");

            // shortcut: runtime support for compressed textures (KTX2/PVR/ETC/ASTC) not implemented in Phaser 4.2.1
            for (const format of core.SUPPORTED_COMPRESSED_TEXTURE_FORMATS) {
                this.createFileField(comp, format, `url.${format}`, webContentTypes.core.CONTENT_TYPE_TEXTURE, `The URL of the compressed texture (${format}) file to load.`);
            }
        }
    }
}