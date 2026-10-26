/// <reference path="./AbstractDialogPropertyType.ts" />
/// <reference path="../spine/SpineUtils.ts" />
/// <reference path="../spine/SpineSkinCellRenderer.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    function getSkin(spineAsset: pack.core.SpineAssetPackItem): pack.core.SpineSkinItem {

        const skins = spineAsset.getGuessSkinItems();

        return skins[Math.floor(skins.length / 2)];
    }

    /**
     * This property type allows selecting an event of a Spine skeleton asset.
     * The value is the name of the event.
     */
    export class SpineEventPropertyType extends AbstractDialogPropertyType {

        constructor() {

            super({
                id: "spine-event",
                name: "Spine Event",
                dialogTitle: "Select Spine Event",
                hasCustomIcon: true
            });
        }

        protected async createViewer(): Promise<controls.viewers.TreeViewer> {

            const viewer = new controls.viewers.TreeViewer("SpineEventPropertyType");

            viewer.setLabelProvider(new EventLabelProvider());
            viewer.setStyledLabelProvider(new EventStyledCellLabelProvider());
            viewer.setCellRendererProvider(new controls.viewers.EmptyCellRendererProvider(
                (element) => new EventCellRenderer()));
            viewer.setContentProvider(new controls.viewers.ArrayTreeContentProvider());
            viewer.setCellSize(64, true);

            return viewer;
        }

        protected valueToString(viewer: controls.viewers.TreeViewer, value: pack.core.SpineEventItem): string {

            return value.eventName;
        }

        protected async loadViewerInput(viewer: controls.viewers.TreeViewer): Promise<void> {

            const input = await SpineUtils.getSpineEventItems();

            viewer.setInput(input);
        }

        protected async updateIcon(iconControl: controls.IconControl, value: string): Promise<void> {

            const eventItems = await SpineUtils.getSpineEventItems();

            const sameNameEventItems = eventItems.filter(i => i.eventName === value);

            if (sameNameEventItems.length === 1) {

                const [eventItem] = sameNameEventItems;

                const skin = getSkin(eventItem.spineAsset);

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

    class EventCellRenderer extends SpineSkinCellRenderer {

        protected getSkinItem(args: controls.viewers.RenderCellArgs | controls.viewers.PreloadCellArgs)
            : pack.core.SpineSkinItem {

            const event = args.obj as pack.core.SpineEventItem;

            return getSkin(event.spineAsset);
        }
    }

    class EventLabelProvider implements controls.viewers.ILabelProvider {

        getLabel(obj: pack.core.SpineEventItem): string {

            return obj.eventName + " - " + obj.spineAsset.getKey();
        }
    }

    class EventStyledCellLabelProvider implements controls.viewers.IStyledLabelProvider {

        getStyledTexts(obj: pack.core.SpineEventItem, dark: boolean): controls.viewers.IStyledText[] {

            const theme = controls.Controls.getTheme();

            return [
                {
                    color: theme.viewerForeground,
                    text: obj.eventName
                },
                {
                    color: theme.viewerForeground + "90",
                    text: " - " + obj.spineAsset.getKey()
                }
            ];
        }
    }
}
