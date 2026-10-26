namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXObjectSection extends SceneGameObjectSection<FXObject> {

        constructor(page: colibri.ui.controls.properties.PropertyPage) {
            super(page, "phasereditor2d.scene.ui.sceneobjects.FXObjectSection", "Filter", false, true);
        }

        createForm(parent: HTMLDivElement): void {

            const comp = this.createGridElement(parent, 2);

            this.createLabel(comp, "Change Filter List", "Change the filter to a different list (Internal or External).");

            const btn = this.createMenuButton(comp, "", () => [
                {
                    name: "Internal",
                    value: "preFX"
                },
                {
                    name: "External",
                    value: "postFX"
                }
            ], value => {

                const op = new editor.undo.SceneSnapshotOperation(this.getEditor(), async () => {

                    const ids = this.getSelection()
                        .map(obj => obj.getEditorSupport().getId());

                    const isPreFX = value === "preFX";

                    const syncObjects = new Set<ISceneGameObject>();

                    for (const obj of this.getSelection()) {

                        obj.setPreFX(isPreFX);

                        syncObjects.add(obj.getParent());
                    }

                    for (const obj of syncObjects) {

                        this.recreateEffects(obj);
                    }

                    this.getEditor().getSelectionManager().setSelectionByIds(ids);
                });

                this.getEditor().getUndoManager().add(op);
            });

            this.addUpdater(() => {

                const preFX = this.flatValues_BooleanAnd(this.getSelection().map(obj => obj.isPreFX()));

                // Phaser 4 terminology: filters.internal / filters.external.
                // The underlying preFX flag is kept for serialization compatibility.
                btn.textContent = preFX ? "Internal" : "External";
            });
        }

        private recreateEffects(obj: ISceneGameObject) {

            const objES = obj.getEditorSupport();

            const data: any = {};

            objES.writeJSON(data);

            const img = obj as any as Phaser.GameObjects.Image;

            if (img.filters) {

                img.filters.internal.clear();
                img.filters.external.clear();
            }

            objES.readJSON(data);
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof FXObject;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}