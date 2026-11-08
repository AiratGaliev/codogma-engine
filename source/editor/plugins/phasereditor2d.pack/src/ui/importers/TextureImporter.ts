namespace phasereditor2d.pack.ui.importers {


    export class TextureImporter extends ContentTypeImporter {

        constructor() {
            super(webContentTypes.core.CONTENT_TYPE_TEXTURE, core.TEXTURE_TYPE);
        }

        createItemData(pack: core.AssetPack, file: colibri.core.io.FilePath): any {

            return {
                url: {
                    IMG: pack.getUrlFromAssetFile(file)
                }
            };
        }
    }
}