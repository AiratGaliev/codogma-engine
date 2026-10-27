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

            console.log("VideoImage.preload " + this._file.getName());

            const video = document.createElement("video");

            video.setAttribute("playsinline", "playsinline");
            video.setAttribute("preload", "auto");
            video.setAttribute("disablePictureInPicture", "true");
            video.setAttribute("autoplay", "autoplay");
            video.muted = true;
            video.defaultMuted = true;

            return new Promise<controls.PreloadResult>((resolve, reject) => {

                video.addEventListener("loadeddata", () => {

                    const canvas = this.getImageElement() as HTMLCanvasElement;

                    const ctx = canvas.getContext("2d");

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    video.pause();
                    video.removeAttribute("src");
                    video.load();

                    resolve(controls.PreloadResult.RESOURCES_LOADED);
                });

                video.addEventListener("error", () => {

                    resolve(controls.PreloadResult.NOTHING_LOADED);
                });

                const url = this._file.getExternalUrl();

                video.src = url;

                video.play();
            });
        }
    }
}
