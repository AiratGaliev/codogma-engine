/// <reference path="./ObjectVarPropertyType.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * This property type allows selecting a game object of the scene (or a plain object,
     * or an object list) and generates code with the variable name of the selection.
     */
    export class GameObjectReferencePropertyType extends ObjectVarPropertyType {

        constructor() {

            super({
                id: "game-object-reference",
                name: "Game Object Reference",
                dialogTitle: "Select Object"
            });
        }
    }
}
