/// <reference path="../Component.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import code = scene.core.code;

    function getBox2DData(obj: ISceneGameObject): Record<string, any> {

        let data = (obj as any)["__box2dBodyData"];

        if (!data) {

            data = {};

            (obj as any)["__box2dBodyData"] = data;
        }

        return data;
    }

    function SimpleBox2DProperty(
        name: string, defValue: any, label: string, tooltip?: string,
        increment?: number, min?: number, max?: number): IProperty<any> {

        return {
            name: `box2dBody.${name}`,
            defValue,
            label,
            increment,
            incrementMin: min,
            incrementMax: max,
            tooltip,
            getValue: obj => {

                const value = getBox2DData(obj)[name];

                return value === undefined ? defValue : value;
            },
            setValue: (obj, value) => {

                getBox2DData(obj)[name] = value;
            }
        };
    }

    function SimpleBox2DEnumProperty(
        name: string, defValue: string, values: string[], labels: string[],
        label: string, tooltip?: string): IEnumProperty<ISceneGameObject, string> {

        return {
            name: `box2dBody.${name}`,
            defValue,
            label,
            tooltip,
            values,
            getValueLabel: value => labels[values.indexOf(value)] ?? value,
            getValue: obj => {

                const value = getBox2DData(obj)[name];

                return value === undefined ? defValue : value;
            },
            setValue: (obj, value) => {

                getBox2DData(obj)[name] = value;
            }
        };
    }

    export class Box2DBodyComponent extends Component<ISceneGameObject> {

        // properties

        static enabled = SimpleBox2DProperty(
            "enabled", false, "Enable",
            "Enable the Box2D physics body of this object. The body is created by the scene compiler.");
        static bodyType = SimpleBox2DEnumProperty(
            "bodyType", "dynamic", ["static", "kinematic", "dynamic"], ["Static", "Kinematic", "Dynamic"],
            "Body Type",
            "The type of the body: static, kinematic or dynamic.");
        static density = SimpleBox2DProperty(
            "density", 1, "Density",
            "The density of the fixture, usually in kg/m2.",
            0.1, 0, 100);
        static friction = SimpleBox2DProperty(
            "friction", 0.3, "Friction",
            "The friction coefficient of the fixture, usually in the range [0, 1].",
            0.05, 0, 1);
        static restitution = SimpleBox2DProperty(
            "restitution", 0, "Restitution",
            "The restitution (elasticity) of the fixture, usually in the range [0, 1].",
            0.05, 0, 1);
        static linearDamping = SimpleBox2DProperty(
            "linearDamping", 0, "Linear Damping",
            "The linear damping of the body.",
            0.1, 0, 10);
        static angularDamping = SimpleBox2DProperty(
            "angularDamping", 0.1, "Angular Damping",
            "The angular damping of the body.",
            0.1, 0, 10);
        static gravityScale = SimpleBox2DProperty(
            "gravityScale", 1, "Gravity Scale",
            "The scale of the gravity applied to this body.",
            0.1);
        static fixedRotation = SimpleBox2DProperty(
            "fixedRotation", false, "Fixed Rotation",
            "If enabled, the body never rotates.");
        static bullet = SimpleBox2DProperty(
            "bullet", false, "Bullet",
            "If enabled, the body is treated as a bullet (continuous collision detection).");
        static allowSleep = SimpleBox2DProperty(
            "allowSleep", true, "Allow Sleep",
            "If enabled, the body is allowed to sleep when it comes to rest.");
        static shapeType = SimpleBox2DEnumProperty(
            "shapeType", "box", ["box", "circle"], ["Box", "Circle"],
            "Shape Type",
            "The shape of the fixture attached to the body.");
        static shapeWidth = SimpleBox2DProperty(
            "shapeWidth", 0, "W",
            "The width of the box shape. Set it to 0 to use the display width of the object.",
            1, 0);
        static shapeHeight = SimpleBox2DProperty(
            "shapeHeight", 0, "H",
            "The height of the box shape. Set it to 0 to use the display height of the object.",
            1, 0);
        static shapeRadius = SimpleBox2DProperty(
            "shapeRadius", 0, "Radius",
            "The radius of the circle shape. Set it to 0 to use the half of the display width of the object.",
            1, 0);

        static shapeSize: IPropertyXY = {
            label: "Size",
            tooltip: "The size of the box shape. A value of 0 means to use the size of the object.",
            x: Box2DBodyComponent.shapeWidth,
            y: Box2DBodyComponent.shapeHeight
        };

        // counter used to generate a unique variable name for each body of the scene

        private static _bodyVarCounter = 0;

        static resetBodyVarCounter() {

            Box2DBodyComponent._bodyVarCounter = 0;
        }

        static isBodyEnabled(obj: ISceneGameObject) {

            return Box2DBodyComponent.enabled.getValue(obj) === true;
        }

        static hasBodySupport(obj: ISceneGameObject) {

            for (const comp of obj.getEditorSupport().getComponents()) {

                if (comp instanceof Box2DBodyComponent) {

                    return true;
                }
            }

            return false;
        }

        static isCircleShape(obj: ISceneGameObject) {

            return Box2DBodyComponent.shapeType.getValue(obj) === "circle";
        }

        static getBodyType(obj: ISceneGameObject): Phaser.Box2D.BodyType {

            return Box2DBodyComponent.bodyType.getValue(obj);
        }

        static computeObjectSize(obj: ISceneGameObject): { width: number, height: number } {

            return obj.getEditorSupport().computeSize();
        }

        static computeShapeWidth(obj: ISceneGameObject): number {

            const value = Box2DBodyComponent.shapeWidth.getValue(obj) as number;

            if (value > 0) {

                return value;
            }

            return Box2DBodyComponent.computeObjectSize(obj).width;
        }

        static computeShapeHeight(obj: ISceneGameObject): number {

            const value = Box2DBodyComponent.shapeHeight.getValue(obj) as number;

            if (value > 0) {

                return value;
            }

            return Box2DBodyComponent.computeObjectSize(obj).height;
        }

        static computeShapeRadius(obj: ISceneGameObject): number {

            const value = Box2DBodyComponent.shapeRadius.getValue(obj) as number;

            if (value > 0) {

                return value;
            }

            return Box2DBodyComponent.computeShapeWidth(obj) / 2;
        }

        constructor(obj: ISceneGameObject, active: boolean) {
            super(obj, [
                Box2DBodyComponent.enabled,
                Box2DBodyComponent.bodyType,
                Box2DBodyComponent.density,
                Box2DBodyComponent.friction,
                Box2DBodyComponent.restitution,
                Box2DBodyComponent.linearDamping,
                Box2DBodyComponent.angularDamping,
                Box2DBodyComponent.gravityScale,
                Box2DBodyComponent.fixedRotation,
                Box2DBodyComponent.bullet,
                Box2DBodyComponent.allowSleep,
                Box2DBodyComponent.shapeType,
                Box2DBodyComponent.shapeWidth,
                Box2DBodyComponent.shapeHeight,
                Box2DBodyComponent.shapeRadius
            ], active);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();
            const objES = this.getEditorSupport();
            const scene = objES.getScene();

            if (scene.isPrefabSceneType()) {

                // the world is created by the consuming scene,
                // the bodies are compiled there, for each prefab instance.

                return;
            }

            if (!scene.getSettings().box2dEnabled) {

                return;
            }

            if (!Box2DBodyComponent.isBodyEnabled(obj)) {

                return;
            }

            // const box2dBody = box2dWorld.createBody({ ... });

            const varName = this.buildBodyVarName();

            const createBodyCall = new code.MethodCallCodeDOM("createBody", "box2dWorld");

            createBodyCall.setDeclareReturnToVar(true);
            createBodyCall.setReturnToVar(varName);
            createBodyCall.arg(this.buildBodyConfigLiteral());

            args.statements.push(createBodyCall);

            // box2dBody.createFixture(new Phaser.Box2D.Box(w, h), { ... });

            const fixtureCall = new code.MethodCallCodeDOM("createFixture", varName);

            fixtureCall.arg(this.buildShapeLiteral());
            fixtureCall.arg(this.buildFixtureConfigLiteral());

            args.statements.push(fixtureCall);
        }

        private buildBodyVarName(): string {

            const count = ++Box2DBodyComponent._bodyVarCounter;

            return count === 1 ? "box2dBody" : `box2dBody_${count - 1}`;
        }

        private buildBodyConfigLiteral(): string {

            const obj = this.getObject();

            const x = (obj as any).x ?? 0;
            const y = (obj as any).y ?? 0;

            const bodyType = Box2DBodyComponent.getBodyType(obj);
            const fixedRotation = Box2DBodyComponent.fixedRotation.getValue(obj);
            const bullet = Box2DBodyComponent.bullet.getValue(obj);
            const allowSleep = Box2DBodyComponent.allowSleep.getValue(obj);
            const linearDamping = Box2DBodyComponent.linearDamping.getValue(obj);
            const angularDamping = Box2DBodyComponent.angularDamping.getValue(obj);
            const gravityScale = Box2DBodyComponent.gravityScale.getValue(obj);

            return `{ type: "${bodyType}", position: { x: ${x}, y: ${y} }, `
                + `fixedRotation: ${fixedRotation}, bullet: ${bullet}, allowSleep: ${allowSleep}, `
                + `linearDamping: ${linearDamping}, angularDamping: ${angularDamping}, gravityScale: ${gravityScale} }`;
        }

        private buildShapeLiteral(): string {

            const obj = this.getObject();

            if (Box2DBodyComponent.isCircleShape(obj)) {

                const radius = Box2DBodyComponent.computeShapeRadius(obj);

                return `new Phaser.Box2D.Circle(${radius})`;
            }

            const width = Box2DBodyComponent.computeShapeWidth(obj);
            const height = Box2DBodyComponent.computeShapeHeight(obj);

            return `new Phaser.Box2D.Box(${width}, ${height})`;
        }

        private buildFixtureConfigLiteral(): string {

            const obj = this.getObject();

            const density = Box2DBodyComponent.density.getValue(obj);
            const friction = Box2DBodyComponent.friction.getValue(obj);
            const restitution = Box2DBodyComponent.restitution.getValue(obj);

            return `{ density: ${density}, friction: ${friction}, restitution: ${restitution} }`;
        }
    }
}
