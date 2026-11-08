namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;

    export class ImportedImageFilesPreviewSection extends colibri.ui.ide.properties.BaseManyImagePreviewSection<any> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.properties.ImagePreviewSection", "Assets Preview", true);
        }

        protected async getViewerInput() {

            const finder = new core.PackFinder();

            await finder.preload();

            const frames = new Set<any>();

            for (const file of this.getSelection()) {

                const items = await finder.findPackItemsFor(file);

                for (const item of items) {

                    if (item instanceof core.ImageFrameContainerAssetPackItem) {

                        await item.preload();

                        for (const frame of item.getFrames()) {

                            frames.add(frame);
                        }
                    }
                }
            }

            return [...frames];
        }

        protected prepareViewer(viewer: controls.viewers.TreeViewer) {

            viewer.setLabelProvider(new viewers.AssetPackLabelProvider());
            viewer.setCellRendererProvider(new viewers.AssetPackCellRendererProvider("grid"));
        }

        canEdit(obj: any, n: number): boolean {

            if (obj instanceof io.FilePath) {

                const editor = colibri.Platform.getWorkbench().getActiveEditor();

                if (editor && !editor["allowImagePreviewAssetsInInspector"]) {

                    return false;
                }

                const ct = colibri.Platform.getWorkbench().getContentTypeRegistry().getCachedContentType(obj);

                if (ct === webContentTypes.core.CONTENT_TYPE_IMAGE
                    || ct === core.contentTypes.CONTENT_TYPE_ATLAS
                    || ct === core.contentTypes.CONTENT_TYPE_MULTI_ATLAS
                    || ct === core.contentTypes.CONTENT_TYPE_ATLAS_XML
                    || ct === core.contentTypes.CONTENT_TYPE_UNITY_ATLAS) {

                    const filesInPacks = new Set<io.FilePath>();

                    const finder = AssetPackPlugin.getInstance().buildSyncPackFinder();

                    finder.getPacks().flatMap(pack => pack.getItems())
                        .filter(item => item instanceof core.ImageAssetPackItem || item instanceof core.BaseAtlasAssetPackItem)
                        .filter(item => item.computeUsedFiles(filesInPacks));

                    return filesInPacks.has(obj);
                }
            }

            return false;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
