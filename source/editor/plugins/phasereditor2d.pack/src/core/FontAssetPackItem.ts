/// <reference path="./AssetPackItem.ts" />

namespace phasereditor2d.pack.core {

    import controls = colibri.ui.controls;

    export class FontAssetPackItem extends AssetPackItem {

        constructor(pack: AssetPack, data: any) {
            super(pack, data);
        }

        async preload(): Promise<controls.PreloadResult> {

            // Code taken from Phaser code: https://github.com/phaserjs/phaser/blob/97e3e67ac679863e30d4225d2b29a49a6f0de3e9/src/loader/filetypes/FontFile.js#L89
            const key = this.getKey();
            const fontSet = document.fonts;
            
            // Check if font is already loaded
            let fontAlreadyLoaded = false;
            try {
                for (const f of (fontSet as any)) {
                    if (f.family === key) {
                        fontAlreadyLoaded = true;
                        break;
                    }
                }
            } catch (e) {
                // FontFaceSet might not be iterable in some environments
            }
            if (fontAlreadyLoaded) {
                return controls.Controls.resolveNothingLoaded();
            }
            
            let font;
            const { url, format, descriptors } = this.getData();
            const file = this.getFileFromAssetUrl(url);
            if (file) {
                const publicUrl = file.getUrl();
                const source = `url(${publicUrl}) format("${format}")`;
                if (descriptors) {
                    console.log("Font descriptors", descriptors);
                    font = new FontFace(key, source, descriptors);
                }
                else {
                    font = new FontFace(key, source);
                }
                try {
                    await font.load();
                    (fontSet as any).add(font);
                    console.log("Font loaded", key, source);
                    document.body.classList.add("fonts-loaded");
                    return controls.Controls.resolveResourceLoaded();
                }
                catch (e) {
                    console.error("Error loading font", source, e);
                }
            }
            else {
                console.error("Font file not found", url);
            }
            return controls.Controls.resolveNothingLoaded();
        }
    }
}