/// <reference path="./ThumbnailCache.ts"/>

namespace phasereditor2d.scene.ui {

    import controls = colibri.ui.controls;
    import pack = phasereditor2d.pack;

    export class SpineThumbnailCache extends ThumbnailCache<pack.core.SpineSkinItem> {

        constructor() {
            super("phasereditor2d.scene.ui.SpineThumbnailCache");
        }

        createObjectImage(obj: pack.core.SpineSkinItem): controls.IImage {

            return ScenePlugin.getInstance().buildSpineSkinThumbnailImage(obj);
        }

        protected computeObjectHash(obj: pack.core.SpineSkinItem): string {

            return obj.computeHash();
        }

        protected computeObjectKey(obj: pack.core.SpineSkinItem): string {

            const { spineAsset, spineAtlasAsset, skinName } = obj;

            return spineAsset.getPack().getFile().getFullName()
                + "+" + spineAsset.getKey()
                + "+" + spineAtlasAsset.getKey()
                + "+" + skinName;
        }
    }
}