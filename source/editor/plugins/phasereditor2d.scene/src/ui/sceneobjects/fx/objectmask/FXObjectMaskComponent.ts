/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXObjectMaskComponent extends Component<FXObjectMask> {

        // Limitation: the editor cannot pick the mask GameObject. The mask source
        // defaults to the white texture ('__WHITE'), until user code assigns a
        // GameObject with filter.setGameObject(obj) or a texture with setTexture(key).
        // The autoUpdate flag applies only when the mask is a GameObject; because it
        // is not a parameter of addMask(), its value is only preserved in the
        // generated code of nested prefab instances (as a property assignment).

        static invert = FXProperty(SimpleProperty("invert", false, "Invert", "phaser:Phaser.Filters.Mask.invert"));

        static autoUpdate = FXProperty(SimpleProperty("autoUpdate", true, "Auto Update", "phaser:Phaser.Filters.Mask.autoUpdate"));

        static scaleFactor = FXProperty(SimpleProperty("scaleFactor", 1, "Scale Factor", "phaser:Phaser.Filters.Mask.scaleFactor", false, undefined, 0.01));

        constructor(obj: FXObjectMask) {
            super(obj, [
                FXObjectMaskComponent.invert,
                FXObjectMaskComponent.autoUpdate,
                FXObjectMaskComponent.scaleFactor
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXObjectMaskComponent.invert,
                    FXObjectMaskComponent.autoUpdate
                );

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXObjectMaskComponent.scaleFactor
                );
            }
        }
    }
}
