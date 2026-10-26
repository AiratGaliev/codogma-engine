/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlockyComponent extends Component<FXBlocky> {

        // In Phaser 4, Blocky.size and Blocky.offset are Vector2Like objects
        // ({x, y}). The editor exposes their components as single numbers.
        // The filter limits the size values to a minimum of 1.
        static sizeX = FXProperty(SimpleProperty("sizeX", 4, "Size X", "phaser:Phaser.Filters.Blocky.size", false, undefined, 1, 1));
        static sizeY = FXProperty(SimpleProperty("sizeY", 4, "Size Y", "phaser:Phaser.Filters.Blocky.size", false, undefined, 1, 1));
        static offsetX = FXProperty(SimpleProperty("offsetX", 0, "Offset X", "phaser:Phaser.Filters.Blocky.offset", false, undefined, 1));
        static offsetY = FXProperty(SimpleProperty("offsetY", 0, "Offset Y", "phaser:Phaser.Filters.Blocky.offset", false, undefined, 1));

        constructor(obj: FXBlocky) {
            super(obj, [
                FXBlockyComponent.sizeX,
                FXBlockyComponent.sizeY,
                FXBlockyComponent.offsetX,
                FXBlockyComponent.offsetY
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // The size and offset objects are passed in the addBlocky()
                // config object, no assignments are emitted here.
            }
        }
    }
}
