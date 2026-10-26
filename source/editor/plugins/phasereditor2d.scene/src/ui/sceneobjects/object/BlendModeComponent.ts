/// <reference path="../Component.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export const BLEND_MODE_NAMES = [
        "NORMAL",
        "ADD",
        "MULTIPLY",
        "SCREEN",
        "OVERLAY",
        "DARKEN",
        "LIGHTEN",
        "COLOR_DODGE",
        "COLOR_BURN",
        "HARD_LIGHT",
        "SOFT_LIGHT",
        "DIFFERENCE",
        "EXCLUSION",
        "HUE",
        "SATURATION",
        "COLOR",
        "LUMINOSITY",
        "ERASE",
        "SOURCE_IN",
        "SOURCE_OUT",
        "SOURCE_ATOP",
        "DESTINATION_OVER",
        "DESTINATION_IN",
        "DESTINATION_OUT",
        "DESTINATION_ATOP",
        "LIGHTER",
        "COPY"
    ];

    export class BlendModeComponent extends Component<ISceneGameObject> {

        static blendMode: IEnumProperty<ISceneGameObject, string> = {
            name: "blendMode",
            label: "Blend Mode",
            tooltip: "phaser:Phaser.GameObjects.Components.BlendMode.blendMode",
            defValue: "NORMAL",
            getValue: obj => {

                // the runtime stores the blend mode as a number

                const value = (obj as any)._blendMode as number;

                return BLEND_MODE_NAMES[value] ?? "NORMAL";
            },
            setValue: (obj: ISceneGameObject, value: string) => {

                // the Phaser blend mode setter accepts the string-based name of the mode

                (obj as any).blendMode = value;
            },
            values: BLEND_MODE_NAMES,
            getValueLabel: value => value
        };

        constructor(obj: ISceneGameObject) {
            super(obj, [
                BlendModeComponent.blendMode
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            this.buildSetObjectPropertyCodeDOM([BlendModeComponent.blendMode], args2 => {

                const dom = new core.code.MethodCallCodeDOM("setBlendMode", args.objectVarName);

                dom.argLiteral(args2.value);

                args.statements.push(dom);
            });
        }
    }
}
