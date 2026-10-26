/// <reference path="./BaseSection.ts" />

namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class ImageCompressedTexturesSection extends BaseSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page,
                "phasereditor2d.pack.ui.editor.properties.ImageCompressedTexturesSection",
                "Compressed Textures",
                core.IMAGE_TYPE);
        }

        canEdit(obj: any, n: number) {

            return super.canEdit(obj, n)
                && ((obj instanceof core.ImageAssetPackItem && !(obj instanceof core.SvgAssetPackItem))
                    || obj instanceof core.SpritesheetAssetPackItem);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 4);

            comp.style.gridTemplateColumns = "auto 1fr auto auto";

            for (const format of core.COMPRESSED_TEXTURE_FORMATS) {

                this.createVariantRow(comp, format);
            }

            const note = this.createLabel(comp,
                "The loader emits the standard image URL; the variants are metadata for export pipelines.");

            note.style.gridColumn = "1 / span 4";
        }

        private createVariantRow(comp: HTMLElement, format: core.ImageCompressedTextureFormat) {

            const displayName = format.toUpperCase();

            this.createLabel(comp, displayName,
                "Compressed texture variant of the image, in " + displayName + " format.");

            const text = this.createText(comp, false);

            text.addEventListener("change", () => {

                const url = text.value.trim();

                this.changeCompressedVariant(format, url.length === 0 ? undefined : url);
            });

            this.addUpdater(() => {

                const url = this.getVariantUrl(format);

                text.value = url === undefined ? "" : url;
            });

            const icon = colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_FOLDER);

            this.createButton(comp, icon, () => {

                this.browseFile_onlyContentType("Select " + displayName + " File",
                    webContentTypes.core.CONTENT_TYPE_IMAGE, (files) => {

                        const file = files[0];

                        const url = this.getPack().getUrlFromAssetFile(file);

                        this.changeCompressedVariant(format, url);
                    });
            });

            this.createButton(comp, "Clear", () => {

                this.changeCompressedVariant(format, undefined);
            });
        }

        private getVariantUrl(format: string): string {

            const item = this.getSelectionFirstElement() as core.AssetPackItem;

            const variant = core.CompressedTextureVariants.getVariants(item.getData())
                .find(v => v.format === format);

            return variant === undefined ? undefined : variant.url;
        }

        private changeCompressedVariant(format: core.ImageCompressedTextureFormat, url: string | undefined) {

            const item = this.getSelectionFirstElement() as core.AssetPackItem;

            // compute the whole next `compressed` map, so the undo operation
            // can add/remove the field as a single step.
            const map: Record<string, string> = {};

            for (const variant of core.CompressedTextureVariants.getVariants(item.getData())) {

                map[variant.format] = variant.url;
            }

            if (url === undefined || url.length === 0) {

                delete map[format];

            } else {

                map[format] = url;
            }

            const value = Object.keys(map).length === 0 ? undefined : map;

            this.changeItemField("compressed", value, true);
        }
    }
}
