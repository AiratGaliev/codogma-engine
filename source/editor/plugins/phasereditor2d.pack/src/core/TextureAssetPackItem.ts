/// <reference path="./ImageAssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    import controls = colibri.ui.controls;

    export class TextureAssetPackItem extends ImageAssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        getSourceUrl(): string | null {
            const value: unknown = this.getData()?.url;

            if (typeof value === "string" && value.length > 0) {
                return value;
            }

            if (value && typeof value === "object" && !Array.isArray(value)) {
                const imageUrl = (value as Record<string, unknown>).IMG;
                return typeof imageUrl === "string" && imageUrl.length > 0 ? imageUrl : null;
            }

            return null;
        }

        getUrl(): string {
            return this.getSourceUrl();
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