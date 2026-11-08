namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class FontSection extends editor.properties.BaseSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.FontSection", "Font", core.FONT_TYPE);
        }

        canEdit(obj: any, n: number): boolean {

            return super.canEdit(obj, n) && obj instanceof core.FontAssetPackItem;
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 3);
            comp.style.gridTemplateColumns = "auto 1fr auto";

            this.createFileField(comp, "URL", "url", webContentTypes.core.CONTENT_TYPE_FONT, "Phaser.Loader.LoaderPlugin.font(url)");
            this.createSimpleTextField(comp, "Format", "format", "Phaser.Loader.LoaderPlugin.font(format)");
            this.createSimpleTextField(comp, "Descriptors", "descriptors", "Phaser.Loader.LoaderPlugin.font(descriptors)");
        }
    }
}