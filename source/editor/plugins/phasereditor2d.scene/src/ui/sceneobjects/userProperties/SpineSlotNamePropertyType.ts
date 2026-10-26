/// <reference path="./AbstractDialogPropertyType.ts" />
/// <reference path="../spine/SpineUtils.ts" />
/// <reference path="../spine/SpineSkinCellRenderer.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export interface SpineSlotItem {

        spineAsset: pack.core.SpineAssetPackItem;
        slotName: string;
    }

    function getSkin(spineAsset: pack.core.SpineAssetPackItem): pack.core.SpineSkinItem {

        const skins = spineAsset.getGuessSkinItems();

        return skins[Math.floor(skins.length / 2)];
    }

    /**
     * This property type allows selecting a slot of a Spine skeleton asset.
     * The value is the name of the slot.
     */
    export class SpineSlotNamePropertyType extends AbstractDialogPropertyType {

        static async getSpineSlotItems(): Promise<SpineSlotItem[]> {

            const result: SpineSlotItem[] = [];

            const packs = await pack.core.AssetPackUtils.getAllPacks();

            for (const thePack of packs) {

                for (const item of thePack.getItems()) {

                    if (item instanceof pack.core.SpineAssetPackItem) {

                        await item.preload();

                        const skeleton = item.getGuessSkeleton();

                        if (skeleton) {

                            for (const slot of skeleton.slots) {

                                result.push({
                                    spineAsset: item,
                                    slotName: slot.name
                                });
                            }
                        }
                    }
                }
            }

            return result;
        }

        constructor() {

            super({
                id: "spine-slot-name",
                name: "Spine Slot Name",
                dialogTitle: "Select Spine Slot",
                hasCustomIcon: true
            });
        }

        protected async createViewer(): Promise<controls.viewers.TreeViewer> {

            const viewer = new controls.viewers.TreeViewer("SpineSlotNamePropertyType");

            viewer.setLabelProvider(new SlotLabelProvider());
            viewer.setStyledLabelProvider(new SlotStyledCellLabelProvider());
            viewer.setCellRendererProvider(new controls.viewers.EmptyCellRendererProvider(
                (element) => new SlotCellRenderer()));
            viewer.setContentProvider(new controls.viewers.ArrayTreeContentProvider());
            viewer.setCellSize(64, true);

            return viewer;
        }

        protected valueToString(viewer: controls.viewers.TreeViewer, value: SpineSlotItem): string {

            return value.slotName;
        }

        protected async loadViewerInput(viewer: controls.viewers.TreeViewer): Promise<void> {

            const input = await SpineSlotNamePropertyType.getSpineSlotItems();

            viewer.setInput(input);
        }

        protected async updateIcon(iconControl: controls.IconControl, value: string): Promise<void> {

            const slotItems = await SpineSlotNamePropertyType.getSpineSlotItems();

            const sameNameSlotItems = slotItems.filter(i => i.slotName === value);

            if (sameNameSlotItems.length === 1) {

                const [slotItem] = sameNameSlotItems;

                const skin = getSkin(slotItem.spineAsset);

                if (skin) {

                    const img = SpineUtils.getSpineSkinItemImage(skin);

                    if (img) {

                        await img.preload();
                    }

                    iconControl.setIcon(img);

                    return;
                }
            }

            iconControl.setIcon(resources.getIcon(resources.ICON_SPINE));
        }
    }

    class SlotCellRenderer extends SpineSkinCellRenderer {

        protected getSkinItem(args: controls.viewers.RenderCellArgs | controls.viewers.PreloadCellArgs)
            : pack.core.SpineSkinItem {

            const slot = args.obj as SpineSlotItem;

            return getSkin(slot.spineAsset);
        }
    }

    class SlotLabelProvider implements controls.viewers.ILabelProvider {

        getLabel(obj: SpineSlotItem): string {

            return obj.slotName + " - " + obj.spineAsset.getKey();
        }
    }

    class SlotStyledCellLabelProvider implements controls.viewers.IStyledLabelProvider {

        getStyledTexts(obj: SpineSlotItem, dark: boolean): controls.viewers.IStyledText[] {

            const theme = controls.Controls.getTheme();

            return [
                {
                    color: theme.viewerForeground,
                    text: obj.slotName
                },
                {
                    color: theme.viewerForeground + "90",
                    text: " - " + obj.spineAsset.getKey()
                }
            ];
        }
    }
}
