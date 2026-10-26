/// <reference path="../object/SceneGameObjectOperation.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class Box2DBodyEnableOperation extends SceneGameObjectOperation<ISceneGameObject> {

        constructor(editor: ui.editor.SceneEditor, enable: boolean) {
            super(editor, editor.getSelectedGameObjects(), enable);
        }

        getValue(obj: ISceneGameObject) {

            return obj.getEditorSupport().hasComponent(Box2DBodyComponent);
        }

        setValue(obj: ISceneGameObject, enable: boolean): void {

            if (!Box2DBodyComponent.hasBodySupport(obj)) {

                return;
            }

            if (enable) {

                obj.getEditorSupport().setComponentActive(Box2DBodyComponent, true);

                Box2DBodyComponent.enabled.setValue(obj, true);

            } else {

                obj.getEditorSupport().setComponentActive(Box2DBodyComponent, false);
            }
        }
    }
}
