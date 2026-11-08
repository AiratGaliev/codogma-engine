namespace phasereditor2d.scene.ui {

    import controls = colibri.ui.controls;

    export class VideoThumbnailCache extends ThumbnailCache<colibri.core.io.FilePath> {

        private static _instance: VideoThumbnailCache;

        static getInstance() {

            if (!this._instance) {

                this._instance = new VideoThumbnailCache();
            }

            return this._instance;
        }

        constructor() {

            super("phasereditor2d.scene.ui.VideoThumbnailCache");
        }

        createObjectImage(obj: colibri.core.io.FilePath): controls.IImage {

            return new VideoImage(obj);
        }

        protected getHTMLElementFromImage(image: controls.IImage): HTMLElement {

            return (image as any).getImageElement?.() as HTMLElement;
        }

        protected computeObjectHash(obj: colibri.core.io.FilePath): string {

            return `${obj.getFullName()}#${obj.getModTime()}`;
        }

        protected computeObjectKey(obj: colibri.core.io.FilePath): string {

            return obj.getFullName();
        }
    }
}