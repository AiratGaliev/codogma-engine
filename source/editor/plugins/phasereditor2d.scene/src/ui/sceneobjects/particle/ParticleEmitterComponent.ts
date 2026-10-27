/// <reference path="../Component.ts" />
/// <reference path="./ParticleEmitterConfig.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    import read = colibri.core.json.read;

    export class ParticleEmitterComponent extends Component<ParticleEmitter> {

        static frame = SimpleConfigProperty("configFrame", [], "Frame", "The frames of the particles.");
        static texture = SimpleConfigProperty("configTexture", undefined, "Texture", "The texture with the particles images.");

        // transform

        static x = makePropertySet("x", "X", "particleX");
        static y = makePropertySet("y", "Y", "particleY");
        static moveToX = makePropertySet("moveToX", "Move To X");
        static moveToY = makePropertySet("moveToY", "Move To Y");
        static scale = makePropertySet("scale", "Scale", "setParticleScale", ParticleEmitterEditorType.NUMBER, 0.01, 0, 2);
        static scaleX = makePropertySet("scaleX", "Scale X", "particleScaleX", ParticleEmitterEditorType.NUMBER, 0.01, 0, 2);
        static scaleY = makePropertySet("scaleY", "Scale Y", "particleScaleY", ParticleEmitterEditorType.NUMBER, 0.01, 0, 2);
        static angle = makePropertySet("angle", "Angle", "particleAngle", ParticleEmitterEditorType.NUMBER, 1, 0, 360, ON_EMIT_ONLY_TYPES);
        static rotate = makePropertySet("rotate", "Rotate", "particleRotate", ParticleEmitterEditorType.NUMBER, 1, 0, 360);

        // physics

        static accelerationX = makePropertySet("accelerationX", "Acceleration X", "accelerationX");
        static accelerationY = makePropertySet("accelerationY", "Acceleration Y", "accelerationY");
        static maxVelocityX = makePropertySet("maxVelocityX", "Max Velocity X", "maxVelocityX");
        static maxVelocityY = makePropertySet("maxVelocityY", "Max Velocity Y", "maxVelocityY");
        static speed = makePropertySet("speed", "Speed", "speed", ParticleEmitterEditorType.NUMBER, 10, 0, undefined, ON_EMIT_ONLY_TYPES);
        static speedX = makePropertySet("speedX", "Speed X", "speedX", ParticleEmitterEditorType.NUMBER, 10, undefined, undefined, ON_EMIT_ONLY_TYPES);
        static speedY = makePropertySet("speedY", "Speed Y", "speedY", ParticleEmitterEditorType.NUMBER, 10, undefined, undefined, ON_EMIT_ONLY_TYPES);
        static gravityX = SimpleObjConfigProperty("gravityX", 0, "Gravity X", undefined, undefined, 10);
        static gravityY = SimpleObjConfigProperty("gravityY", 0, "Gravity Y", undefined, undefined, 10);
        static radial = SimpleProperty("radial", true, "Radial", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.radial");

        // timing

        static delay = makePropertySet("delay", "Delay", undefined, ParticleEmitterEditorType.NUMBER, 1, 0, undefined, ON_EMIT_ONLY_TYPES);
        static hold = makePropertySet("hold", "Hold", undefined, ParticleEmitterEditorType.NUMBER, 1, 0, undefined, ON_EMIT_ONLY_TYPES);
        static lifespan = makePropertySet("lifespan", "Lifespan", undefined, ParticleEmitterEditorType.NUMBER, 1, 0, undefined, ON_EMIT_ONLY_TYPES);
        static quantity = makePropertySet("quantity", "Quantity", undefined, ParticleEmitterEditorType.NUMBER, 1, 0, undefined, ON_EMIT_ONLY_TYPES);
        static duration = SimpleObjConfigProperty("duration", 0, "Duration", undefined, undefined, 10, 0);
        static stopAfter = SimpleObjConfigProperty("stopAfter", 0, "Stop After", undefined, undefined, 10, 0);
        static frequency = SimpleObjConfigProperty("frequency", 0, "Frequency", undefined, undefined, 1, 0);
        static timeScale = SimpleObjConfigProperty("timeScale", 1, "Time Scale", undefined, undefined, 0.01, 0);
        static maxAliveParticles = SimpleObjConfigProperty("maxAliveParticles", 0, "Max Alive Particles", undefined, undefined, 1, 0);
        static maxParticles = SimpleObjConfigProperty("maxParticles", 0, "Max Particles", undefined, undefined, 1, 0);
        static advance = SimpleObjConfigProperty("advance", 0, "Advance",
            "If you wish to 'fast forward' the emitter in time, set this value to a number representing the amount of ms the emitter should advance. Doing so implicitly sets `emitting` to `true`.",
            undefined, 10, 0);

        // color

        static tint = makePropertySet("tint", "Tint", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.particleTint", ParticleEmitterEditorType.COLOR);
        static alpha = makePropertySet("alpha", "Alpha", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.particleAlpha", ParticleEmitterEditorType.NUMBER, 0.01, 0, 1);
        static color = makePropertySet("color", "Color", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.particleColor", ParticleEmitterEditorType.COLOR, undefined, undefined, undefined, [ConfigValueType.None, ConfigValueType.Random]);
        static colorEase = SimpleEnumObjConfigProperty("colorEase", "Linear", easeValues, easeValues, "Color Ease", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.colorEase");
        static tintFill = SimpleObjConfigProperty("tintFill", false, "Tint Fill");
        static blendMode = SimpleEnumObjConfigProperty("blendMode", "NORMAL", BLEND_MODE_NAMES, BLEND_MODE_NAMES, "Blend Mode", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.blendMode");

        // sorting

        static particleBringToTop = SimpleObjConfigProperty("particleBringToTop", false, "Particle Bring To Top");
        static sortOrderAsc = SimpleObjConfigProperty("sortOrderAsc", true, "Sort Order Asc");
        static sortProperty = SimpleObjConfigProperty("sortProperty", "", "Sort Property");

        // follow

        static follow = SimpleObjConfigProperty("follow", "", "Follow");
        static trackVisible = SimpleObjConfigProperty("trackVisible", false, "Track Visible");

        // preview

        static previewAdvance = SimpleProperty("previewAdvance", 1000, "Preview Advance", "Advance the emitter in milliseconds. It is only applied in the editor.");
        static previewActive = SimpleProperty("previewActive", true, "Preview Active", "Activate the emitter. It is only applied in the editor.");

        // our extra: keep the legacy animation feature of this fork. It is emitted with the
        // `anim` code name, the config key the official editor dropped.

        static animationKey = SimpleObjConfigProperty("animationKey", "", "Animation", "phaser:Phaser.GameObjects.Particles.ParticleEmitter.anim");

        static {
            this.tint.props.value.defValue = 0xffffff;
            this.tint.props.start.defValue = 0xffffff;
            this.tint.props.end.defValue = 0xffffff;
            this.tint.props.min.defValue = 0xffffff;
            this.tint.props.max.defValue = 0xffffff;
            this.scale.props.randomArray.defValue = [1];
            this.scaleX.props.randomArray.defValue = [1];
            this.color.props.randomArray.defValue = [0xffffff];

            this.animationKey.codeName = "anim";
        }

        static CONFIG_PROPS_SETS = [
            this.x,
            this.y,
            this.moveToX,
            this.moveToY,
            this.scale,
            this.scaleX,
            this.scaleY,
            this.angle,
            this.rotate,
            this.accelerationX,
            this.accelerationY,
            this.maxVelocityX,
            this.maxVelocityY,
            this.speed,
            this.speedX,
            this.speedY,
            this.delay,
            this.hold,
            this.lifespan,
            this.quantity,
            this.tint,
            this.alpha,
            this.color,
        ];

        static SIMPLE_CONFIG_PROPS = [
            this.blendMode,
            this.colorEase,
            this.tintFill,
            this.duration,
            this.stopAfter,
            this.frequency,
            this.timeScale,
            this.gravityX,
            this.gravityY,
            this.radial,
            this.maxAliveParticles,
            this.maxParticles,
            this.advance,
            this.particleBringToTop,
            this.sortOrderAsc,
            this.sortProperty,
            this.follow,
            this.trackVisible,
            this.animationKey
        ];

        static PREVIEW_PROPS = [
            this.previewAdvance,
            this.previewActive
        ];

        static ALL_CODE_PROPS = [
            ParticleEmitterComponent.texture,
            ParticleEmitterComponent.frame,
            ...ParticleEmitterComponent.CONFIG_PROPS_SETS.flatMap(s => s.list),
            ...ParticleEmitterComponent.SIMPLE_CONFIG_PROPS,
        ];

        static LEGACY_KEYS = [
            "editorTexture",
            "editorFrame",
            "editorAnimationKey",
            "editorQuantity",
            "speedMin",
            "speedMax",
            "angleMin",
            "angleMax",
            "lifespanMin",
            "lifespanMax",
            "scaleStart",
            "scaleEnd",
            "alphaStart",
            "alphaEnd",
            "gravityX",
            "gravityY"
        ];

        constructor(obj: ParticleEmitter) {
            super(obj, [
                ...ParticleEmitterComponent.ALL_CODE_PROPS,
                ...ParticleEmitterComponent.PREVIEW_PROPS
            ]);

            // init all the "virtual" fields with the default values
            const properties = [
                ...ParticleEmitterComponent.CONFIG_PROPS_SETS.flatMap(s => s.list),
                ...ParticleEmitterComponent.SIMPLE_CONFIG_PROPS
            ];

            for (const prop of properties) {

                obj[prop.name] = prop.defValue;
            }
        }

        private migrateLegacyEditorData(data: Record<string, any>) {

            if (!ParticleEmitterComponent.LEGACY_KEYS.some(key => data[key] !== undefined)) {

                return;
            }

            // legacy (pre-ConfigValueType) data used flat fields on the emitter

            data["configTexture"] = read(data, "editorTexture", "");

            const legacyFrame = read(data, "editorFrame", "");
            data["configFrame"] = legacyFrame === "" ? [] : [legacyFrame];

            data["_animationKey"] = read(data, "editorAnimationKey", "");

            data["quantity_type"] = ConfigValueType.Static;
            data["quantity_value"] = read(data, "editorQuantity", 1);

            const oldDefaults: Record<string, [any, any]> = {
                speed: [0, 0],
                angle: [0, 360],
                lifespan: [1000, 1000],
                scale: [1, 1],
                alpha: [1, 1]
            };

            const flatPairs: Record<string, [string, string]> = {
                speed: ["speedMin", "speedMax"],
                angle: ["angleMin", "angleMax"],
                lifespan: ["lifespanMin", "lifespanMax"],
                scale: ["scaleStart", "scaleEnd"],
                alpha: ["alphaStart", "alphaEnd"]
            };

            for (const name of ["speed", "angle", "lifespan", "scale", "alpha"]) {

                const [k1, k2] = flatPairs[name];
                const [d1, d2] = oldDefaults[name];
                const a = read(data, k1, d1);
                const b = read(data, k2, d2);

                if (a === b) {

                    data[`${name}_type`] = ConfigValueType.Static;
                    data[`${name}_value`] = a;

                } else if (name === "scale" || name === "alpha") {

                    data[`${name}_type`] = ConfigValueType.StartEndRandom;
                    data[`${name}_start`] = a;
                    data[`${name}_end`] = b;
                    data[`${name}_ease`] = "Linear";
                    data[`${name}_randomFlag`] = false;

                } else {

                    data[`${name}_type`] = ConfigValueType.MinMax;
                    data[`${name}_min`] = a;
                    data[`${name}_max`] = b;
                    data[`${name}_int`] = false;
                }
            }

            data["_gravityX"] = read(data, "gravityX", 0);
            data["_gravityY"] = read(data, "gravityY", 0);

            for (const key of ParticleEmitterComponent.LEGACY_KEYS) {

                delete data[key];
            }
        }

        readJSON(ser: core.json.Serializer) {

            const obj = this.getObject();

            this.migrateLegacyEditorData(ser.getData() as any);

            obj.disableUpdateConfig(true);

            super.readJSON(ser);

            obj.disableUpdateConfig(false);

            obj.updateConfig();
        }

        writeJSON(ser: core.json.Serializer) {

            super.writeJSON(ser);

            // delete all properties of property sets that are type None

            const data = ser.getData() as any;

            for (const set of ParticleEmitterComponent.CONFIG_PROPS_SETS) {

                const type = set.props.type.getValue(this.getObject());

                if (type === ConfigValueType.None) {

                    for (const prop of set.list) {

                        delete data[prop.name];
                    }
                }
            }
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();
            const objES = obj.getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                let unlocked = false;

                for (const prop of ParticleEmitterComponent.ALL_CODE_PROPS) {

                    if (objES.isUnlockedProperty(prop)) {

                        unlocked = true;
                        break;
                    }
                }

                if (unlocked) {

                    // don't use the compiler config for code because it only contains the unlocked properties,
                    // for this case, we need all the properties
                    const config = objES.generateConfig();

                    const methodCallDom = new code.MethodCallCodeDOM("setConfig", args.objectVarName);

                    methodCallDom.arg(code.stringifyJSON(config));

                    args.statements.push(methodCallDom);
                }
            }
        }
    }
}
