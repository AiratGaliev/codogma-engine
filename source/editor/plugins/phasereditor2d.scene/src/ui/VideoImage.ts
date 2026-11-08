namespace phasereditor2d.scene.ui {

    import controls = colibri.ui.controls;

    export class VideoImage extends controls.ImageWrapper {

        static createCanvas(): HTMLCanvasElement {

            const canvas = document.createElement("canvas");

            canvas["width"] = 1280;
            canvas["height"] = 720;

            return canvas;
        }

        private _file: colibri.core.io.FilePath;

        constructor(file: colibri.core.io.FilePath) {

            super(VideoImage.createCanvas());

            this._file = file;
        }

        async preload(): Promise<controls.PreloadResult> {

            const video = document.createElement("video");

            video.setAttribute("playsinline", "playsinline");
            video.preload = "auto";
            video.setAttribute("disablePictureInPicture", "true");
            video.muted = true;
            video.defaultMuted = true;

            return new Promise<controls.PreloadResult>(resolve => {

                const cleanup = () => {

                    video.removeEventListener("loadeddata", onLoadedData);
                    video.removeEventListener("error", onError);
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                };

                const finish = (result: controls.PreloadResult) => {

                    cleanup();
                    resolve(result);
                };

                const onLoadedData = () => {

                    try {

                        const canvas = this.getImageElement() as HTMLCanvasElement;
                        const ctx = canvas.getContext("2d");

                        if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {

                            finish(controls.PreloadResult.NOTHING_LOADED);

                            return;
                        }

                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                        finish(controls.PreloadResult.RESOURCES_LOADED);

                    } catch (error) {

                        console.error("Unable to create video thumbnail:", this._file.getName(), error);
                        finish(controls.PreloadResult.NOTHING_LOADED);
                    }
                };

                const onError = () => finish(controls.PreloadResult.NOTHING_LOADED);

                video.addEventListener("loadeddata", onLoadedData, { once: true });
                video.addEventListener("error", onError, { once: true });

                const url = this._file.getExternalUrl();

                if (!url) {

                    finish(controls.PreloadResult.NOTHING_LOADED);

                    return;
                }

                video.src = url;
                video.load();
            });
        }
    }
}
