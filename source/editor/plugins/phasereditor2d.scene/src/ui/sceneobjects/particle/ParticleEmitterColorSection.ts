/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterColorSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterTintSection", "Particle Emitter - Color", [
                ParticleEmitterComponent.alpha,
                ParticleEmitterComponent.tint,
                ParticleEmitterComponent.color,
            ]);
        }

        createSimpleProperties(parent: HTMLElement) {

            this.createPropertyEnumRow(parent, ParticleEmitterComponent.colorEase);
            this.createPropertyEnumRow(parent, ParticleEmitterComponent.blendMode);
            this.createPropertyBoolean(parent, ParticleEmitterComponent.tintFill);
        }
    }
}
