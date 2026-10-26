namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class EffectsComponent extends Component<ISceneGameObject> {

        constructor(obj: ISceneGameObject) {
            super(obj, []);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {
            // In Phaser 4 the FX "padding" pipeline property was removed
            // (each Phaser.Filters.Controller computes its own padding),
            // so there is nothing to generate here.
        }
    }
}
