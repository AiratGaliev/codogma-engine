namespace colibri.ui.ide.properties {

    export abstract class BaseImagePreviewSection<T> extends controls.properties.PropertySection<T> {

        private _imageControl: controls.ImageControl;

        static createSectionForm(
            parent: HTMLElement, section: controls.properties.PropertySection<any>,
            getImage: () => Promise<controls.IImage> | controls.IImage): controls.ImageControl {

            parent.classList.add("ImagePreviewFormArea");

            const imgControl = new controls.ImageControl(ide.IMG_SECTION_PADDING);

            section.getPage().eventControlLayout.addListener(() => {

                imgControl.resizeTo();
            });

            parent.appendChild(imgControl.getElement());

            requestAnimationFrame(() => imgControl.resizeTo());

            section.addUpdater(async () => {

                const img = await getImage();

                imgControl.setImage(img);

                requestAnimationFrame(() => imgControl.resizeTo());
            });

            return imgControl;
        }

        createForm(parent: HTMLDivElement) {

            this._imageControl = BaseImagePreviewSection.createSectionForm(parent, this, () => this.getSelectedImage());
        }

        protected getImageControl() {

            return this._imageControl;
        }

        protected abstract getSelectedImage(): Promise<controls.IImage> | controls.IImage;

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
