/// <reference path="../../Component.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class RectangleComponent extends Component<Rectangle> {

        static rounded = SimpleProperty("rounded", false, "Rounded",
            "Set rounded corners to the rectangle.",
            false, obj => RectangleComponent.applyRounded(obj));

        static roundedRadius = SimpleProperty("roundedRadius", 20, "Radius",
            "The radius of the rounded corners.",
            false, obj => RectangleComponent.applyRounded(obj));

        private static applyRounded(obj: Rectangle) {

            const self = obj as any;

            if (self.rounded && self.roundedRadius > 0) {

                obj.setRounded(self.roundedRadius);

            } else {

                obj.setRounded(0);
            }
        }

        constructor(obj: Rectangle) {
            super(obj, [
                RectangleComponent.rounded,
                RectangleComponent.roundedRadius
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();
            const objES = this.getEditorSupport();

            const rounded = RectangleComponent.rounded.getValue(obj) as boolean;
            const radius = RectangleComponent.roundedRadius.getValue(obj) as number;

            const unlocked = objES.isUnlockedProperty(RectangleComponent.rounded)
                && objES.isUnlockedProperty(RectangleComponent.roundedRadius);

            if (unlocked && rounded && radius > 0) {

                const dom = new core.code.MethodCallCodeDOM("setRounded", args.objectVarName);

                dom.argFloat(radius);

                args.statements.push(dom);
            }
        }
    }
}
