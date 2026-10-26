/// <reference path="./SceneSnapshotOperation.ts" />

namespace phasereditor2d.scene.ui.editor.undo {

    import json = core.json;

    /**
     * This operation replaces the selected prefab instances with plain copies
     * of the prefab contents ("unbox" the prefab instances):
     *
     * - The effective children of the instance (the prefab's children with the
     *   nested prefab data applied, plus the appended children) are instantiated
     *   as new objects, in the same parent of the instance.
     * - If the prefab is a "leaf" prefab (an instance without children), the instance
     *   is replaced by a plain object of the root type of the prefab chain, with the
     *   values of the prefab chain merged.
     * - The new objects are positioned relative to the instance: only the translation
     *   (x/y) of the instance is applied. Scale and rotation of the instance are not
     *   composed into the new objects (limitation of this first version).
     * - The prefab instances are removed and the new objects are selected.
     */
    export class UnboxPrefabInstanceOperation extends SceneSnapshotOperation {

        protected async performModification() {

            const editor = this.getEditor();
            const scene = editor.getScene();
            const maker = scene.getMaker();
            const finder = ScenePlugin.getInstance().getSceneFinder();

            const nameMaker = scene.createNameMaker();

            const instances = editor.getSelectedGameObjects()
                .filter(obj => {

                    const objES = obj.getEditorSupport();

                    return objES.isPrefabInstance()
                        && !objES.isNestedPrefabInstance()
                        && !objES.isScenePrefabObject();
                });

            const newSelection: sceneobjects.ISceneGameObject[] = [];

            for (const instance of instances) {

                const instanceES = instance.getEditorSupport();

                const instanceData = {} as json.IObjectData;

                instanceES.writeJSON(instanceData);

                // the effective children of the instance:
                // the prefab's children (with the nested prefab data applied) + the appended children

                const { children } = sceneobjects.GameObjectEditorSupport.buildRawChildrenData(instanceData);

                const runtimeChildren = instanceES.getObjectChildren();

                const dataList: json.IObjectData[] = [];

                if (children.length === 0) {

                    // a "leaf" prefab instance (like a Sprite prefab):
                    // replace it with a plain object with the root type of the prefab chain.

                    dataList.push(this.buildUnboxedObjectData(finder, instanceData, instance));
                }

                for (let i = 0; i < children.length; i++) {

                    const childData = JSON.parse(JSON.stringify(children[i])) as json.IObjectData;

                    const runtimeChild: sceneobjects.ISceneGameObject = runtimeChildren[i];

                    // the children positions are relative to the instance:
                    // offset them by the current position of the instance.
                    // v1: only the translation (x/y) is applied, scale/rotation are not composed.

                    const x = runtimeChild ? (runtimeChild as any).x : childData["x"];
                    const y = runtimeChild ? (runtimeChild as any).y : childData["y"];

                    if (typeof x === "number") {

                        childData["x"] = x + (instance as any).x;
                    }

                    if (typeof y === "number") {

                        childData["y"] = y + (instance as any).y;
                    }

                    // FX objects need a parent game object, they can't be unboxed this way.

                    const ser = maker.getSerializer(childData);
                    const type = ser.getType();

                    if (ScenePlugin.getInstance().isFXType(type)) {

                        continue;
                    }

                    dataList.push(childData);
                }

                // preload the assets of the new objects

                await maker.updateLoaderWithData([], dataList);

                for (const data of dataList) {

                    this.setNewObjectId(data);

                    const loaders = ScenePlugin.getInstance().getLoaderUpdaters();

                    for (const loader of loaders) {

                        await loader.updateLoaderWithObjData(scene, data);
                    }

                    const newObj = maker.createObject(data);

                    if (newObj) {

                        const parent = instanceES.getObjectParent();

                        if (parent) {

                            // it was added to the scene's display list by the maker,
                            // addObjectChild() moves it to the parent.

                            parent.getEditorSupport().addObjectChild(newObj);
                        }

                        // note: for top-level objects, the maker already added
                        // the object to the scene's display list.

                        // rename it, but keep the label if it is unique in the scene

                        const newLabel = nameMaker.makeName(newObj.getEditorSupport().getLabel());

                        newObj.getEditorSupport().setLabel(newLabel);

                        this.updateChildrenLabels(newObj, nameMaker);

                        newSelection.push(newObj);
                    }
                }

                // remove the prefab instance

                instanceES.destroy();

                scene.getObjectLists().removeObjectById(instanceES.getId());
            }

            editor.setSelection(newSelection);
        }

        private updateChildrenLabels(obj: sceneobjects.ISceneGameObject, nameMaker: colibri.ui.ide.utils.NameMaker) {

            for (const child of obj.getEditorSupport().getAppendedChildren()) {

                const newLabel = nameMaker.makeName(child.getEditorSupport().getLabel());

                child.getEditorSupport().setLabel(newLabel);

                this.updateChildrenLabels(child, nameMaker);
            }
        }

        /**
         * Build the data of the "unboxed" object: a plain object with the root type
         * of the prefab chain and the values of the whole chain merged.
         * The prefab link is removed, so the new object is not a prefab instance.
         */
        private buildUnboxedObjectData(
            finder: core.json.SceneFinder, instanceData: json.IObjectData,
            instance: sceneobjects.ISceneGameObject): json.IObjectData {

            // collect the prefab chain: from the root-most prefab to the instance

            const chain: json.IObjectData[] = [];

            let prefabId = instanceData.prefabId;

            while (prefabId) {

                const prefabData = finder.getPrefabData(prefabId);

                if (!prefabData) {

                    break;
                }

                chain.unshift(prefabData);

                prefabId = prefabData.prefabId;
            }

            chain.push(instanceData);

            const result = {} as any;

            for (const data of chain) {

                for (const key of Object.keys(data)) {

                    if (key === "prefabId" || key === "unlock" || key === "id" || key === "nestedPrefabs") {

                        continue;
                    }

                    if (key === "components") {

                        result.components = [...new Set([...(result.components ?? []), ...data.components])];

                        continue;
                    }

                    result[key] = data[key];
                }
            }

            // the position of the unboxed object is the current position of the instance
            // (locked properties are not present in the instance data, but they were merged
            // from the prefab chain, so we have to fix the position with the runtime value)

            const x = (instance as unknown as Phaser.GameObjects.Sprite).x;
            const y = (instance as unknown as Phaser.GameObjects.Sprite).y;

            if (typeof x === "number") {

                result["x"] = x;
            }

            if (typeof y === "number") {

                result["y"] = y;
            }

            // generate a new id for the unboxed object

            result.id = Phaser.Utils.String.UUID();

            return result as json.IObjectData;
        }

        private setNewObjectId(data: json.IObjectData) {

            data.id = Phaser.Utils.String.UUID();

            if (data.list) {

                for (const child of data.list) {

                    this.setNewObjectId(child);
                }
            }

            if (data.nestedPrefabs) {

                for (const child of data.nestedPrefabs) {

                    this.setNewObjectId(child);
                }
            }
        }
    }
}
