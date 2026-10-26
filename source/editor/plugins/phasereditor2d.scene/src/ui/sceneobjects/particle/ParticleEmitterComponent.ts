/// <reference path="../Component.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import write = colibri.core.json.write;

    export class ParticleEmitterComponent extends Component<ParticleEmitter> {

        // editor data properties

        static texture: IProperty<ParticleEmitter> = {
            name: "editorTexture",
            label: "Texture Key",
            tooltip: "The key of the texture used by the particles.",
            defValue: "",
            getValue: obj => obj.editorTexture,
            setValue: (obj, value) => {

                obj.editorTexture = value;

                ParticleEmitterComponent.applyConfig(obj);
            }
        };

        static frame: IProperty<ParticleEmitter> = {
            name: "editorFrame",
            label: "Frame",
            tooltip: "The frame of the texture used by the particles.",
            defValue: "",
            getValue: obj => obj.editorFrame,
            setValue: (obj, value) => {

                obj.editorFrame = value;

                ParticleEmitterComponent.applyConfig(obj);
            }
        };

        static animationKey: IProperty<ParticleEmitter> = {
            name: "editorAnimationKey",
            label: "Animation",
            tooltip: "The key of the animation played by the particles.",
            defValue: "",
            getValue: obj => obj.editorAnimationKey,
            setValue: (obj, value) => {

                obj.editorAnimationKey = value;

                ParticleEmitterComponent.applyConfig(obj);
            }
        };

        static quantity: IProperty<ParticleEmitter> = {
            name: "editorQuantity",
            label: "Quantity",
            tooltip: "The number of particles released at each emission.",
            defValue: 1,
            getValue: obj => obj.editorQuantity,
            setValue: (obj, value) => {

                obj.editorQuantity = value;

                ParticleEmitterComponent.applyConfig(obj);
            }
        };

        // emitter configuration properties

        static speedMin = SimpleProperty("speedMin", 0, "Min",
            "The minimum speed of the particles.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static speedMax = SimpleProperty("speedMax", 0, "Max",
            "The maximum speed of the particles.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static speed: IPropertyXY = {
            label: "Speed",
            tooltip: "phaser:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig.speed",
            x: ParticleEmitterComponent.speedMin,
            y: ParticleEmitterComponent.speedMax
        };

        static angleMin = SimpleProperty("angleMin", 0, "Min",
            "The minimum angle of the particles.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static angleMax = SimpleProperty("angleMax", 360, "Max",
            "The maximum angle of the particles.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static angle: IPropertyXY = {
            label: "Angle",
            tooltip: "phaser:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig.angle",
            x: ParticleEmitterComponent.angleMin,
            y: ParticleEmitterComponent.angleMax
        };

        static gravityX = SimpleProperty("gravityX", 0, "X",
            "The horizontal gravity applied to the particles.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static gravityY = SimpleProperty("gravityY", 0, "Y",
            "The vertical gravity applied to the particles.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static gravity: IPropertyXY = {
            label: "Gravity",
            tooltip: "phaser:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig.gravityX",
            x: ParticleEmitterComponent.gravityX,
            y: ParticleEmitterComponent.gravityY
        };

        static lifespanMin = SimpleProperty("lifespanMin", 1000, "Min",
            "The minimum lifespan of the particles, in ms.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static lifespanMax = SimpleProperty("lifespanMax", 1000, "Max",
            "The maximum lifespan of the particles, in ms.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static lifespan: IPropertyXY = {
            label: "Lifespan",
            tooltip: "phaser:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig.lifespan",
            x: ParticleEmitterComponent.lifespanMin,
            y: ParticleEmitterComponent.lifespanMax
        };

        static scaleStart = SimpleProperty("scaleStart", 1, "Start",
            "The scale of the particles at the start of their life.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static scaleEnd = SimpleProperty("scaleEnd", 1, "End",
            "The scale of the particles at the end of their life.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static scale: IPropertyXY = {
            label: "Scale",
            tooltip: "phaser:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig.scale",
            x: ParticleEmitterComponent.scaleStart,
            y: ParticleEmitterComponent.scaleEnd
        };

        static alphaStart = SimpleProperty("alphaStart", 1, "Start",
            "The alpha of the particles at the start of their life.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static alphaEnd = SimpleProperty("alphaEnd", 1, "End",
            "The alpha of the particles at the end of their life.",
            false, obj => ParticleEmitterComponent.applyConfig(obj));

        static alpha: IPropertyXY = {
            label: "Alpha",
            tooltip: "phaser:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig.alpha",
            x: ParticleEmitterComponent.alphaStart,
            y: ParticleEmitterComponent.alphaEnd
        };

        static allProperties = [
            ParticleEmitterComponent.texture,
            ParticleEmitterComponent.frame,
            ParticleEmitterComponent.animationKey,
            ParticleEmitterComponent.quantity,
            ParticleEmitterComponent.speedMin,
            ParticleEmitterComponent.speedMax,
            ParticleEmitterComponent.angleMin,
            ParticleEmitterComponent.angleMax,
            ParticleEmitterComponent.gravityX,
            ParticleEmitterComponent.gravityY,
            ParticleEmitterComponent.lifespanMin,
            ParticleEmitterComponent.lifespanMax,
            ParticleEmitterComponent.scaleStart,
            ParticleEmitterComponent.scaleEnd,
            ParticleEmitterComponent.alphaStart,
            ParticleEmitterComponent.alphaEnd
        ];

        constructor(obj: ParticleEmitter) {
            super(obj, ParticleEmitterComponent.allProperties);
        }

        /**
         * Build the Phaser particle emitter configuration from the authored properties.
         * The default values are skipped.
         *
         * @param obj The emitter.
         * @returns The configuration object.
         */
        static buildConfig(obj: ParticleEmitter): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {

            const config = {} as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

            // frame

            if (obj.editorFrame) {

                write(config, "frame", obj.editorFrame, "");
            }

            // animation

            if (obj.editorAnimationKey) {

                write(config, "anim", obj.editorAnimationKey, "");
            }

            // speed

            if (obj.speedMin === obj.speedMax) {

                write(config, "speed", obj.speedMin, 0);

            } else {

                write(config, "speed", { min: obj.speedMin, max: obj.speedMax }, null);
            }

            // angle: skip the default 0..360 range

            if (obj.angleMin !== 0 || obj.angleMax !== 360) {

                if (obj.angleMin === obj.angleMax) {

                    write(config, "angle", obj.angleMin, 0);

                } else {

                    write(config, "angle", { min: obj.angleMin, max: obj.angleMax }, null);
                }
            }

            // lifespan

            if (obj.lifespanMin === obj.lifespanMax) {

                write(config, "lifespan", obj.lifespanMin, 1000);

            } else {

                write(config, "lifespan", { min: obj.lifespanMin, max: obj.lifespanMax }, null);
            }

            // scale

            if (obj.scaleStart !== 1 || obj.scaleEnd !== 1) {

                if (obj.scaleStart === obj.scaleEnd) {

                    write(config, "scale", obj.scaleStart, 1);

                } else {

                    write(config, "scale", { start: obj.scaleStart, end: obj.scaleEnd }, null);
                }
            }

            // alpha

            if (obj.alphaStart !== 1 || obj.alphaEnd !== 1) {

                if (obj.alphaStart === obj.alphaEnd) {

                    write(config, "alpha", obj.alphaStart, 1);

                } else {

                    write(config, "alpha", { start: obj.alphaStart, end: obj.alphaEnd }, null);
                }
            }

            // gravity

            write(config, "gravityX", obj.gravityX, 0);
            write(config, "gravityY", obj.gravityY, 0);

            // emission

            write(config, "quantity", obj.editorQuantity, 1);

            return config;
        }

        /**
         * Apply the authored properties to the underlying Phaser emitter.
         *
         * @param obj The emitter.
         */
        static applyConfig(obj: ParticleEmitter) {

            obj.setConfig(ParticleEmitterComponent.buildConfig(obj));
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            // nothing, the emitter configuration is passed
            // as an argument of the factory method call
        }
    }
}
