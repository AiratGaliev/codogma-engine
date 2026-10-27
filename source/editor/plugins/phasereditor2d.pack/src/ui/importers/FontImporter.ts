namespace phasereditor2d.pack.ui.importers {

    import ide = colibri.ui.ide;
    import io = colibri.core.io;
    import webContentTypes = phasereditor2d.webContentTypes;

    export class FontImporter extends ContentTypeImporter {

        constructor() {
            super(webContentTypes.core.CONTENT_TYPE_FONT, core.FONT_TYPE);
        }

        createItemData(pack: core.AssetPack, file: io.FilePath): any {

            const ext = file.getExtension().toLowerCase();
            const format = {
                ttf: "truetype",
                otf: "opentype",
                woff: "woff",
                woff2: "woff2",
                eot: "embedded-opentype"
            }[ext] || "truetype";
            return {
                url: pack.getUrlFromAssetFile(file),
                format,
                descriptors: {}
            };
        }
    }
}