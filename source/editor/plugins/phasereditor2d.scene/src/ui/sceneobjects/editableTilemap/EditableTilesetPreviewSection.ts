namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class EditableTilesetPreviewSection extends editor.properties.BaseSceneSection<IEditableTilesetInfo> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.EditableTilesetPreviewSection";

        private _zoom = 1;
        private _canvas: HTMLCanvasElement;
        private _zoomLabel: HTMLSpanElement;

        constructor(page: controls.properties.PropertyPage) {
            super(page, EditableTilesetPreviewSection.SECTION_ID, "Tileset Preview", true, false);
        }

        hasMenu() {

            return false;
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 1);

            this._canvas = document.createElement("canvas");
            this._canvas.style.width = "100%";
            this._canvas.style.height = "180px";
            this._canvas.style.borderRadius = "3px";
            comp.appendChild(this._canvas);

            this._canvas.addEventListener("wheel", e => {

                e.preventDefault();

                this.setZoom(this._zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
            });

            const zoomBar = this.createGridElement(comp, 3);

            const zoomIn = this.createButton(zoomBar, "", () => this.setZoom(this._zoom * 1.25));
            zoomIn.appendChild(new controls.IconControl(
                colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_ZOOM_IN)).getCanvas());

            const zoomOut = this.createButton(zoomBar, "", () => this.setZoom(this._zoom / 1.25));
            zoomOut.appendChild(new controls.IconControl(
                colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_ZOOM_OUT)).getCanvas());

            this._zoomLabel = document.createElement("span");
            this._zoomLabel.style.alignSelf = "center";
            zoomBar.appendChild(this._zoomLabel);

            this.addUpdater(() => this.repaint());
        }

        private setZoom(zoom: number) {

            this._zoom = Math.min(8, Math.max(0.1, zoom));

            this.repaint();
        }

        private getImage(): controls.IImage {

            const tileset = this.getSelectionFirstElement() as IEditableTilesetInfo;

            if (tileset?.imageKey) {

                const scene = this.getEditor()?.getScene();

                if (scene) {

                    return scene.getPackCache().getImage(tileset.imageKey)
                        || scene.getPackCache().getSpritesheetImage(tileset.imageKey);
                }
            }

            return null;
        }

        private async repaint() {

            const tileset = this.getSelectionFirstElement() as IEditableTilesetInfo;

            if (!tileset || !this._canvas) {

                return;
            }

            this._zoomLabel.textContent = Math.round(this._zoom * 100) + "%";

            const image = this.getImage();

            const canvas = this._canvas;

            const ctx = canvas.getContext("2d");

            ctx.save();

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#404040";

            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!image) {

                ctx.restore();

                return;
            }

            await image.preload();
            await image.preloadSize();

            const imgWidth = image.getWidth();
            const imgHeight = image.getHeight();

            canvas.width = Math.max(100, canvas.clientWidth);
            canvas.height = Math.max(100, canvas.clientHeight);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#404040";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            image.paint(ctx, 0, 0, imgWidth * this._zoom, imgHeight * this._zoom, false);

            // the tile grid

            ctx.strokeStyle = "#ff000040";
            ctx.lineWidth = 1;

            const stepW = tileset.tileWidth * this._zoom;
            const stepH = tileset.tileHeight * this._zoom;

            const startX = tileset.margin * this._zoom;
            const startY = tileset.margin * this._zoom;
            const endX = startX + (imgWidth - tileset.margin * 2) * this._zoom;
            const endY = startY + (imgHeight - tileset.margin * 2) * this._zoom;

            if (stepW >= 3 && stepH >= 3) {

                for (let x = startX; x <= endX; x += stepW) {

                    ctx.beginPath();
                    ctx.moveTo(Math.floor(x) + 0.5, 0);
                    ctx.lineTo(Math.floor(x) + 0.5, canvas.height);
                    ctx.stroke();
                }

                for (let y = startY; y <= endY; y += stepH) {

                    ctx.beginPath();
                    ctx.moveTo(0, Math.floor(y) + 0.5);
                    ctx.lineTo(canvas.width, Math.floor(y) + 0.5);
                    ctx.stroke();
                }
            }

            ctx.restore();
        }

        canEdit(obj: any, n: number): boolean {

            return EditableTilemap.isTilesetInfo(obj);
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
