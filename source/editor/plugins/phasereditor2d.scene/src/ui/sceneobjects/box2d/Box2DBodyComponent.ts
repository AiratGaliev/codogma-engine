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

        // the generated code references plain functions of the phaser-box2d
        // library; the named imports resolve only when the project contains
        // the library file (as the official editor does).
        static addBox2DImport(unit: core.code.UnitCodeDOM, elementName: string,
            sceneFile: colibri.core.io.FilePath, libName = "PhaserBox2D.js") {

            const libFile = colibri.ui.ide.FileUtils.getAllFiles()
                .find(file => file.getName() === libName);

            if (!libFile) {

                throw new Error(
                    `Cannot generate Box2D code: "${libName}" is missing from the project. `
                    + "Add the Phaser Box2D library before generating a scene with Box2D enabled."
                );
            }

            const sceneFinderB2 = ScenePlugin.getInstance().getSceneFinder();
            const sceneSettingsB2 = sceneFinderB2.getSceneSettings(sceneFile);
            const b2ImportExt = sceneSettingsB2 ? sceneSettingsB2.importFileExtension : false;
            const { importPath } = code.getImportPath(sceneFile, libFile, b2ImportExt);

            unit.addImport(elementName, importPath, false);
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

            const settings = scene.getSettings();
            const generateWorld = settings.box2dGenerateWorldCode || settings.box2dEnabled;

            if (scene.isPrefabSceneType() || !generateWorld) {

                return;
            }

            if (!Box2DBodyComponent.isBodyEnabled(obj)) {

                return;
            }

            // Generates calls against the Phaser Box2D v3 C API.
            // Editor coordinates have Y pointing down, while the physics
            // world has Y pointing up, so the generated body position negates Y.
            // AddSpriteToWorld links the created body to its display object.

            const unit = args.unit;

            // v5 templates expose the world via this.worldId (scenes) or this.scene.worldId (prefabs)
            const isPrefabInstance = args.prefabSerializer ? true : false;
            const worldVar = isPrefabInstance ? "this.scene.worldId"
                : settings.box2dGenerateWorldCode ? "this.worldId" : "box2dWorldId";

            const bodyParts = ["...b2DefaultBodyDef()"];
            const shapeParts = ["...b2DefaultShapeDef()"];

            const addPart = (parts: string[], prop: IProperty<ISceneGameObject>, b2Name: string, b2DefValue: any) => {

                const value = prop.getValue(obj);

                if (value !== b2DefValue) {

                    parts.push(`${b2Name}: ${value}`);
                }
            };

            // b2BodyType: 0 = b2_staticBody, 1 = b2_kinematicBody, 2 = b2_dynamicBody

            const bodyType = Box2DBodyComponent.getBodyType(obj);

            bodyParts.push(`type: ${bodyType === "static" ? 0 : bodyType === "kinematic" ? 1 : 2}`);

            const x = (obj as any).x ?? 0;
            const y = (obj as any).y ?? 0;

            bodyParts.push(`position: pxmVec2(${x}, ${-y})`);

            const angle = (obj as any).angle ?? 0;

            if (angle !== 0) {

                Box2DBodyComponent.addBox2DImport(unit, "RotFromRad", args.sceneFile);

                bodyParts.push(`rotation: RotFromRad(-${angle} * Math.PI / 180)`);
            }

            addPart(bodyParts, Box2DBodyComponent.fixedRotation, "fixedRotation", false);
            addPart(bodyParts, Box2DBodyComponent.bullet, "isBullet", false);
            addPart(bodyParts, Box2DBodyComponent.allowSleep, "enableSleep", true);
            addPart(bodyParts, Box2DBodyComponent.linearDamping, "linearDamping", 0);
            addPart(bodyParts, Box2DBodyComponent.angularDamping, "angularDamping", 0.1);
            addPart(bodyParts, Box2DBodyComponent.gravityScale, "gravityScale", 1);

            addPart(shapeParts, Box2DBodyComponent.density, "density", 1);
            addPart(shapeParts, Box2DBodyComponent.friction, "friction", 0.6);
            addPart(shapeParts, Box2DBodyComponent.restitution, "restitution", 0.1);

            for (const name of ["b2CreateBody", "b2DefaultBodyDef", "b2DefaultShapeDef",
                "pxm", "pxmVec2", "AddSpriteToWorld"]) {

                Box2DBodyComponent.addBox2DImport(unit, name, args.sceneFile);
            }

            const varName = this.buildBodyVarName();

            const createBodyCall = new code.MethodCallCodeDOM("b2CreateBody");

            createBodyCall.setDeclareReturnToVar(true);
            createBodyCall.setReturnToVar(varName);
            createBodyCall.arg(worldVar);
            createBodyCall.arg(`{ ${bodyParts.join(", ")} }`);

            args.statements.push(createBodyCall);

            if (Box2DBodyComponent.isCircleShape(obj)) {

                Box2DBodyComponent.addBox2DImport(unit, "b2CreateCircleShape", args.sceneFile);
                Box2DBodyComponent.addBox2DImport(unit, "b2Circle", args.sceneFile);
                Box2DBodyComponent.addBox2DImport(unit, "b2Vec2", args.sceneFile);

                const radius = Box2DBodyComponent.computeShapeRadius(obj);

                const shapeCall = new code.MethodCallCodeDOM("b2CreateCircleShape");

                shapeCall.arg(varName);
                shapeCall.arg(`{ ${shapeParts.join(", ")} }`);
                shapeCall.arg(`new b2Circle(new b2Vec2(0, 0), pxm(${radius}))`);

                args.statements.push(shapeCall);

            } else {

                Box2DBodyComponent.addBox2DImport(unit, "b2CreatePolygonShape", args.sceneFile);
                Box2DBodyComponent.addBox2DImport(unit, "b2MakeBox", args.sceneFile);

                const halfWidth = Box2DBodyComponent.computeShapeWidth(obj) / 2;
                const halfHeight = Box2DBodyComponent.computeShapeHeight(obj) / 2;

                const shapeCall = new code.MethodCallCodeDOM("b2CreatePolygonShape");

                shapeCall.arg(varName);
                shapeCall.arg(`{ ${shapeParts.join(", ")} }`);
                shapeCall.arg(`b2MakeBox(pxm(${halfWidth}), pxm(${halfHeight}))`);

                args.statements.push(shapeCall);
            }

            const addSpriteToWorld = new code.MethodCallCodeDOM("AddSpriteToWorld");

            addSpriteToWorld.arg(worldVar);
            addSpriteToWorld.arg(args.objectVarName);
            addSpriteToWorld.arg(`{ bodyId: ${varName} }`);

            args.statements.push(addSpriteToWorld);
        }

        private buildBodyVarName(): string {

            const count = ++Box2DBodyComponent._bodyVarCounter;

            return count === 1 ? "box2dBody" : `box2dBody_${count - 1}`;
        }
    }
}
