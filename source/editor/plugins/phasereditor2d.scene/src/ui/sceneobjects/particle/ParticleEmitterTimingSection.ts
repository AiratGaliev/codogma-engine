/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterTimingSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterTimingSection", "Particle Emitter - Timing", [
                ParticleEmitterComponent.delay,
                ParticleEmitterComponent.hold,
                ParticleEmitterComponent.lifespan,
                ParticleEmitterComponent.quantity,
            ]);
        }

        createSimpleProperties(parent: HTMLElement) {

            this.createNumberProperty(parent, ParticleEmitterComponent.duration);
            this.createNumberProperty(parent, ParticleEmitterComponent.frequency);
            this.createNumberProperty(parent, ParticleEmitterComponent.maxAliveParticles);
            this.createNumberProperty(parent, ParticleEmitterComponent.maxParticles);
            this.createNumberProperty(parent, ParticleEmitterComponent.stopAfter);
            this.createNumberProperty(parent, ParticleEmitterComponent.advance);
            this.createNumberProperty(parent, ParticleEmitterComponent.timeScale);
        }
    }
}
