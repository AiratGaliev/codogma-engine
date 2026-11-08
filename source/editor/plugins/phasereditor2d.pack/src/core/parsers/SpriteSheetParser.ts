/// <reference path="./BaseAtlasParser.ts" />

namespace phasereditor2d.pack.core.parsers {

    import controls = colibri.ui.controls;
    import ide = colibri.ui.ide;

    export class SpriteSheetParser extends ImageFrameParser {

        constructor(packItem: AssetPackItem) {
            super(packItem);
        }

        addToPhaserCache(game: Phaser.Game, cache: parsers.AssetPackCache) {

            const item = this.getPackItem() as SpritesheetAssetPackItem;

            cache.addAsset(item);

            if (!game.textures.exists(item.getKey())) {

                const data = item.getData();

                const image = AssetPackUtils.getImageFromPackUrl(item.getPack(), data.url) as controls.DefaultImage;

                if (image) {

                    game.textures.addSpriteSheet(item.getKey(), image.getImageElement(), data.frameConfig);

                    cache.addSpritesheetImage(image, item.getKey());

                    for (const frame of item.getFrames()) {

                        cache.addImage(frame, item.getKey(), frame.getName());
                    }
                }
            }
        }

        async preloadFrames(): Promise<controls.PreloadResult> {

            const item = this.getPackItem();
            const data = item.getData();

            const imageFile = item.getFileFromAssetUrl(data.url);

            if (!imageFile) {

                return controls.Controls.resolveNothingLoaded();
            }

            const image = ide.FileUtils.getImage(imageFile);

            if (!image) {
                return controls.Controls.resolveNothingLoaded();
            }

            return await image.preloadSize();
        }

        parseFrames(): AssetPackImageFrame[] {

            const frames: AssetPackImageFrame[] = [];
            const item = this.getPackItem();
            const data = item.getData();

            const imageFile = item.getFileFromAssetUrl(data.url);
            const image = ide.FileUtils.getImage(imageFile);

            if (!image) {
                return frames;
            }

            const w = data.frameConfig.frameWidth;
            const h = data.frameConfig.frameHeight;
            const margin = data.frameConfig.margin || 0;
            const spacing = data.frameConfig.spacing || 0;
            // "??" is required here: an endFrame of 0 is a valid single-frame
            // window, while "||" would turn it into -1 (= all frames).
            const rawStartFrame = data.frameConfig.startFrame ?? 0;
            const rawEndFrame = data.frameConfig.endFrame ?? -1;

            if (w <= 0 || h <= 0 || spacing < 0 || margin < 0) {
                // invalid values
                return frames;
            }

            const imageHeight = image.getHeight();
            const imageWidth = image.getWidth();

            /*
             * The frame layout MUST match Phaser's SpriteSheet parser exactly
             * (see phaser.js Phaser.Textures.SpriteSheet): the editor preview
             * and the generated game must agree on how many frames a
             * spritesheet has, their names and their source rectangles.
             * The previous implementation diverged in three ways: it emitted
             * rows overhanging the image bottom, its horizontal fit check
             * included `spacing` (Phaser's row count does not), and it named
             * frames by their absolute index instead of sequentially.
             */
            const row = Math.floor((imageWidth - margin + spacing) / (w + spacing));
            const column = Math.floor((imageHeight - margin + spacing) / (h + spacing));
            const total = row * column;

            if (total === 0) {

                return frames;
            }

            let start = rawStartFrame;

            if (start > total || start < -total) {
                start = 0;
            }

            if (start < 0) {
                // negative start skips frames from the end (Phaser semantics)
                start = total + start;
            }

            let end = rawEndFrame;

            if (end === -1 || end > total || end < start) {
                end = total;
            }

            let fx = margin;
            let fy = margin;
            let name = 0;

            for (let i = 0; i < total; i++) {

                if (i >= start && i <= end) {

                    const fd = new controls.FrameData(name,
                        new controls.Rect(fx, fy, w, h),
                        new controls.Rect(0, 0, w, h),
                        new controls.Point(w, h)
                    );

                    frames.push(new AssetPackImageFrame(
                        this.getPackItem() as ImageFrameContainerAssetPackItem, name, image, fd));

                    name++;
                }

                fx += w + spacing;

                if (fx + w > imageWidth) {

                    fx = margin;
                    fy += h + spacing;
                }
            }

            return frames;
        }
    }
}