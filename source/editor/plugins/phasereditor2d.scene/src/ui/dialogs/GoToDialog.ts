namespace phasereditor2d.scene.ui.dialogs {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;
    import ide = colibri.ui.ide;
    import code = phasereditor2d.ide.core.code;
    import sceneobjects = phasereditor2d.scene.ui.sceneobjects;
    import blocks = phasereditor2d.scene.ui.blocks;
    import usercomponent = phasereditor2d.scene.ui.editor.usercomponent;
    import pack = phasereditor2d.pack;
    import corejson = phasereditor2d.scene.core.json;

    const SCENES_ROOT = "Scenes";
    const PREFABS_ROOT = "Prefabs";
    const SCRIPTS_ROOT = "Script Nodes";
    const ASSET_PACKS_ROOT = "Asset Packs";
    const USER_COMPONENTS_ROOT = "User Components";
    const ANIMATIONS_ROOT = "Animations";

    const ROOTS = [
        SCENES_ROOT,
        PREFABS_ROOT,
        SCRIPTS_ROOT,
        ASSET_PACKS_ROOT,
        USER_COMPONENTS_ROOT,
        ANIMATIONS_ROOT
    ];

    const ROOT_SET = new Set(ROOTS);

    export class UserComponentNode {

        file: io.FilePath;
        component: usercomponent.UserComponent;

        constructor(file: io.FilePath, component: usercomponent.UserComponent) {

            this.file = file;
            this.component = component;
        }
    }

    export class AnimationFileNode {

        file: io.FilePath;
        names: AnimationNameNode[] = [];

        constructor(file: io.FilePath) {

            this.file = file;
        }

        async preload(): Promise<void> {

            try {

                const str = await ide.FileUtils.preloadAndGetFileString(this.file);

                const data = JSON.parse(str);

                this.names = data.anims.map((anim: any) => new AnimationNameNode(this.file, anim.key));

            } catch (e) {

                console.log(e);
            }
        }
    }

    export class AnimationNameNode {

        file: io.FilePath;
        name: string;

        constructor(file: io.FilePath, name: string) {

            this.file = file;
            this.name = name;
        }
    }

    class GoToContentProvider implements controls.viewers.ITreeContentProvider {

        private _sceneFinder: corejson.SceneFinder;
        private _packFinder: pack.core.PackFinder;
        private _animationFiles: AnimationFileNode[];
        private _cache = new Map<io.FilePath, UserComponentNode[]>();
        private _scriptsContentProvider: sceneobjects.ScriptsContentProvider;

        constructor(sceneFinder: corejson.SceneFinder, packFinder: pack.core.PackFinder, animationFiles: AnimationFileNode[]) {

            this._sceneFinder = sceneFinder;
            this._packFinder = packFinder;
            this._animationFiles = animationFiles;
            this._scriptsContentProvider = new sceneobjects.ScriptsContentProvider();
        }

        getRoots(input: any): any[] {

            return ROOTS.filter(root => this.getChildren(root).length > 0);
        }

        getChildren(parent: any): any[] {

            if (parent === SCENES_ROOT) {

                return this._sceneFinder.getSceneFiles().filter(file => !this._sceneFinder.isPrefabFile(file));
            }
            else if (parent === PREFABS_ROOT) {

                return this._sceneFinder.getSceneFiles().filter(file =>
                    this._sceneFinder.isPrefabFile(file) && !this._sceneFinder.isScriptPrefabFile(file));
            }
            else if (parent === SCRIPTS_ROOT) {

                // Use getRoots of ScriptsContentProvider which returns [ScriptNodeExtension, ...folders]
                const roots = this._scriptsContentProvider.getRoots([]);
                return roots.filter(r => r !== sceneobjects.ScriptNodeExtension.getInstance());
            }
            else if (parent === ASSET_PACKS_ROOT) {

                return this._packFinder.getPacks();
            }
            else if (parent instanceof pack.core.AssetPack) {

                const types = pack.AssetPackPlugin.getInstance().getAssetPackItemTypes();

                const items = [...parent.getItems()];

                items.sort((a, b) => {

                    const aa = types.indexOf(a.getType());
                    const bb = types.indexOf(b.getType());

                    return aa - bb;
                });

                return items;
            }
            else if (parent === ANIMATIONS_ROOT) {

                return this._animationFiles;
            }
            else if (parent instanceof AnimationFileNode) {

                return parent.names;
            }
            else if (parent === USER_COMPONENTS_ROOT) {

                return this._sceneFinder.getUserComponentsFiles();
            }
            else if (parent instanceof io.FilePath && this._sceneFinder.getUserComponentsFiles().some(f => f.getFullName() === parent.getFullName())) {

                if (this._cache.has(parent)) {

                    return this._cache.get(parent)!;
                }

                const result = this._sceneFinder.getUserComponentsByFile(parent)
                    .getComponents()
                    .map(c => new UserComponentNode(parent, c));

                this._cache.set(parent, result);

                return result;
            }
            else if (parent instanceof io.FilePath && parent.isFolder()) {

                return this._scriptsContentProvider.getChildren(parent);
            }

            return [];
        }
    }

    class GoToLabelProvider implements controls.viewers.ILabelProvider {

        private _scriptsLabelProvider = new sceneobjects.ScriptStyledLabelProvider();

        getLabel(obj: any): string {

            if (ROOT_SET.has(obj)) {

                return obj;
            }

            if (obj instanceof UserComponentNode) {

                return obj.component.getDisplayNameOrName();
            }

            if (obj instanceof AnimationFileNode) {

                return obj.file.getProjectRelativeName();
            }

            if (obj instanceof AnimationNameNode) {

                return obj.name;
            }

            if (obj instanceof io.FilePath) {

                return this._scriptsLabelProvider.getStyledTexts(obj, false)[0]?.text ?? obj.getName();
            }

            // fallback for AssetPack, AssetPackItem, etc.
            if (obj instanceof pack.core.AssetPackItem) {

                return obj.getKey();
            }

            if (obj instanceof pack.core.AssetPack) {

                return obj.getFile().getName();
            }

            return new blocks.SceneEditorBlocksLabelProvider().getLabel(obj);
        }
    }

    class GoToCellRendererProvider implements controls.viewers.ICellRendererProvider {

        getCellRenderer(element: any): controls.viewers.ICellRenderer {

            if (ROOT_SET.has(element)) {

                return new controls.viewers.IconImageCellRenderer(
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_FOLDER));
            }

            if (element instanceof UserComponentNode) {

                return new controls.viewers.IconImageCellRenderer(
                    resources.getIcon(resources.ICON_USER_COMPONENT));
            }

            if (element instanceof AnimationFileNode || element instanceof AnimationNameNode) {

                return new controls.viewers.IconImageCellRenderer(
                    resources.getIcon(resources.ICON_ANIMATIONS));
            }

            if (element instanceof pack.core.AssetPackItem) {

                const provider = new pack.ui.viewers.AssetPackCellRendererProvider("tree");
                return provider.getCellRenderer(element);
            }

            return new controls.viewers.IconImageCellRenderer(
                colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_FILE));
        }

        preload(args: controls.viewers.PreloadCellArgs): Promise<controls.PreloadResult> {

            return controls.Controls.resolveNothingLoaded();
        }
    }

    class GoToTreeRenderer extends controls.viewers.TreeViewerRenderer {

        constructor(viewer: controls.viewers.TreeViewer) {

            super(viewer);
        }
    }

    export class GoToDialog extends controls.dialogs.ViewerDialog {

        constructor() {

            super(new controls.viewers.TreeViewer("phasereditor2d.scene.ui.dialogs.GoToDialog"), true);

            this.setSize(900, 500, true);
        }

        override async create(hideParentDialog: boolean) {

            super.create(hideParentDialog);

            this.setTitle("Go To...");

            const viewer = this.getViewer();

            const sceneFinder = ScenePlugin.getInstance().getSceneFinder();

            const packFinder = new pack.core.PackFinder();

            await packFinder.preload();

            const animationFiles = await this.findAnimationFiles();

            viewer.setContentProvider(new GoToContentProvider(sceneFinder, packFinder, animationFiles));

            viewer.setLabelProvider(new GoToLabelProvider());

            viewer.setCellRendererProvider(new GoToCellRendererProvider());

            viewer.setTreeRenderer(new GoToTreeRenderer(viewer));

            viewer.setInput([]);

            viewer.expandRoots();

            this.enableButtonOnlyWhenOneElementIsSelected(this.addOpenButton("Open", () => {

                const obj = viewer.getSelectionFirstElement();

                this.openElement(obj);

            }), obj => {

                if (obj instanceof io.FilePath) {

                    return obj.isFile();
                }

                if (typeof obj === "string") {

                    return false;
                }

                return true;
            });

            this.addCancelButton();
        }

        private openElement(obj: any) {

            const wb = colibri.Platform.getWorkbench();

            if (obj instanceof pack.core.AssetPack) {

                wb.openEditor(obj.getFile());

            } else if (obj instanceof pack.core.AssetPackItem) {

                const file = obj.getPack().getFile();

                const editor = wb.openEditor(file);

                if (editor && "revealKey" in editor) {

                    (editor as any).revealKey(obj.getKey());
                }

            } else if (obj instanceof UserComponentNode) {

                const editor = wb.openEditor(obj.file);

                if (editor && "revealComponent" in editor) {

                    (editor as any).revealComponent(obj.component.getName());
                }

            } else if (obj instanceof AnimationFileNode) {

                wb.openEditor(obj.file);

            } else if (obj instanceof AnimationNameNode) {

                const editor = wb.openEditor(obj.file);

                if (editor && "selectAnimationByKey" in editor) {

                    (editor as any).selectAnimationByKey(obj.name);
                }

            } else if (obj instanceof io.FilePath) {

                wb.openEditor(obj);
            }
        }

        private async findAnimationFiles(): Promise<AnimationFileNode[]> {

            const nodes: AnimationFileNode[] = [];

            const wb = colibri.Platform.getWorkbench();

            await wb.getProjectRoot().visitAsync(async (file) => {

                const type = await wb.getContentTypeRegistry().preloadAndGetContentType(file);

                if (type === pack.core.contentTypes.CONTENT_TYPE_ANIMATIONS) {

                    const node = new AnimationFileNode(file);

                    await node.preload();

                    nodes.push(node);
                }
            });

            return nodes;
        }
    }
}