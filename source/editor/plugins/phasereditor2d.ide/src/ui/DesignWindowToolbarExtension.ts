namespace phasereditor2d.ide.ui {

    import controls = colibri.ui.controls;

    export class DesignWindowToolbarExtension extends colibri.Extension {

        static POINT_ID = "phasereditor2d.ide.ui.DesignWindowToolbarExtension";

        constructor(priority = 10) {

            super(DesignWindowToolbarExtension.POINT_ID, priority);
        }

        fillToolbar(toolbar: controls.ToolbarManager) {
            // ignored
        }
    }
}
