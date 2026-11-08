namespace phasereditor2d.scene.ui.dialogs {

    import controls = colibri.ui.controls;

    export class OpenSceneToolbarExtension extends phasereditor2d.ide.ui.DesignWindowToolbarExtension {

        constructor() {
            super(5);
        }

        fillToolbar(toolbar: controls.ToolbarManager) {

            toolbar.addCommand(ui.editor.commands.CMD_OPEN_SCENE_FILE, {
                showText: false
            });
        }
    }
}
