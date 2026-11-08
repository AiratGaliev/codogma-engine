namespace phasereditor2d.files.ui.dialogs {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;

    export class UploadDialog extends controls.dialogs.ViewerDialog {

        private _uploadFolder: io.FilePath;
        private _uploadBtnElement: HTMLButtonElement;
        private _uploadStatusElement: HTMLDivElement;

        constructor(uploadFolder: io.FilePath) {
            super(new controls.viewers.TreeViewer("phasereditor2d.files.ui.dialogs.UploadDialog"), false);

            this._uploadFolder = uploadFolder;
        }

        async create() {

            const filesViewer = this.getViewer();
            filesViewer.setLabelProvider(new viewers.InputFileLabelProvider());
            filesViewer.setCellRendererProvider(new viewers.InputFileCellRendererProvider());
            filesViewer.setContentProvider(new controls.viewers.ArrayTreeContentProvider());
            filesViewer.setInput([]);

            const dropArea = filesViewer.getElement();
            this._uploadStatusElement = document.createElement("div");
            this._uploadStatusElement.setAttribute("role", "status");
            this._uploadStatusElement.setAttribute("aria-live", "polite");
            dropArea.appendChild(this._uploadStatusElement);

            const preventDefaults = (e: Event) => {

                e.preventDefault();
                e.stopPropagation();
            };

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {

                dropArea.addEventListener(eventName, preventDefaults, false);
            });

            dropArea.addEventListener("dragenter", e => {

                dropArea.classList.add("FilesDragEnter");
            });

            dropArea.addEventListener("dragleave", e => {

                dropArea.classList.remove("FilesDragEnter");
            });

            filesViewer.getElement().addEventListener("drop", e => {

                dropArea.classList.remove("FilesDragEnter");
                this.prepareFilesForUpload(e.dataTransfer.files);
            });

            super.create();

            const filesInputElement = document.createElement("input");

            this.setTitle("Upload Files");

            this._uploadBtnElement = super.addButton("Upload", () => { /* delegated below */ });
            this._uploadBtnElement.disabled = true;
            this._uploadBtnElement.innerText = "Upload";
            this._uploadBtnElement.addEventListener("click", async () => {
                await this.uploadSelectedFiles_async(filesViewer);
            });

            super.addButton("Browse", () => {

                filesInputElement.click();
            });

            filesInputElement.type = "file";
            filesInputElement.name = "files";
            filesInputElement.multiple = true;
            filesInputElement.addEventListener("change", e => {

                const files = filesInputElement.files;

                this.prepareFilesForUpload(files);
            });

            super.addButton("Cancel", () => this.close());
        }

        private async uploadSelectedFiles_async(filesViewer: controls.viewers.TreeViewer): Promise<void> {

            const input = filesViewer.getInput() as File[];
            const files = input.slice();

            if (files.length === 0) {
                return;
            }

            const cancelFlag = { canceled: false };
            const dlg = new controls.dialogs.ProgressDialog();
            dlg.create();
            dlg.setTitle("Uploading");
            dlg.setCloseWithEscapeKey(false);

            const cancelButton = dlg.addButton("Cancel", () => {
                if (!cancelFlag.canceled) {
                    cancelFlag.canceled = true;
                    cancelButton.innerText = "Canceling";
                }
            });

            dlg.setProgress(0);

            const uploadedFiles: io.FilePath[] = [];
            const errors: string[] = [];
            let processed = 0;

            try {
                for (const file of files) {
                    if (cancelFlag.canceled) {
                        break;
                    }

                    try {
                        const ioFile = await colibri.ui.ide.FileUtils.uploadFile_async(this._uploadFolder, file);
                        uploadedFiles.push(ioFile);

                        const index = input.indexOf(file);
                        if (index >= 0) {
                            input.splice(index, 1);
                        }
                    } catch (error) {
                        errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
                    }

                    processed++;
                    filesViewer.setInput(input);
                    filesViewer.repaint();
                    dlg.setProgress(processed / files.length);
                }
            } finally {
                dlg.close();
            }

            if (uploadedFiles.length > 0) {
                const wb = colibri.ui.ide.Workbench.getWorkbench();

                for (const file of uploadedFiles) {
                    try {
                        await wb.getContentTypeRegistry().preload(file);
                    } catch (error) {
                        errors.push(`${file.getName()}: файл загружен, но не удалось обновить его content type: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }

                const view = wb.getActiveWindow()
                    .getView(views.FilesView.ID) as views.FilesView;

                view.getViewer().setSelection(uploadedFiles);
                view.getViewer().reveal(uploadedFiles[0]);
                view.getViewer().repaint();

                blocks.BlocksPlugin.getInstance().refreshBlocksView();
            }

            if (cancelFlag.canceled) {
                errors.push("Загрузка отменена; необработанные файлы оставлены в очереди.");
            }

            this._uploadStatusElement.textContent = errors.length > 0
                ? errors.join(" ")
                : "";

            this._uploadBtnElement.disabled = input.length === 0;
            this._uploadBtnElement.textContent = input.length === 0
                ? "Upload"
                : `Upload ${input.length} Files`;

            if (input.length === 0 && errors.length === 0) {
                this.close();
            }
        }

        private prepareFilesForUpload(files: FileList | null) {

            if (!files) {
                return;
            }

            const newFiles: File[] = [];

            for (let i = 0; i < files.length; i++) {

                const file = files.item(i);

                if (file) {
                    newFiles.push(file);
                }
            }

            const input = this.getViewer().getInput() as any[];

            input.push(...newFiles);

            this.getViewer().setInput(input);

            this.getViewer().repaint();

            this._uploadBtnElement.disabled = input.length === 0;

            this._uploadBtnElement.textContent = input.length === 0 ? "Upload" : "Upload " + input.length + " Files";
        }
    }
}