/// <reference path="./BaseSection.ts" />

namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class AssetReimportSection extends BaseSection {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.AssetReimportSection", "Source / Reimport");
        }

        canEdit(obj: any, n: number): boolean {

            return n === 1 && (obj instanceof core.ImageAssetPackItem
                || obj instanceof core.SpritesheetAssetPackItem);
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);
            const button = this.createButton(comp, "Reimport Source", async () => {

                const item = this.getSelectionFirstElement();

                if (!item) {
                    return;
                }

                button.disabled = true;
                status.textContent = "Reimporting source…";

                try {
                    await this.getEditor().reimportItem_async(item);
                    const metadata = item.getData()[core.SpriteAssetMetadata.DATA_KEY];
                    const conflictCount = metadata && Array.isArray(metadata.conflicts)
                        ? metadata.conflicts.length : 0;

                    status.textContent = conflictCount > 0
                        ? `Reimport complete. ${conflictCount} metadata conflict(s) need review.`
                        : "Reimport complete. Existing frame settings were preserved where compatible.";
                } catch (error) {
                    status.textContent = `Reimport failed: ${error instanceof Error ? error.message : String(error)}`;
                } finally {
                    button.disabled = false;
                    this.updateWithSelection();
                }
            });

            const status = document.createElement("div");
            status.style.gridColumn = "1 / span 2";
            status.style.whiteSpace = "normal";
            comp.appendChild(status);

            this.addUpdater(() => {

                const item = this.getSelectionFirstElement();
                const url = item && item.getData().url;
                const file = typeof url === "string" ? item.getFileFromAssetUrl(url) : null;

                button.disabled = !file || !file.isFile();

                const metadata = item && item.getData()[core.SpriteAssetMetadata.DATA_KEY];
                const conflicts = metadata && Array.isArray(metadata.conflicts)
                    ? metadata.conflicts : [];
                const orphaned = metadata && Array.isArray(metadata.orphanedFrames)
                    ? metadata.orphanedFrames : [];
                const conflictSummary = conflicts.length > 0
                    ? ` Reimport conflicts: ${conflicts.map((conflict: any) =>
                        `${conflict.frameKey}: ${conflict.message}`).join(" ")} Archived frame settings: ${orphaned.length}.`
                    : "";

                status.textContent = file
                    ? `Source: ${file.getName()} · ${file.getSize()} bytes.${conflictSummary}`
                    : "Source file is not available in this project.";
            });
        }
    }
}
