/// <reference path="../object/properties/SceneGameObjectSection.ts" />
/// <reference path="../object/SceneGameObjectOperation.ts" />
/// <reference path="./ParticleEmitterComponent.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;
    import pack = phasereditor2d.pack.core;

    const CURRENT_TEXTURE = "Current Texture";
    const ALL_TEXTURES = "All Textures";

    export class ParticleEmitterSetFrameOperation extends SceneGameObjectOperation<ParticleEmitter> {

        getValue(obj: ParticleEmitter) {

            return { texture: obj.configTexture, frame: obj.configFrame };
        }

        setValue(obj: ParticleEmitter, value: any) {

            const editor = this.getEditor();

            const finder = editor.getPackFinder();

            const item = finder.findAssetPackItem(value.texture);

            if (item) {

                item.addToPhaserCache(editor.getGame(), this.getScene().getPackCache());
            }

            obj.configTexture = value.texture;
            obj.configFrame = value.frame;

            obj.updateConfig();

            editor.refreshDependenciesHash();
            editor.repaint();
        }
    }

    class FramesViewerRenderer extends controls.viewers.GridTreeViewerRenderer {

        constructor(viewer: controls.viewers.TreeViewer) {
            super(viewer, false);

            this.setSectionCriteria(obj => obj === CURRENT_TEXTURE || obj === ALL_TEXTURES);
            this.setShadowChildCriteria(obj => obj instanceof controls.ImageFrame);
            this.setPaintItemShadow(true);
        }
    }

    class RendererProvider extends phasereditor2d.pack.ui.viewers.AssetPackCellRendererProvider {

        constructor() {
            super("grid");
        }

        getCellRenderer(element: any): controls.viewers.ICellRenderer {

            if (element === CURRENT_TEXTURE || element === ALL_TEXTURES) {

                return new controls.viewers.IconImageCellRenderer(
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_FOLDER));
            }

            return super.getCellRenderer(element);
        }
    }

    export class FramesViewer extends controls.viewers.TreeViewer {

        constructor(finder: pack.PackFinder, currentAtlas: pack.ImageFrameContainerAssetPackItem) {
            super("phasereditor2d.scene.ui.sceneobjects.FramesViewer");

            this.setCellRendererProvider(new RendererProvider());
            this.setLabelProvider(new phasereditor2d.pack.ui.viewers.AssetPackLabelProvider());
            this.setContentProvider(new FramesContentProvider(finder, currentAtlas));
            this.setTreeRenderer(new FramesViewerRenderer(this));
        }
    }

    class FramesContentProvider extends phasereditor2d.pack.ui.viewers.AssetPackContentProvider {

        private _currentAtlas: pack.ImageFrameContainerAssetPackItem;
        private _finder: pack.PackFinder;

        constructor(finder: pack.PackFinder, currentAtlas: pack.ImageFrameContainerAssetPackItem) {
            super();

            this._currentAtlas = currentAtlas;
            this._finder = finder;
        }

        getRoots(input: any) {

            if (this._currentAtlas) {

                return [CURRENT_TEXTURE, ALL_TEXTURES];
            }

            return this.getAll();
        }

        getChildren(parent: any) {

            if (parent === CURRENT_TEXTURE) {

                return this._currentAtlas.getFrames();

            } else if (parent === ALL_TEXTURES) {

                return this.getAll().filter(item => item !== this._currentAtlas);
            }

            return super.getChildren(parent);
        }

        private getAll() {

            return this._finder
                .getAssets()
                .filter(item => item instanceof pack.ImageFrameContainerAssetPackItem)
                .filter(item => !(item instanceof pack.SpineAtlasAssetPackItem || item instanceof pack.SpineBinaryAssetPackItem))
                .map(item => item instanceof pack.ImageAssetPackItem ? item.getFrames()[0] : item);
        }
    }

    export class AddParticleEmitterFrameDialog extends controls.dialogs.ViewerDialog {

        private _callback: (selection: any[]) => void;

        constructor(finder: pack.PackFinder, currentAtlas: pack.ImageFrameContainerAssetPackItem, callback: (selection: any[]) => void) {
            super(new FramesViewer(finder, currentAtlas), true);

            this._callback = callback;

            this.setSize(window.innerWidth / 2, window.innerHeight * 0.7, true);
        }

        create(hideParentDialog?: boolean): void {

            super.create(hideParentDialog);

            this.setTitle("Add Frames");

            const viewer = this.getViewer();

            viewer.setInput([]);
            viewer.expandRoots();

            const btn = this.addOpenButton("Add", sel => {

                this._callback(this.getViewer().getSelection());
            });

            viewer.eventSelectionChanged.addListener(() => {

                const sel = viewer.getSelection();

                let disabled = false;

                for (const elem of sel) {

                    if (!(elem instanceof pack.AssetPackImageFrame)) {

                        disabled = true;
                        break;
                    }
                }

                if (!disabled) {

                    // check all frames are from the same texture

                    let texture: pack.AssetPackItem;

                    for (const elem of sel) {

                        const frame = elem as pack.AssetPackImageFrame;

                        if (!texture) {

                            texture = frame.getPackItem();

                        } else if (frame.getPackItem() !== texture) {

                            disabled = true;
                            break;
                        }
                    }
                }

                btn.disabled = disabled;
            });

            this.addCancelButton();
        }
    }

    export class ParticleEmitterTextureSection extends SceneGameObjectSection<ParticleEmitter> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.ParticleEmitterTextureSection", "Particle Emitter - Frames", false);
        }

        createForm(parent: HTMLElement) {

            parent.style.gridTemplateRows = "200px auto";

            // frames

            const viewerPane = document.createElement("div");

            const viewer = new controls.viewers.TreeViewer("phasereditor2d.scene.ui.sceneobjects.ParticleEmitterFrameViewer");

            viewer.setContentProvider(new controls.viewers.ArrayTreeContentProvider());
            viewer.setLabelProvider(new phasereditor2d.pack.ui.viewers.AssetPackLabelProvider());
            viewer.setCellRendererProvider(new phasereditor2d.pack.ui.viewers.AssetPackCellRendererProvider("grid"));
            viewer.setTreeRenderer(new controls.viewers.GridTreeViewerRenderer(viewer, false, true)
                .setPaintItemShadow(true));

            const filteredViewer = new colibri.ui.ide.properties.FilteredViewerInPropertySection(this.getPage(), viewer, true);

            viewerPane.appendChild(filteredViewer.getElement());

            // frames toolbar

            const buttonsPane = document.createElement("div");
            buttonsPane.style.display = "grid";
            buttonsPane.style.alignItems = "center";
            buttonsPane.style.gap = "5px";
            buttonsPane.style.padding = "5px";
            buttonsPane.style.gridTemplateColumns = "auto 1fr auto";

            this.createLock(buttonsPane, ParticleEmitterComponent.texture, ParticleEmitterComponent.frame);

            const addButton = this.createButton(buttonsPane, "Add", () => this.onAddFrame());

            const deleteBtn = this.createButton(buttonsPane, "Delete", async () => this.onDeleteFrame(viewer));

            this.addUpdater(() => {

                deleteBtn.disabled = true;
                addButton.disabled = !this.isUnlocked(ParticleEmitterComponent.frame);
            });

            viewer.eventSelectionChanged.addListener(() => {

                if (!this.isUnlocked(ParticleEmitterComponent.frame)) {

                    return;
                }

                deleteBtn.disabled = viewer.getSelection().length === 0;
            });

            viewer.getElement().addEventListener("keydown", (e: KeyboardEvent) => {

                if (!this.isUnlocked(ParticleEmitterComponent.frame)) {

                    return;
                }

                if (e.code === "Delete" || e.code === "Backspace") {

                    e.preventDefault();
                    e.stopImmediatePropagation();

                    this.onDeleteFrame(viewer);
                }
            });

            parent.appendChild(viewerPane);

            // updater

            this.addUpdater(async () => {

                const emitter = this.getSelectionFirstElement() as ParticleEmitter;

                if (!emitter) {

                    viewer.setInput([]);
                    viewer.repaint();
                    return;
                }

                const input = await this.getUsedFrames(emitter);

                viewer.setInput(input);

                filteredViewer.resizeTo();
            });

            parent.appendChild(buttonsPane);
        }

        private async onDeleteFrame(viewer: controls.viewers.TreeViewer) {

            const obj = this.getSelectionFirstElement() as ParticleEmitter;

            if (!obj) {

                return;
            }

            let frames: string[];
            let texture = obj.configTexture;

            const sel = viewer.getSelection() as any[];

            if (sel.length === 0) {

                return;
            }

            if (obj.configFrame.length === 0 && sel.length === 1) {

                // it doesn't have frames, so we can delete the texture

                texture = "__MISSING";
                frames = [];

            } else {

                // filter off the selected frames

                const selectedNames = sel.map(frame => frame.getName());

                const set = new Set(selectedNames);

                frames = obj.configFrame.filter(frame => !set.has(frame));
            }

            this.getEditor()
                .getUndoManager()
                .add(new ParticleEmitterSetFrameOperation(this.getEditor(), this.getSelection(), {
                    texture,
                    frame: frames
                }));

            // update viewer

            const input = await this.getUsedFrames(obj);

            viewer.setInput(input);
            viewer.repaint();
        }

        private async onAddFrame() {

            const emitter = this.getSelectionFirstElement() as ParticleEmitter;

            if (!emitter) {

                return;
            }

            const finder = new pack.PackFinder();

            await finder.preload();

            let textureAsset = finder.findAssetPackItem(emitter.configTexture);

            if (!(textureAsset instanceof pack.ImageFrameContainerAssetPackItem)) {

                textureAsset = undefined;
            }

            const callback = async (sel: pack.AssetPackImageFrame[]) => {

                if (sel.length === 0) {

                    return;
                }

                // check all frames are from the same texture

                const selTexture = sel[0].getPackItem();
                const selFrameNames = sel.map(frame => frame.getName());

                let frame;

                if (selTexture === textureAsset) {

                    frame = [...emitter.configFrame, ...selFrameNames];

                } else {

                    if (emitter.configTexture !== "__MISSING") {

                        if (!await controls.dialogs.ConfirmDialog.show(
                            "You selected frames from a different texture. Do you want to change the texture?", "Replace")) {

                            return;
                        }
                    }

                    frame = sel.map(frame => frame.getName());
                }

                if (selTexture instanceof pack.ImageAssetPackItem) {

                    frame = [];
                }

                this.getEditor()
                    .getUndoManager()
                    .add(new ParticleEmitterSetFrameOperation(this.getEditor(), this.getSelection(), {
                        texture: selTexture.getKey(),
                        frame
                    }));
            };

            const dlg = new AddParticleEmitterFrameDialog(finder, textureAsset as any, callback);

            dlg.create();
        }

        private async getUsedFrames(emitter: ParticleEmitter) {

            const finder = new pack.PackFinder();

            await finder.preload();

            const textureAsset = finder.findAssetPackItem(emitter.configTexture);

            let input: any[] = [];

            if (textureAsset instanceof pack.ImageAssetPackItem) {

                input = [textureAsset.getFrames()[0]];

            } else if (textureAsset instanceof pack.ImageFrameContainerAssetPackItem) {

                input = emitter.configFrame
                    .map((frame) => textureAsset.findFrame(frame))
                    .filter(frame => Boolean(frame));
            }

            return input;
        }

        canEdit(obj: any, n: number): boolean {

            if (GameObjectEditorSupport.hasEditorSupport(obj)) {

                return obj instanceof ParticleEmitter;
            }

            return false;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
