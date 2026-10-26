namespace phasereditor2d.pack.core {

    import io = colibri.core.io;

    export class SpritesheetAssetPackItem extends ImageFrameContainerAssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        getUrl() {

            return this.getData().url;
        }

        getCompressedVariants(): ICompressedTextureVariant[] {

            return CompressedTextureVariants.getVariants(this.getData());
        }

        getCompressedVariantUrl(format: ImageCompressedTextureFormat | string): string {

            return CompressedTextureVariants.getVariantUrl(this.getData(), format);
        }

        setCompressedVariant(format: ImageCompressedTextureFormat | string, url: string) {

            CompressedTextureVariants.setVariant(this.getData(), format, url);
        }

        clearCompressedVariant(format: ImageCompressedTextureFormat | string) {

            CompressedTextureVariants.clearVariant(this.getData(), format);
        }

        computeUsedFiles(files: Set<io.FilePath>) {

            super.computeUsedFiles(files);

            for (const variant of this.getCompressedVariants()) {

                const file = this.getFileFromAssetUrl(variant.url);

                if (file) {

                    files.add(file);
                }
            }
        }

        protected createParser(): parsers.ImageFrameParser {
            return new parsers.SpriteSheetParser(this);
        }
    }

}
