namespace phasereditor2d.files.ui.dialogs {

    import controls = colibri.ui.controls;
    import ide = colibri.ui.ide;
    import io = colibri.core.io;
    import viewers = ui.viewers;
    import blocks = phasereditor2d.blocks;

    export class FileInfo {

        file: File;
        fullPath: string;

        constructor(file: File, fullPath: string) {

            this.file = file;
            this.fullPath = fullPath;
        }
    }

    export class UploadUtils {

        static installGlobalHandler() {

            const dropArea = document;

            const isDroppingFiles = (e: DragEvent) => {

                return e.dataTransfer.files && e.dataTransfer.files.length > 0;
            };

            const preventDefaults = (e: DragEvent) => {

                e.preventDefault();
                e.stopPropagation();
            };

            ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {

                dropArea.addEventListener(eventName, preventDefaults, false);
            });

            dropArea.addEventListener("drop", e => {

                if (colibri.Platform.getWorkbench().getActiveDialog()) {

                    return;
                }

                if (isDroppingFiles(e)) {

                    UploadUtils.onDropFiles(e);
                }
            });
        }

        static findParentFolder() {

            const root = colibri.Platform.getWorkbench().getProjectRoot();

            const lastFolderName = window.localStorage.getItem(
                `phasereditor2d.files.ui.dialogs.UploadUtils.lastFolder#${root.getName()}`);

            if (lastFolderName) {

                const folder = colibri.ui.ide.FileUtils.getFileFromPath(lastFolderName);

                if (folder) {

                    return folder;
                }
            }

            return root;
        }

        static rememberParentFolder(folder: io.FilePath) {

            const root = colibri.Platform.getWorkbench().getProjectRoot();

            window.localStorage.setItem(
                `phasereditor2d.files.ui.dialogs.UploadUtils.lastFolder#${root.getName()}`,
                folder.getFullName());
        }

        static async onDropFiles(e: DragEvent) {

            const dropEventFiles = await UploadUtils.getFilesFromDragEvent(e);

            const viewer = new controls.viewers.TreeViewer("phasereditor2d.files.ui.dialogs.UploadUtils");

            viewer.setStyledLabelProvider(new viewers.StyledFileLabelProvider());
            viewer.setContentProvider(new viewers.FileTreeContentProvider(true));
            viewer.setCellRendererProvider(new viewers.FileCellRendererProvider());
            viewer.setInput(colibri.Platform.getWorkbench().getProjectRoot());

            const dlg = new controls.dialogs.ViewerDialog(viewer, true);

            dlg.create();
            dlg.setTitle("Select Destination Folder");

            viewer.eventOpenItem.addListener(sel => {

                const folder = sel as io.FilePath;

                UploadUtils.uploadFiles(folder, dropEventFiles);
            });

            dlg.addOpenButton("Select", async (sel: io.FilePath[]) => {

                const folder = sel[0];

                UploadUtils.uploadFiles(folder, dropEventFiles);
            }, false);

            dlg.addCancelButton();

            const dropFolder = UploadUtils.findParentFolder();

            viewer.revealAndSelect(dropFolder);
        }

        static async getFilesFromDragEvent(e: DragEvent) {

            const files: FileInfo[] = [];

            const entries = [];

            for (let i = 0; i < e.dataTransfer.items.length; i++) {

                const item = e.dataTransfer.items[i];

                if (item.kind === "file") {

                    const entry = item.webkitGetAsEntry() as any;

                    if (entry) {

                        entries.push(entry);

                    } else {

                        const file = item.getAsFile();

                        if (file) {
                            files.push(new FileInfo(file, file.name));
                        }
                    }
                }
            }

            for (const entry of entries) {

                try {
                    await UploadUtils.readFileEntry(entry, files);
                } catch (error) {
                    console.error("Не удалось прочитать файл при перетаскивании:", entry.fullPath, error);
                }
            }

            return files;
        }

