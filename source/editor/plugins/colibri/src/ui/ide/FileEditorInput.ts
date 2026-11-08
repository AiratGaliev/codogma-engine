namespace colibri.core.io {

    export interface FilePath extends colibri.ui.ide.IEditorInput {
        // nothing
    }

    FilePath.prototype.getEditorInputExtension = () => ui.ide.FileEditorInputExtension.ID;
}
