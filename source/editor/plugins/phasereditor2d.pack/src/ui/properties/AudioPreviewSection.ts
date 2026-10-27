namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;

    export class AudioPreviewSection extends controls.properties.PropertySection<any> {

        private _audioElement: HTMLAudioElement;

        constructor(page: controls.properties.PropertyPage) {
            super(page, "pack.AudioPreviewSection", "Audio Preview", false, false);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 1);

            const audioElement = document.createElement("audio");
            audioElement.setAttribute("controls", "true");
            audioElement.style.width = "100%";
            comp.appendChild(audioElement);

            this.addUpdater(() => {
                const url = this.getSelectedAudioUrl();

                if (url) {
                    audioElement.src = url;
                } else {
                    audioElement.removeAttribute("src");
                }

                audioElement.load();
            });

            this._audioElement = audioElement;
        }

        onSectionHidden(): void {
            super.onSectionHidden();

            if (this._audioElement) {
                this._audioElement.removeAttribute("src");
                this._audioElement.load();
            }
        }

        private getSelectedAudioUrl(): string | null {

            const obj = this.getSelectionFirstElement();

            if (obj instanceof io.FilePath) {

                return obj.getUrl();
            }

            if (obj instanceof core.AudioAssetPackItem) {

                const value: unknown = obj.getData()?.url;
                const urls = typeof value === "string"
                    ? [value]
                    : Array.isArray(value) ? value : [];

                for (const url of urls) {

                    if (typeof url !== "string" || url.trim().length === 0) {

                        continue;
                    }

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

                return ct === webContentTypes.core.CONTENT_TYPE_AUDIO;
            }

            return obj instanceof core.AudioAssetPackItem;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}
