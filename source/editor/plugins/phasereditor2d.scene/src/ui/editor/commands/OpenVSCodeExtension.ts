namespace phasereditor2d.scene.ui.editor.commands {

    import controls = colibri.ui.controls;

    export class OpenVSCodeExtension extends phasereditor2d.ide.ui.DesignWindowToolbarExtension {

        constructor() {
            super(5);
        }

        fillToolbar(toolbar: controls.ToolbarManager) {

            toolbar.addCommand(phasereditor2d.ide.ui.actions.CMD_OPEN_VSCODE, {
                showText: false
            });
        }
    }
}
