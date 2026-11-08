namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;

    export class TextureAtlasPreviewSection extends controls.properties.PropertySection<any> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.properties.TextureAtlasPreviewSection", "Texture Atlas Preview", true);
        }

        createForm(parent: HTMLDivElement) {
            const comp = this.createGridElement(parent, 1);
            const label = document.createElement("div");
            label.textContent = "shortcut: compressed texture atlas preview requires runtime support (KTX2/PVR) not in Phaser 4.2.1";
            label.style.padding = "10px";
            label.style.color = "var(--viewer-foreground)";
            comp.appendChild(label);
        }

        canEdit(obj: any, n: number): boolean {
            return obj instanceof core.TextureAtlasAssetPackItem;
        }

        canEditNumber(n: number): boolean {
            return n === 1;
        }
    }
}