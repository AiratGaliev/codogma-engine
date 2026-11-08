/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterFollowSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterFollowSection", "Particle Emitter - Follow", []);
        }

        createSimpleProperties(parent: HTMLElement) {

            this.createPropertyObjectVar(parent, ParticleEmitterComponent.follow);
            this.createPropertyBoolean(parent, ParticleEmitterComponent.trackVisible);
        }
    }
}
