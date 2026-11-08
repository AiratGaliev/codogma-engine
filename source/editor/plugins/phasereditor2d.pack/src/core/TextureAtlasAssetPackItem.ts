/// <reference path="./BaseAtlasAssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    export class TextureAtlasAssetPackItem extends BaseAtlasAssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        createParser(): parsers.AtlasParser {

            const data = this.getData();

            const parser = new parsers.AtlasParser(this);

            // shortcut: official passes atlasURL/textureURL but fork's AtlasParser takes only packItem
            // parser will parse from data.url.IMG.atlasURL and data.url.IMG.textureURL internally
            return parser;
        }

        getSaveData(): any {

            const data = JSON.parse(JSON.stringify(this.getData()));

            const newUrlData: any = {};

            for (const key in data.url) {

                const config = data.url[key];

                if (Boolean(config.atlasURL)) {

                    newUrlData[key] = config;
                }
            }

            data.url = newUrlData;

            TextureAssetPackItem.sortUrlKeys(data);

            return data;
        }
    }
}