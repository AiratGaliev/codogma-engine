namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;
    import webContentTypes = phasereditor2d.webContentTypes;

    export class TextureMultiAtlasSection extends BaseSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.TextureMultiAtlasSection", "Texture (Atlas)", core.TEXTURE_TYPE);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof core.TextureMultiAtlasAssetPackItem && super.canEdit(obj, n);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);
            comp.style.gridTemplateColumns = "auto 1fr auto";

            // shortcut: runtime support for compressed textures (KTX2/PVR/ETC/ASTC) not implemented in Phaser 4.2.1
            for (const format of ["IMG", ...core.SUPPORTED_COMPRESSED_TEXTURE_FORMATS]) {

                if (format !== "IMG") {

                    this.createLabel(comp, `${format} Type`, `The type of the compressed texture container.`);

                    const options = [
                        { name: "PVR", value: "PVR" },
                        { name: "KTX", value: "KTX" }
                    ];

                    const btn = this.createMenuButton(comp, `${format}`, () => options, type => {
                        const data = this.getSelectionFirstElement().getData();
                        if (!data.url[format]) {
                            data.url[format] = {};
                        }
                        this.changeItemField(`url.${format}.type`, type);
                        this.updateWithSelection();
                    });
                    btn.style.gridColumn = "2 / span 2";

                    this.addUpdater(() => {
                        const data = this.getSelectionFirstElement().getData();
                        const type = data.url?.[format]?.type || "";
                        btn.textContent = type;
                    });
                }

                this.createFileField(comp, `${format} Multi Atlas URL`, `url.${format}.multiAtlasURL`, core.contentTypes.CONTENT_TYPE_MULTI_ATLAS, `The multiAtlasURL of the compressed textures (${format}) file to load.`);
                this.createSimpleTextField(comp, `${format} Multi Path`, `url.${format}.multiPath`, `The multiPath of the compressed textures (${format}) file to load.`);
            }
        }
    }
}