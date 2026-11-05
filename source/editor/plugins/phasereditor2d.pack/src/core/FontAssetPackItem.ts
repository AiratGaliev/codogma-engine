/// <reference path="./AssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    import controls = colibri.ui.controls;

    export class FontAssetPackItem extends AssetPackItem {

        private _fontFace: FontFace | null = null;
        private _fontSourceKey: string | null = null;

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        async preload(): Promise<controls.PreloadResult> {

            const data = this.getData();
            const url = typeof data.url === "string" ? data.url : "";
            const file = this.getFileFromAssetUrl(url);

            if (!url || !file || !file.isFile()) {
                throw new Error(`Font source file is missing from the project: ${url || "(empty URL)"}`);
            }

            const fontSet = document.fonts as (FontFaceSet & {
                add(font: FontFace): FontFaceSet;
                delete(font: FontFace): boolean;
            }) | undefined;

            if (!fontSet || typeof FontFace === "undefined"
                || typeof fontSet.add !== "function" || typeof fontSet.delete !== "function") {
                throw new Error("The browser does not provide the Font Loading API required by this asset.");
            }

            const format = typeof data.format === "string" && data.format.length > 0
                ? data.format : "truetype";
            const descriptors = data.descriptors && typeof data.descriptors === "object"
                && !Array.isArray(data.descriptors) ? data.descriptors : {};
            const sourceKey = JSON.stringify([url, format, descriptors]);

            if (this._fontFace && this._fontSourceKey === sourceKey
                && this._fontFace.status === "loaded") {
                return controls.Controls.resolveNothingLoaded();
            }

            const publicUrl = file.getUrl();
            const source = `url(${JSON.stringify(publicUrl)}) format(${JSON.stringify(format)})`;
            const key = this.getKey();
            let font: FontFace | null = null;

            try {
                font = new FontFace(key, source, descriptors);
                await font.load();
                fontSet.add(font);
            } catch (error) {
                if (font) {
                    fontSet.delete(font);
                }

                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(`Не удалось загрузить шрифт "${key}" из "${url}": ${detail}`);
            }

            const previousFont = this._fontFace;
            this._fontFace = font;
            this._fontSourceKey = sourceKey;

            if (previousFont) {
                fontSet.delete(previousFont);
            }

            return controls.Controls.resolveResourceLoaded();
        }

        resetCache(): void {
            if (this._fontFace && typeof document !== "undefined" && document.fonts) {
                document.fonts.delete(this._fontFace);
            }

            this._fontFace = null;
            this._fontSourceKey = null;

            super.resetCache();
        }
    }
}
