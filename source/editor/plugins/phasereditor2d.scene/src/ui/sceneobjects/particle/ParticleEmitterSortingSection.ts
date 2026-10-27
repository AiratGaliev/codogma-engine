/// <reference path="./ParticleEmitterConfigSection.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterSortingSection extends ParticleEmitterConfigSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterSortingSection", "Particle Emitter - Sorting", []);
        }

        createSimpleProperties(parent: HTMLElement) {

            this.createPropertyBoolean(parent, ParticleEmitterComponent.particleBringToTop);
            this.createPropertyBoolean(parent, ParticleEmitterComponent.sortOrderAsc);
            this.createPropertyStringRow(parent, ParticleEmitterComponent.sortProperty);
        }
    }
}
