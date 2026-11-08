namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class FontLoaderUpdater extends LoaderUpdaterExtension {

        clearCache(scene: BaseScene) {
            // fonts are not cached in Phaser
        }

        acceptAsset(asset: any): boolean {
            return asset instanceof phasereditor2d.pack.core.FontAssetPackItem;
        }

        async updateLoader(scene: BaseScene, asset: phasereditor2d.pack.core.FontAssetPackItem) {
            await asset.preload();
        }

        async updateLoaderWithObjData(scene: BaseScene, data: any) {
            const serializer = new core.json.Serializer(data);
            const type = serializer.getType();
            if (type === TextExtension.getInstance().getTypeName()) {
                const font = serializer.read(TextComponent.fontFamily.name, "");
                if (font) {
                    const finder = scene.getMaker().getPackFinder();
                    const asset = finder.findAssetPackItem(font);
                    if (asset && asset instanceof phasereditor2d.pack.core.FontAssetPackItem) {
                        await this.updateLoader(scene, asset);
                    }
                }
            }
        }
    }
}