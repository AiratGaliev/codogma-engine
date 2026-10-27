namespace phasereditor2d.scene.ui {

    import controls = colibri.ui.controls;
    import core = colibri.core;

    const localForage = window["localforage"] as LocalForage;

    export abstract class ThumbnailCache<TObject> extends core.io.ContentCache<TObject, controls.IImage> {

        private _database: LocalForage;

         async clearCache() {

            await this._database?.clear();
        }

        constructor(dbName: string) {
            super(async (file, force) => {

                this._database = localForage.createInstance({
                    name: dbName,
                    driver: localForage.INDEXEDDB
                });

                const db = this._database;

                const objKey = this.computeObjectKey(file);

                const imageKey = objKey + "@image";
                const hashKey =  objKey + "@modTime";

                const currentHash = this.computeObjectHash(file);

                if (!force) {

                    try {

                        const blob = await db.getItem(imageKey) as Blob;
                        const savedFileTime = await db.getItem(hashKey) as string;

                        if (blob) {

                            if (currentHash === savedFileTime) {

                                const imgElement = controls.Controls.createImageFromBlob(blob);

                                await new Promise<void>((resolve, reject) => {

                                    imgElement.addEventListener("load", () => resolve(), { once: true });
                                    imgElement.addEventListener("error", () => reject(new Error("Unable to load cached thumbnail")), { once: true });
                                });

                                return new controls.ImageWrapper(imgElement);
                            }
                        }

                    } catch (error) {

                        console.log(error);
                    }
                }

                const image = this.createObjectImage(file);

                const preloadResult = await image.preload();
                const element = (image as any).getImageElement?.();

                // Do not persist blank/error thumbnails (for example, a video
                // whose codec is unsupported) as a valid cache entry.
                if (preloadResult === controls.PreloadResult.RESOURCES_LOADED && element) {

                    const newBlob = await controls.Controls.createBlobFromImage(element);

                    try {

                        await db.setItem(imageKey, newBlob);
                        await db.setItem(hashKey, currentHash);

                    } catch (error) {

                        // Cache persistence is optional; keep the generated
                        // thumbnail usable when IndexedDB is unavailable/full.
                        console.warn("Unable to persist thumbnail cache:", error);
                    }
                }

                return image;
            });
        }

        abstract createObjectImage(obj: TObject): controls.IImage;
    }
}