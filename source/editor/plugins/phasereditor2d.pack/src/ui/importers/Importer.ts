/// <reference path="../../core/SpriteAssetMetadata.ts" />

namespace phasereditor2d.pack.ui.importers {

    import io = colibri.core.io;
    import ide = colibri.ui.ide;

    export abstract class Importer {

        private _type: string;
        private _multipleFiles: boolean;

        constructor(type: string) {
            this._type = type;
            this._multipleFiles = false;
        }

        isMultipleFiles() {

            return this._multipleFiles;
        }

        setMultipleFiles(multipleFiles: boolean) {

            this._multipleFiles = multipleFiles;
        }

        getType() {
            return this._type;
        }

        abstract acceptFile(file: io.FilePath): boolean;

        abstract createItemData(pack: core.AssetPack, file: io.FilePath | io.FilePath[]);

        async autoImport(pack: core.AssetPack, files: io.FilePath[]) {

            if (!files || files.length === 0) {
                return [];
            }

            const imported: core.AssetPackItem[] = [];

            try {
                if (this.isMultipleFiles()) {
                    imported.push(await this.importMultipleFiles(pack, files));
                } else {
                    for (const file of files) {
                        imported.push(await this.importFile(pack, file));
                    }
                }

                return imported;
            } catch (error) {
                // Batch import атомарен относительно Asset Pack: частичный результат не остаётся в проекте.
                for (const item of imported) {
                    pack.deleteItem(item);
                    item.resetCache();
                }

                throw error;
            }
        }

        async importFile(pack: core.AssetPack, file: io.FilePath | io.FilePath[]): Promise<core.AssetPackItem> {

            const data = this.createItemData(pack, file);

            const firstFile = Array.isArray(file) ? file[0] : file;

            data.type = this.getType();
            
            const computer = new ide.utils.NameMaker(i => i.getKey());

            computer.update(pack.getItems());

            const baseKey = this.computeItemFromKey(firstFile);

            const key = computer.makeName(baseKey);

            data.key = key;

            const item = pack.createPackItem(data);

            pack.addItem(item);

            try {
                await item.preload();

                const finder = new core.PackFinder();
                await finder.preload();

                await item.build(finder);
                this.initializeSpriteMetadata(item);

                return item;
            } catch (error) {
                pack.deleteItem(item);
                item.resetCache();
                throw error;
            }
        }

        protected computeItemFromKey(file: io.FilePath) {

            return file.getNameWithoutExtension();
        }

        private initializeSpriteMetadata(item: core.AssetPackItem) {

            if (!(item instanceof core.ImageFrameContainerAssetPackItem)) {
                return;
            }

            const data = item.getData();
            const url = data.url;
            const file = typeof url === "string" ? item.getFileFromAssetUrl(url) : null;

            if (!file) {
                return;
            }

            data[core.SpriteAssetMetadata.DATA_KEY] = core.SpriteAssetMetadata.ensure(
                data,
                file,
                core.SpriteAssetMetadata.describeFrames(item.getFrames())
            );
        }

        /**
         * Повторно читает текущий source file и обновляет производные данные.
         * Ключ, import settings и существующая пользовательская metadata сохраняются.
         */
        async reimportItem(pack: core.AssetPack, item: core.AssetPackItem): Promise<void> {

            if (item.getType() !== this.getType()) {
                throw new Error("Importer type does not match the selected Asset Pack item.");
            }

            const previousData = JSON.parse(JSON.stringify(item.getData()));
            const sourceUrl = previousData.url;

            if (typeof sourceUrl !== "string" || !sourceUrl) {
                throw new Error("Reimport requires a single project-relative source URL.");
            }

            const sourceFile = item.getFileFromAssetUrl(sourceUrl);

            if (!sourceFile || !sourceFile.isFile()) {
                throw new Error("The original source file is missing from the current project.");
            }

            const importedData = this.createItemData(pack, sourceFile);
            const nextData = Object.assign({}, importedData, previousData, {
                type: previousData.type,
                key: previousData.key,
                url: importedData.url
            });

            try {
                item.setData(nextData);
                item.resetCache();

                await item.preload();

                // Image/Spritesheet AssetPackItems не строят зависимости от других entries.
                // Не перечитываем все сохранённые packs: активный pack может содержать unsaved edits.
                await item.build(new core.PackFinder(pack));

                if (item instanceof core.ImageFrameContainerAssetPackItem) {
                    const frameDescriptors = core.SpriteAssetMetadata.describeFrames(item.getFrames());

                    if (frameDescriptors.length === 0) {
                        throw new Error("The source image could not produce any valid frames; the previous asset data was restored.");
                    }

                    nextData[core.SpriteAssetMetadata.DATA_KEY] = core.SpriteAssetMetadata.reconcile(
                        previousData,
                        nextData,
                        frameDescriptors,
                        sourceFile
                    );
                }

                item.setData(nextData);
                item.resetCache();
                await item.preload();
            } catch (error) {
                item.setData(previousData);
                item.resetCache();

                try {
                    await item.preload();
                } catch {
                    // Сохраняем исходную ошибку reimport; восстановление кэша не должно её скрывать.
                }

                throw error;
            }
        }

        async importMultipleFiles(pack: core.AssetPack, files: io.FilePath[]): Promise<core.AssetPackItem> {

            const computer = new ide.utils.NameMaker(i => i.getKey());

            computer.update(pack.getItems());

            const data = this.createItemData(pack, files);

            data.type = this.getType();
            data.key = computer.makeName(files[0].getNameWithoutExtension());

            const item = pack.createPackItem(data);

            pack.addItem(item);

            try {
                await item.preload();

                const finder = new core.PackFinder();
                await finder.preload();

                await item.build(finder);
                this.initializeSpriteMetadata(item);

                return item;
            } catch (error) {
                pack.deleteItem(item);
                item.resetCache();
                throw error;
            }
        }
    }

}