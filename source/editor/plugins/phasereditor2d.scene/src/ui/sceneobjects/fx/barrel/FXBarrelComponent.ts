/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBarrelComponent extends Component<FXBarrel> {

        static amount = FXProperty(SimpleProperty("amount", 1, "Amount", "phaser:Phaser.Filters.Barrel.amount", false, undefined, 0.01));

        constructor(obj: FXBarrel) {
            super(obj, [
                FXBarrelComponent.amount
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXBarrelComponent.amount
                );
            }
        }
    }
}
