namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    interface IEditableTilemapExtraData {
        tilemap: EditableTilemap;
        layerName: string;
    }

    export class EditableTilemapExtension extends ScenePlainObjectExtension {

        private static _instance: EditableTilemapExtension;

        static getInstance(): EditableTilemapExtension {

            return this._instance ?? (this._instance = new EditableTilemapExtension());
        }

        private constructor() {
            super({
                category: SCENE_OBJECT_TILEMAP_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_TILEMAP),
                phaserTypeName: "Phaser.Tilemaps.Tilemap",
                typeName: "EditableTilemap"
            });
        }

        /**
         * The key used by the generated code to store the tilemap data in the tilemap cache:
         * `<label>_<id>`, like in `this.cache.tilemap.add("levelMap_5ca7319c-74c6-458a-8589-37cef0ce2ff4", {...})`.
         */
        static getCacheCodeKey(tilemap: EditableTilemap) {

            return code.formatToValidVarName(tilemap.getEditorSupport().getLabel())
                + "_" + tilemap.getEditorSupport().getId();
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildPlainObjectFactoryCodeDOMArgs):
            IBuildPlainObjectFactoryCodeDOMResult {

            const statements: code.MethodCallCodeDOM[] = [];

            const tilemap = args.obj as EditableTilemap;

            const cacheKey = EditableTilemapExtension.getCacheCodeKey(tilemap);

            // this.cache.tilemap.add("<key>", { format: 1, data: { ...tiled-format data... } });

            const cacheDom = new code.MethodCallCodeDOM("add", args.gameObjectFactoryExpr + ".cache.tilemap");

            cacheDom.argLiteral(cacheKey);

            cacheDom.arg(JSON.stringify({
                format: Phaser.Tilemaps.Formats.TILED_JSON,
                data: EditableTilemap.buildTiledJSON(tilemap)
            }));

            statements.push(cacheDom);

            // const levelMap = this.add.tilemap("<key>");

            const addTilemapDom = new code.MethodCallCodeDOM("tilemap", args.gameObjectFactoryExpr + ".add");

            addTilemapDom.argLiteral(cacheKey);

            addTilemapDom.setDeclareReturnToVar(true);

            statements.push(addTilemapDom);

            // levelMap.addTilesetImage("tileset");

            for (const tileset of tilemap.getTilesets()) {

                if (tileset.imageKey) {

                    const addTilesetImageDom = new code.MethodCallCodeDOM("addTilesetImage", args.varname);

                    addTilesetImageDom.argLiteral(tileset.name);

                    statements.push(addTilesetImageDom);
                }
            }

            return {
                firstStatements: statements,
                objectFactoryMethodCall: addTilemapDom
            };
        }

        async getAssetsFromObjectData(args: IGetAssetsFromPlainObjectArgs): Promise<any[]> {

            const result = [];

            const finder = args.finder;

            const data = args.data as IEditableTilemapData;

            for (const tileset of data.data?.tilesets ?? []) {

                if (tileset.imageKey) {

                    const asset = finder.findAssetPackItem(tileset.imageKey);

                    if (asset instanceof pack.core.ImageAssetPackItem
                        || asset instanceof pack.core.SpritesheetAssetPackItem) {

                        result.push(asset);
                    }
                }
            }

            return result;
        }

        async collectExtraDataForCreateDefaultObject(editor: ui.editor.SceneEditor) {

            const promise = new Promise((resolve, reject) => {

                const dlg = new EditableTilemapConfigWizard();

                dlg.setFinishCallback(() => {

                    const result: ICreateExtraDataResult = {
                        data: {
                            label: dlg.getLabel(),
                            columns: dlg.getColumns(),
                            rows: dlg.getRows(),
                            tileWidth: dlg.getTileWidth(),
                            tileHeight: dlg.getTileHeight()
                        }
                    };

                    resolve(result);
                });

                dlg.setCancelCallback(() => {

                    const result: ICreateExtraDataResult = {
                        abort: true
                    };

                    resolve(result);
                });

                dlg.create();
            });

            return promise;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs) {

            const extraData = args.extraData as {
                label: string,
                columns: number,
                rows: number,
                tileWidth: number,
                tileHeight: number
            };

            const scene = args.scene;

            const tilemap = new EditableTilemap(scene, extraData.tileWidth, extraData.tileHeight);

            tilemap.getEditorSupport().setLabel(extraData.label);

            // an "Empty" tileset: it has no image yet

            const tileset: IEditableTilesetInfo = {
                name: "tileset",
                imageKey: undefined,
                tileWidth: extraData.tileWidth,
                tileHeight: extraData.tileHeight,
                margin: 0,
                spacing: 0,
                firstgid: 1
            };

            EditableTilemap.markTilesetInfo(tileset);

            tilemap.getTilesets().push(tileset);

            // the first layer

            const layerName = scene.makeNewName("mainLayer");

            const data: number[][] = [];

            for (let y = 0; y < extraData.rows; y++) {

                const row: number[] = [];

                for (let x = 0; x < extraData.columns; x++) {

                    row.push(-1);
                }

                data.push(row);
            }

            tilemap.getLayers().push({
                id: Phaser.Utils.String.UUID(),
                name: layerName,
                width: extraData.columns,
                height: extraData.rows,
                data
            });

            const layer = EditableTilemapLayerExtension.getInstance()
                .createLayerObject(scene, tilemap, layerName);

            return [tilemap, layer];
        }

        createPlainObjectWithData(args: ICreatePlainObjectWithDataArgs): IScenePlainObject {

            const tilemap = new EditableTilemap(args.scene, 16, 16);

            tilemap.getEditorSupport().readJSON(args.data as IEditableTilemapData);

            return tilemap;
        }

        isAvailableAsPrefabElement() {

            return false;
        }
    }
}
