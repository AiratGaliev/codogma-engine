namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;
    import ide = colibri.ui.ide;
    import io = colibri.core.io;
    import webContentTypes = phasereditor2d.webContentTypes;

    export class ImageFilePreviewSection extends controls.properties.PropertySection<any> {

        constructor(page: controls.properties.PropertyPage) {

            super(page, "phasereditor2d.blocks.ui.properties.ImagePreviewSection", "Image", true);
        }

        createForm(parent: HTMLDivElement) {

            parent.classList.add("ImagePreviewFormArea");

            const imgControl = new controls.ImageControl(ide.IMG_SECTION_PADDING);

            this.getPage().eventControlLayout.addListener(() => {

                imgControl.resizeTo();
            });

            parent.appendChild(imgControl.getElement());

            requestAnimationFrame(() => imgControl.resizeTo());

            this.addUpdater(async () => {

                const file = this.getSelection()[0] as io.FilePath;

                const img = ide.Workbench.getWorkbench().getFileImage(file);

                await img.preload();

                imgControl.setImage(img);

                setTimeout(() => imgControl.resizeTo(), 50);
            });
        }

        canEdit(obj: any, n: number): boolean {

            return ManyImageFilePreviewSection.canEditFile(obj);
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
