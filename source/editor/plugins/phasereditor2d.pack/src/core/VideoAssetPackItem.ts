/// <reference path="./AssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    import controls = colibri.ui.controls;

    export class VideoAssetPackItem extends AssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        private getUrls(): string[] {

            const value: unknown = this.getData()["url"];

            const urls = typeof value === "string"
                ? [value]
                : Array.isArray(value) ? value : [];

            return urls.filter((url): url is string =>
                typeof url === "string" && url.trim().length > 0);
        }

        getFirstUrl(): string {

            return this.getUrls()[0] ?? null;
        }

        getVideoFile(): colibri.core.io.FilePath {

            // Asset Pack allows both a single URL and an array of format fallbacks.
            // Skip malformed or missing paths instead of treating a string as an array
            // and returning only its first character.
            for (const url of this.getUrls()) {

                const file = this.getFileFromAssetUrl(url);

                if (file) {

                    return file;
                }
            }

            return null;
        }

        async preload(): Promise<controls.PreloadResult> {

            const file = this.getVideoFile();

            if (file) {

                return await colibri.ui.ide.FileUtils.preloadFileBinary(file);
            }

            return controls.PreloadResult.NOTHING_LOADED;
        }

        addToPhaserCache(game: Phaser.Game, cache: parsers.AssetPackCache) {

            const file = this.getVideoFile();

            if (!file) {

                return;
            }

            game.cache.video.add(this.getKey(), {
                noAudio: Boolean(this.getData()["noAudio"]),
                url: file.getUrl()
            });
        }
    }
}
