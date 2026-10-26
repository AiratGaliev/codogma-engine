namespace phasereditor2d.pack.core {

    /**
     * The compressed-texture variant formats supported by the Image and Spritesheet asset items.
     *
     * These are file/container formats used by export pipelines. They are editor-side metadata:
     * the Phaser loader keeps using the standard image URL of the asset.
     */
    export type ImageCompressedTextureFormat = "webp" | "avif" | "ktx2" | "pvr" | "dds";

    export interface ICompressedTextureVariant {

        format: string;
        url: string;
    }

    /**
     * The compressed-texture formats shown in the asset pack editor UI, in display order.
     */
    export const COMPRESSED_TEXTURE_FORMATS: ImageCompressedTextureFormat[] = [
        "webp",
        "avif",
        "ktx2",
        "pvr",
        "dds"
    ];

    /**
     * Helper for reading and writing the optional `compressed` field of an asset pack item data.
     *
     * The field is an object mapping format -> url, like:
     *
     * ```json
     * {
     *     "type": "image",
     *     "key": "dude",
     *     "url": "assets/dude.png",
     *     "compressed": {
     *         "webp": "assets/dude.webp",
     *         "ktx2": "assets/dude.ktx2"
     *     }
     * }
     * ```
     *
     * The field is written into the item JSON only when at least one variant URL is set,
     * so existing asset pack files keep serializing unchanged.
     */
    export class CompressedTextureVariants {

        static isCompressedTextureFormat(format: string): boolean {

            return COMPRESSED_TEXTURE_FORMATS.indexOf(format as ImageCompressedTextureFormat) >= 0;
        }

        static getVariants(data: any): ICompressedTextureVariant[] {

            const result: ICompressedTextureVariant[] = [];

            const compressed = data["compressed"];

            if (!compressed || typeof compressed !== "object") {

                return result;
            }

            // known formats first, in display order
            for (const format of COMPRESSED_TEXTURE_FORMATS) {

                const url = compressed[format];

                if (typeof url === "string" && url.length > 0) {

                    result.push({ format, url });
                }
            }

            // preserve unknown (hand-edited) formats at the end
            for (const format of Object.keys(compressed)) {

                if (COMPRESSED_TEXTURE_FORMATS.indexOf(format as ImageCompressedTextureFormat) >= 0) {

                    continue;
                }

                const url = compressed[format];

                if (typeof url === "string" && url.length > 0) {

                    result.push({ format, url });
                }
            }

            return result;
        }

        static getVariantUrl(data: any, format: ImageCompressedTextureFormat | string): string {

            const compressed = data["compressed"];

            if (!compressed || typeof compressed !== "object") {

                return undefined;
            }

            const url = compressed[format];

            return typeof url === "string" ? url : undefined;
        }

        static setVariant(data: any, format: ImageCompressedTextureFormat | string, url: string): void {

            if (!url) {

                this.clearVariant(data, format);

                return;
            }

            let compressed = data["compressed"];

            if (!compressed || typeof compressed !== "object") {

                compressed = {};
                data["compressed"] = compressed;
            }

            compressed[format] = url;
        }

        static clearVariant(data: any, format: ImageCompressedTextureFormat | string): void {

            const compressed = data["compressed"];

            if (!compressed || typeof compressed !== "object") {

                return;
            }

            delete compressed[format];

            if (Object.keys(compressed).length === 0) {

                // the compressed field is written only when at least one URL is set
                delete data["compressed"];
            }
        }
    }
}
