/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXNormalToolsComponent extends Component<FXNormalTools> {

        // In Phaser 4, the 2D rotation is managed with getRotation() /
        // setRotation() (there is no plain property), the editor exposes it
        // as a number. Limitation: the `viewMatrix` (3D rotation), the
        // `rotationSource` and the `ratioVector` are not exposed by the editor.
        static rotation = FXProperty({
            ...SimpleProperty("rotation", 0, "Rotation", "phaser:Phaser.Filters.NormalTools.rotation", false, undefined, 0.01),
            getValue: (fx: Phaser.Filters.NormalTools) => fx.getRotation(),
            setValue: (fx: Phaser.Filters.NormalTools, value: number) => {

                fx.setRotation(value);
            }
        });
        static facingPower = FXProperty(SimpleProperty("facingPower", 1, "Facing Power", "phaser:Phaser.Filters.NormalTools.facingPower", false, undefined, 0.01));
        static outputRatio = FXProperty(SimpleProperty("outputRatio", false, "Output Ratio", "phaser:Phaser.Filters.NormalTools.outputRatio"));
        static ratioRadius = FXProperty(SimpleProperty("ratioRadius", 1, "Ratio Radius", "phaser:Phaser.Filters.NormalTools.ratioRadius", false, undefined, 0.01, 0, 1));

        constructor(obj: FXNormalTools) {
            super(obj, [
                FXNormalToolsComponent.rotation,
                FXNormalToolsComponent.facingPower,
                FXNormalToolsComponent.outputRatio,
                FXNormalToolsComponent.ratioRadius
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXNormalToolsComponent.facingPower,
                    FXNormalToolsComponent.ratioRadius
                );

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXNormalToolsComponent.outputRatio
                );

                // The rotation is a constructor-only argument
                // (it is passed in the addNormalTools() config object).
            }
        }
    }
}
