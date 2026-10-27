/// <reference path="./AssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    import controls = colibri.ui.controls;

    export class VideoAssetPackItem extends AssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        getFirstUrl(): string {

            const url = this.getData()["url"] as string[];

            return url ? url[0] : null;
        }

        getVideoFile(): colibri.core.io.FilePath {

            const url = this.getFirstUrl();

            if (url) {

                const file = this.getFileFromAssetUrl(url);

                return file;
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
