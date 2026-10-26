/// <reference path="./SceneSnapshotOperation.ts" />

namespace phasereditor2d.scene.ui.editor.undo {

    /**
     * This operation sets the "editor render" flag of a list of scene objects.
     *
     * The editor render flag controls if an object is rendered or not in the scene editor,
     * but it is not part of the game: the object is always compiled to the game code.
     */
    export class EditorRenderOperation extends SceneSnapshotOperation {

        private _objects: sceneobjects.ISceneGameObject[];
        private _value: boolean;

        constructor(editor: SceneEditor, objects: sceneobjects.ISceneGameObject[], value: boolean) {
            super(editor);

            this._objects = objects;
            this._value = value;
        }

        protected async performModification() {

            for (const obj of this._objects) {

                obj.getEditorSupport().setEditorRender(this._value);
            }
        }
    }
}
