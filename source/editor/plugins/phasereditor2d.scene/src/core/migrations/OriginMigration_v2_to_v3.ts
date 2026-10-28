///<reference path="../../ui/SceneDataMigrationExtension.ts"/>
namespace phasereditor2d.scene.core.migrations {

    export class OriginMigration_v2_to_v3 extends ui.SceneDataMigrationExtension {

        migrate(data: json.ISceneData) {

            const version = data.meta.version ?? 1;

            if (version < 3) {

                console.log("Migrating: unlock position by default");
                
                this.migrateList(data.displayList);
            }
        }

        private migrateList(list: json.IObjectData[]) {

            for (const obj of list) {

                let serializer: json.Serializer;

                try {

                    serializer = new json.Serializer(obj);

                } catch (e) {

                    // A broken prefab reference (deleted/renamed prefab file)
                    // must not abort the migration of the whole scene: skip
                    // this object's origin fix-up but keep migrating its
                    // children. SceneFinder already logged the debug info.
                    console.warn(`OriginMigration_v2_to_v3: skipping origin fix-up for "${(obj as any).label ?? "?"}": ${(e as Error).message}`);

                    serializer = null as unknown as json.Serializer;
                }

                if (serializer) {

                    const type = serializer.getType();

                    if (type === "Text" || type === "BitmapText") {

                        const origin = {
                            originX: serializer.read("originX", 0.5),
                            originY: serializer.read("originY", 0.5),
                        };

                        Object.assign(obj, origin);
                    }
                }

                if (obj.list) {

                    this.migrateList(obj.list);
                }

                if (obj.nestedPrefabs) {

                    this.migrateList(obj.nestedPrefabs);
                }
            }
        }
    }
}