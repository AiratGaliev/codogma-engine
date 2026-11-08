/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterTransformSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterTransformSection", "Particle Emitter - Transform", [
                ParticleEmitterComponent.x,
                ParticleEmitterComponent.y,
                ParticleEmitterComponent.moveToX,
                ParticleEmitterComponent.moveToY,
                ParticleEmitterComponent.scale,
                ParticleEmitterComponent.scaleX,
                ParticleEmitterComponent.scaleY,
                ParticleEmitterComponent.angle,
                ParticleEmitterComponent.rotate,
            ]);
        }
    }
}
