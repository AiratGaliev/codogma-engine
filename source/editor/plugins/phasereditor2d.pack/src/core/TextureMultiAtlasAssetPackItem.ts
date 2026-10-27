/// <reference path="./MultiAtlasAssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    export class TextureMultiAtlasAssetPackItem extends MultiatlasAssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        getAtlasURL(): string {

            return this.getData().url.IMG.multiAtlasURL;
        }

        getSaveData(): any {

            const data = JSON.parse(JSON.stringify(this.getData()));

            const newUrlData: any = {};

            for (const key in data.url) {

                const config = data.url[key];

                if (Boolean(config.multiAtlasURL)) {

                    newUrlData[key] = config;
                }
            }

            data.url = newUrlData;

            TextureAssetPackItem.sortUrlKeys(data);

            return data;
        }
    }
}