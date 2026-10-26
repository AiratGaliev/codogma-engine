/// <reference path="../../editor/outline/SceneEditorOutlineExtension.ts"/>

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class EditableTilemapOutlineExtension extends editor.outline.SceneEditorOutlineExtension {

        isLabelProviderFor(element: any): boolean {

            return EditableTilemap.isTilesetInfo(element);
        }

        getLabelProvider(): colibri.ui.controls.viewers.ILabelProvider {

            return new controls.viewers.LabelProvider(obj => {

                if (EditableTilemap.isTilesetInfo(obj)) {

                    return (obj as IEditableTilesetInfo).name;
                }

                return "";
            });
        }

        isCellRendererProviderFor(element: any): boolean {

            return this.isLabelProviderFor(element);
        }

        getCellRendererProvider(): colibri.ui.controls.viewers.ICellRendererProvider {

            return new controls.viewers.EmptyCellRendererProvider(obj => {

                const tileset = obj as IEditableTilesetInfo;

                if (EditableTilemap.isTilesetInfo(obj) && tileset.imageKey) {

                    const editor = colibri.Platform.getWorkbench().getActiveEditor();

                    if (editor instanceof ui.editor.SceneEditor) {

                        const cache = editor.getScene().getPackCache();

                        const image = cache.getImage(tileset.imageKey)
                            || cache.getSpritesheetImage(tileset.imageKey);

                        if (image) {

                            return new controls.viewers.ImageCellRenderer(image);
                        }
                    }
                }

                return new controls.viewers.EmptyCellRenderer(false);
            });
        }

        isContentProviderFor(parent: any): boolean {

            return parent instanceof EditableTilemap;
        }

        getContentProvider(): colibri.ui.controls.viewers.ITreeContentProvider {

            return new EditableTilemapOutlineContentProvider();
        }
    }

    class EditableTilemapOutlineContentProvider implements controls.viewers.ITreeContentProvider {

        getRoots(input: any): any[] {

            return [];
        }

        getChildren(parent: any): any[] {

            if (parent instanceof EditableTilemap) {

                return parent.getTilesets();
            }

            return [];
        }
    }
}
