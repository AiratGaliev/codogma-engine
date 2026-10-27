namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;

    export class VideoPreviewSection extends controls.properties.PropertySection<any> {

        private _videoElement: HTMLVideoElement;

        constructor(page: controls.properties.PropertyPage) {
            super(page, "pack.VideoPreviewSection", "Video Preview", true, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 1);

            const videoElement = document.createElement("video");
            videoElement.setAttribute("controls", "true");
            videoElement.style.width = "100%";
            videoElement.style.height = "100%";
            comp.appendChild(videoElement);

            this.addUpdater(() => {
                videoElement.src = this.getSelectedVideoUrl();
                videoElement.load();
            });

            this._videoElement = videoElement;
        }

        onSectionHidden(): void {
            super.onSectionHidden();

            if (this._videoElement) {
                this._videoElement.src = "";
                this._videoElement.load();
            }
        }

        private getSelectedVideoUrl(): string {

            const obj = this.getSelectionFirstElement();

            if (obj instanceof io.FilePath) {

                return obj.getUrl();
            }

            if (obj instanceof core.VideoAssetPackItem) {

                const url = obj.getData()?.url as string;

                if (url) {

                    const file = core.AssetPackUtils.getFileFromPackUrl(obj.getPack(), url);

                    if (file) {
                        return file.getUrl();
                    }
                }
            }

            return null;
        }

        canEdit(obj: any): boolean {

            if (obj instanceof io.FilePath) {

                const ct = colibri.Platform.getWorkbench()
                    .getContentTypeRegistry().getCachedContentType(obj);

                return ct === webContentTypes.core.CONTENT_TYPE_VIDEO;
            }

            return obj instanceof core.VideoAssetPackItem;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}
