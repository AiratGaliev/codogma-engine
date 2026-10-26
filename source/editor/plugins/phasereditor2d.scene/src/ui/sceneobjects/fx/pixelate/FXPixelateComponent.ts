/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPixelateComponent extends Component<FXPixelate> {

        // The size of the pixels is equal to 2 + the amount.
        static amount = FXProperty(SimpleProperty("amount", 1, "Amount", "phaser:Phaser.Filters.Pixelate.amount", false, undefined, 1, 0));

        constructor(obj: FXPixelate) {
            super(obj, [
                FXPixelateComponent.amount
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXPixelateComponent.amount
                );
            }
        }
    }
}
