namespace phasereditor2d.scene.ui.editor.outline {

    import controls = colibri.ui.controls;
    import ide = colibri.ui.ide;

    export class SceneEditorOutlineProvider extends ide.EditorViewerProvider {

        private _editor: SceneEditor;

        constructor(editor: SceneEditor) {
            super();
            this._editor = editor;
        }

        fillContextMenu(menu: controls.Menu) {

            this._editor.fillContextMenu(menu);
        }

        getUndoManager() {

            return this._editor.getUndoManager();
        }

        getContentProvider(): controls.viewers.ITreeContentProvider {

            return new SceneEditorOutlineContentProvider(this._editor);
        }

        getLabelProvider(): controls.viewers.ILabelProvider {

            return new SceneEditorOutlineLabelProvider();
        }

        getStyledLabelProvider() {

            return new SceneEditorOutlineStyledLabelProvider();
        }

        getCellRendererProvider(): controls.viewers.ICellRendererProvider {

            return new SceneEditorOutlineRendererProvider();
        }

        getTreeViewerRenderer(viewer: controls.viewers.TreeViewer): controls.viewers.TreeViewerRenderer {

            return new SceneEditorOutlineViewerRenderer(viewer);
        }

        setViewer(viewer: controls.viewers.TreeViewer) {

            super.setViewer(viewer);

            // shows an icon in the gutter of each row, to render or not the object in the editor.

            viewer.setGutterIconProvider(obj => {

                if (!sceneobjects.isGameObject(obj)) {

                    return null;
                }

                const objES = (obj as sceneobjects.ISceneGameObject).getEditorSupport();

                if (!objES.isDisplayObject()) {

                    return null;
                }

                return colibri.ColibriPlugin.getInstance().getIcon(
                    objES.isEditorRender() ? colibri.ICON_CHECKED : colibri.ICON_CONTROL_CLOSE);

            }, () => 1, obj => {

                if (!sceneobjects.isGameObject(obj)) {

                    return;
                }

                const gameObject = obj as sceneobjects.ISceneGameObject;

                const objES = gameObject.getEditorSupport();

                if (!objES.isDisplayObject()) {

                    return;
                }

                this._editor.getUndoManager().add(
                    new undo.EditorRenderOperation(this._editor, [gameObject], !objES.isEditorRender()));
            });
        }

        getPropertySectionProvider(): controls.properties.PropertySectionProvider {

            return this._editor.getPropertyProvider();
        }

        getInput() {

            return this._editor;
        }

        preload(): Promise<void> {
            return;
        }

        onViewerSelectionChanged(selection: any[]) {

            this._editor.setSelection(selection, false);
            this._editor.repaint();
        }
    }
}