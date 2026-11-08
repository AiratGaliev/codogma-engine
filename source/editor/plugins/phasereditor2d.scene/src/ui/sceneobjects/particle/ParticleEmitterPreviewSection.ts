/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterPreviewSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterPreviewSection", "Particle Emitter - Preview", []);
        }

        createSimpleProperties(parent: HTMLElement) {

            this.createPropertyBoolean(parent, ParticleEmitterComponent.previewActive);
            this.createNumberProperty(parent, ParticleEmitterComponent.previewAdvance);
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