        static async readFileEntry(entry: any, files: FileInfo[]) {

            if (entry.isFile) {

                console.log("Reading file entry: " + entry.fullPath);

                const entryFile = entry;

                const file = await new Promise<File>((resolve, reject) => {

                    entryFile.file((file: File) => resolve(file), reject);
                });

                files.push(new FileInfo(file, entry.fullPath));

            } else {

                const entryDir = entry;

                console.log("Reading dir entry: " + entry.fullPath);

                // DirectoryReader выдаёт содержимое каталога частями.
                const reader = entryDir.createReader();

                while (true) {

                    const children = await new Promise<any[]>((resolve, reject) => {
                        reader.readEntries((entries: any[]) => resolve(entries), reject);
                    });

                    if (children.length === 0) {
                        break;
                    }

                    for (const child of children) {

                        try {
                            await UploadUtils.readFileEntry(child, files);
                        } catch (error) {
                            console.error("Не удалось прочитать вложенный файл:", child.fullPath, error);
                        }
                    }
                }
            }
        }

        static getFilesFromFileList(fileList: FileList | null) {

            const files: File[] = [];

            if (!fileList) {

                return files;
            }

            for (let i = 0; i < fileList.length; i++) {

                const file = fileList.item(i);

                if (file) {

                    files.push(file);
                }
            }

            return files;
        }

        static async uploadFiles(uploadFolder: io.FilePath, files: FileInfo[]) {

            if (!uploadFolder || files.length === 0) {

                return;
            }

            const cancelFlag = {
                canceled: false
            };

            const dlg = new controls.dialogs.ProgressDialog();

            dlg.create();
            dlg.setTitle("Adding files");
            dlg.setCloseWithEscapeKey(false);

            {
                const btn = dlg.addButton("Cancel", () => {

                    if (cancelFlag.canceled) {

                        return;
                    }

                    cancelFlag.canceled = true;

                    btn.innerText = "Canceling";
                });
            }

            dlg.setProgress(0);

            const ioFiles: io.FilePath[] = [];

            let i = 0;

            for (const fileInfo of files) {

                if (cancelFlag.canceled) {

                    dlg.close();

                    break;
                }

                try {

                    let fullPath = fileInfo.fullPath;

                    if (fullPath.startsWith("/")) {

                        fullPath = fullPath.substring(1);
                    }

                    const dirs = fullPath.replace(/\\/g, "/").split("/");

                    dirs.pop();

                    let currentParent = uploadFolder;

                    for (const dirname of dirs) {

                        const child = currentParent.getFile(dirname);

                        if (child) {

                            currentParent = child;

                        } else {

                            currentParent = await colibri.ui.ide.FileUtils.createFolder_async(currentParent, dirname);
                        }
                    }

                    const ioFile = await colibri.ui.ide.FileUtils.uploadFile_async(currentParent, fileInfo.file);

                    ioFiles.push(ioFile);

                } catch (error) {

                    console.error("Не удалось загрузить файл:", fileInfo.fullPath, error);
                }

                i++;

                dlg.setProgress(i / files.length);
            }

            dlg.close();

            if (ioFiles.length > 0) {

                const wb = colibri.ui.ide.Workbench.getWorkbench();

                for (const file of ioFiles) {

                    await wb.getContentTypeRegistry().preload(file);
                }

                const view = wb.getActiveWindow().getView(phasereditor2d.files.ui.views.FilesView.ID) as ui.views.FilesView;

                view.getViewer().setSelection(ioFiles);
                view.getViewer().reveal(ioFiles[0]);

                // hum.. ugly, but needed.

                setTimeout(() => {

                    view.getViewer().reveal(ioFiles[0]);
                }, 10);

                wb.setActivePart(view);
            }

            blocks.BlocksPlugin.getInstance().refreshBlocksView();

            UploadUtils.rememberParentFolder(uploadFolder);
        }

        static browseFilesFromPCAndUpload(folder: io.FilePath) {

            const input = document.createElement("input");

            input.type = "file";
            input.multiple = true;
            input.click();

            input.addEventListener("change", e => {

                const domFiles = input.files;

                const files = UploadUtils.getFilesFromFileList(domFiles)
                    .map(file => new FileInfo(file, file.name));

                UploadUtils.uploadFiles(folder, files);
            });
        }
    }
}
