/// <reference path="./ImageAssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    import controls = colibri.ui.controls;

    export class TextureAssetPackItem extends ImageAssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        getUrl(): string {

            const data = this.getData();
            return data.url.IMG;
        }

        static sortUrlKeys(data: any) {

            const newUrlData: any = {};

            for (const format of [...SUPPORTED_COMPRESSED_TEXTURE_FORMATS, "IMG"]) {

                if (data.url[format]) {

                    newUrlData[format] = data.url[format];
                }
            }

            data.url = newUrlData;
        }

        getSaveData(): any {

            const data = JSON.parse(JSON.stringify(this.getData()));

            TextureAssetPackItem.sortUrlKeys(data);

            return data;
        }
    }
}