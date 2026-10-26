/// <reference path="../LoaderUpdaterExtension.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class VideoLoaderUpdater extends LoaderUpdaterExtension {

        clearCache(scene: BaseScene): void {

            const keys = scene.cache.video.getKeys();

            for (const key of keys) {

                scene.cache.video.remove(key);
            }
        }

        acceptAsset(asset: any): boolean {

            return asset instanceof pack.core.VideoAssetPackItem;
        }

        async updateLoader(scene: BaseScene, asset: any) {

            const item = asset as pack.core.VideoAssetPackItem;

            await item.preload();

            const url = item.getData()["url"] as string;

            if (!url) {

                return;
            }

            const key = item.getKey();

            if (scene.cache.video.exists(key)) {

                return;
            }

            const file = pack.core.AssetPackUtils.getFileFromPackUrl(item.getPack(), url);

            if (!file) {

                return;
            }

            const loader = scene.load;

            loader.video(key, file.getUrl());

            await new Promise<void>((resolve) => {

                loader.once("complete", () => resolve());
            });
        }

        async updateLoaderWithObjData(scene: BaseScene, data: core.json.IObjectData): Promise<void> {

            const serializer = new core.json.Serializer(data);

            const type = serializer.getType();

            if (type === VideoExtension.getInstance().getTypeName()) {

                const url = serializer.read(VideoComponent.url.name, "");

                if (url && !VideoComponent.isURL(url)) {

                    // the url is the key of a video asset in an asset pack

                    const finder = scene.getMaker().getPackFinder();

                    const asset = finder.findAssetPackItem(url);

                    if (asset && this.acceptAsset(asset)) {

                        await this.updateLoader(scene, asset);
                    }
                }
            }
        }
    }
}
