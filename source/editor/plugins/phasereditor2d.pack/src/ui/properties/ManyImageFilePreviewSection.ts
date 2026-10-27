namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;
    import ide = colibri.ui.ide;
    import io = colibri.core.io;
    import webContentTypes = phasereditor2d.webContentTypes;

    class GridImageFileViewer extends controls.viewers.TreeViewer {

        constructor(...classList: string[]) {

            super("phasereditor2d.blocks.ui.properties.GridImageFileViewer", ...classList);

            this.setContentProvider(new controls.viewers.ArrayTreeContentProvider());

            this.setLabelProvider(new phasereditor2d.files.ui.viewers.FileLabelProvider());

            this.setCellRendererProvider(new phasereditor2d.files.ui.viewers.FileCellRendererProvider("grid"));

            this.setTreeRenderer(new controls.viewers.GridTreeViewerRenderer(this, false, true)
                .setPaintItemShadow(true));
        }
    }

    export class ManyImageFilePreviewSection extends controls.properties.PropertySection<any> {

        constructor(page: controls.properties.PropertyPage) {

            super(page, "phasereditor2d.blocks.ui.properties.ManyImageFilePreviewSection", "Images", true);
        }

        createForm(parent: HTMLDivElement) {

            parent.classList.add("ManyImagePreviewFormArea");

            const viewer = new GridImageFileViewer();

            const filteredViewer = new ide.properties.FilteredViewerInPropertySection(
                this.getPage(), viewer, true);

            parent.appendChild(filteredViewer.getElement());

            this.addUpdater(() => {

                // clean the viewer first
                viewer.setInput([]);
                viewer.repaint();
                viewer.setInput(this.getSelection());
                filteredViewer.resizeTo();
            });
        }

        static canEditFile(obj: any): boolean {

            try {

                if (obj instanceof io.FilePath) {

                    const contentType = ide.Workbench.getWorkbench().getContentTypeRegistry()
                        .getCachedContentType(obj);

                    if (contentType === webContentTypes.core.CONTENT_TYPE_IMAGE
                        || contentType === webContentTypes.core.CONTENT_TYPE_SVG) {

                        const filesInPacks = new Set<io.FilePath>();

                        const finder = AssetPackPlugin.getInstance().buildSyncPackFinder();

                        finder.getPacks().flatMap(pack => pack.getItems())
                            .filter(item => item instanceof core.ImageAssetPackItem
                                || item instanceof core.BaseAtlasAssetPackItem)
                            .filter(item => item.computeUsedFiles(filesInPacks));

                        return !filesInPacks.has(obj);
                    }
                }

            } catch (e) {

                console.log(e);
            }

            return false;
        }

        canEdit(obj: any, n: number): boolean {

            return ManyImageFilePreviewSection.canEditFile(obj);
        }

        canEditNumber(n: number): boolean {

            return n > 1;
        }
    }
}
