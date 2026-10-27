/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterPhysicsSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterPhysicsSection", "Particle Emitter - Physics", [
                ParticleEmitterComponent.accelerationX,
                ParticleEmitterComponent.accelerationY,
                ParticleEmitterComponent.maxVelocityX,
                ParticleEmitterComponent.maxVelocityY,
                ParticleEmitterComponent.speed,
                ParticleEmitterComponent.speedX,
                ParticleEmitterComponent.speedY,
            ]);
        }

        createSimpleProperties(parent: HTMLElement) {

            this.createNumberProperty(parent, ParticleEmitterComponent.gravityX);
            this.createNumberProperty(parent, ParticleEmitterComponent.gravityY);
            this.createPropertyBoolean(parent, ParticleEmitterComponent.radial);
        }
    }
}
