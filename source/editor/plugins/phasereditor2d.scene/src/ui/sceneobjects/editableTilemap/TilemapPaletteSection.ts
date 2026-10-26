namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class TilemapPaletteSection extends editor.properties.BaseSceneSection<any> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.TilemapPaletteSection";

        private _tilesetSelect: HTMLSelectElement;
        private _layerSelect: HTMLSelectElement;
        private _canvas: HTMLCanvasElement;
        private _zoomLabel: HTMLSpanElement;
        private _zoom = 2;
        private _panX = 0;
        private _panY = 0;
        private _selectStart: { x: number, y: number };
        private _selectCurrent: { x: number, y: number };
        private _panStart: { x: number, y: number, panX: number, panY: number };

        constructor(page: controls.properties.PropertyPage) {
            super(page, TilemapPaletteSection.SECTION_ID, "Tilemap Palette", false, false);
        }

        protected getSectionHelpPath() {

            return "scene-editor/editable-tilemap-object.html";
        }

        /**
         * The tilemap of the current selection, or of the brush state.
         */
        private getTilemap(): EditableTilemap {

            const scene = this.getEditor()?.getScene();

            if (!scene) {

                return null;
            }

            for (const obj of this.getSelection()) {

                if (obj instanceof EditableTilemap) {

                    return obj;
                }

                if (obj instanceof EditableTilemapLayer) {

                    return obj.getTilemap();
                }

                if (EditableTilemap.isTilesetInfo(obj)) {

                    for (const plainObj of scene.getPlainObjects()) {

                        if (plainObj instanceof EditableTilemap
                            && plainObj.getTilesets().indexOf(obj) >= 0) {

                            return plainObj;
                        }
                    }
                }
            }

            return null;
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);

            {
                // tileset picker

                this.createLabel(comp, "Tileset", "The tileset used as source of the brush.");

                this._tilesetSelect = document.createElement("select");
                this._tilesetSelect.style.gridColumn = "2";
                comp.appendChild(this._tilesetSelect);

                this._tilesetSelect.addEventListener("change", () => {

                    EditableTilemapBrush.setTilesetName(this._tilesetSelect.value);

                    this.repaint();
                });
            }

            {
                // layer picker

                this.createLabel(comp, "Layer", "The layer where the tools paint the tiles.");

                this._layerSelect = document.createElement("select");
                this._layerSelect.style.gridColumn = "2";
                comp.appendChild(this._layerSelect);

                this._layerSelect.addEventListener("change", () => {

                    EditableTilemapBrush.setLayerName(this._layerSelect.value);

                    this.getEditor().repaint();
                });
            }

            {
                // canvas

                this._canvas = document.createElement("canvas");
                this._canvas.style.width = "100%";
                this._canvas.style.height = "220px";
                this._canvas.style.gridColumn = "1 / span 2";
                this._canvas.style.borderRadius = "3px";
                comp.appendChild(this._canvas);

                this._canvas.addEventListener("mousedown", e => this.onMouseDown(e));
                this._canvas.addEventListener("mousemove", e => this.onMouseMove(e));
                window.addEventListener("mouseup", e => this.onMouseUp(e));
                this._canvas.addEventListener("wheel", e => this.onWheel(e));
            }

            {
                // zoom buttons

                const zoomBar = this.createGridElement(comp, 5);
                zoomBar.style.gridColumn = "1 / span 2";
                zoomBar.style.gridTemplateColumns = "auto auto auto 1fr auto";

                const zoomIn = this.createButton(zoomBar, "", () => this.setZoom(this._zoom * 1.25));
                zoomIn.appendChild(new controls.IconControl(
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_ZOOM_IN)).getCanvas());

                const zoomOut = this.createButton(zoomBar, "", () => this.setZoom(this._zoom / 1.25));
                zoomOut.appendChild(new controls.IconControl(
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_ZOOM_OUT)).getCanvas());

                const zoomReset = this.createButton(zoomBar, "", () => this.setZoom(2));
                zoomReset.appendChild(new controls.IconControl(
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_ZOOM_RESET)).getCanvas());

                this._zoomLabel = document.createElement("span");
                this._zoomLabel.style.alignSelf = "center";
                zoomBar.appendChild(this._zoomLabel);

                const hint = document.createElement("span");
                hint.innerText = "drag: brush · wheel: zoom · Alt+drag: pan";
                hint.style.opacity = "0.6";
                hint.style.fontSize = "smaller";
                hint.style.textAlign = "right";
                zoomBar.appendChild(hint);
            }

            this.addUpdater(() => this.updateUI());
        }

        private setZoom(zoom: number) {

            this._zoom = Math.min(16, Math.max(0.1, zoom));

            this.repaint();
        }

        private updateUI() {

            const tilemap = this.getTilemap();

            const fillSelect = (select: HTMLSelectElement, options: Array<{ value: string, label: string }>, value: string) => {

                select.innerHTML = "";

                for (const option of options) {

                    const opt = document.createElement("option");
                    opt.value = option.value;
                    opt.textContent = option.label;
                    select.appendChild(opt);
                }

                select.disabled = options.length === 0;

                if (options.find(o => o.value === value)) {

                    select.value = value;
                } else if (options.length > 0) {

                    select.value = options[0].value;
                }
            };

            if (!tilemap) {

                fillSelect(this._tilesetSelect, [], "");
                fillSelect(this._layerSelect, [], "");

                EditableTilemapBrush.setTilemapId(undefined);

                this.repaint();

                return;
            }

            EditableTilemapBrush.setTilemapId(tilemap.getEditorSupport().getId());

            if (!EditableTilemapBrush.getTileset(tilemap)) {

                EditableTilemapBrush.setTilesetName(tilemap.getTilesets()[0]?.name);
            }

            if (!EditableTilemapBrush.getTilemap(this.getEditor().getScene())) {

                EditableTilemapBrush.setTilemapId(tilemap.getEditorSupport().getId());
            }

            fillSelect(this._tilesetSelect,
                tilemap.getTilesets().map(tileset => ({ value: tileset.name, label: tileset.name })),
                EditableTilemapBrush.getTilesetName());

            EditableTilemapBrush.setTilesetName(this._tilesetSelect.value);

            // sync the layer with the selected layer game object (if any)

            const selLayer = this.getSelection().find(obj => obj instanceof EditableTilemapLayer) as EditableTilemapLayer;

            if (selLayer && selLayer.getTilemap() === tilemap) {

                EditableTilemapBrush.setLayerName(selLayer.getLayerName());
            }

            if (!EditableTilemapBrush.getTargetLayer(this.getEditor().getScene())) {

                EditableTilemapBrush.setLayerName(tilemap.getLayers()[0]?.name);
            }

            fillSelect(this._layerSelect,
                tilemap.getLayers().map(layer => ({ value: layer.name, label: layer.name })),
                EditableTilemapBrush.getLayerName());

            EditableTilemapBrush.setLayerName(this._layerSelect.value);

            this.repaint();
        }

        private getTileset(): IEditableTilesetInfo {

            const tilemap = this.getTilemap();

            if (!tilemap) {

                return null;
            }

            return tilemap.getTilesetByName(EditableTilemapBrush.getTilesetName());
        }

        private getImage(): controls.IImage {

            const tileset = this.getTileset();

            if (tileset?.imageKey) {

                const scene = this.getEditor().getScene();

                return scene.getPackCache().getImage(tileset.imageKey)
                    || scene.getPackCache().getSpritesheetImage(tileset.imageKey);
            }

            return null;
        }

        private toTilePoint(e: MouseEvent) {

            const tileset = this.getTileset();

            if (!tileset) {

                return { x: 0, y: 0 };
            }

            return {
                x: Math.floor((e.offsetX - this._panX) / (tileset.tileWidth * this._zoom)),
                y: Math.floor((e.offsetY - this._panY) / (tileset.tileHeight * this._zoom))
            };
        }

        private onMouseDown(e: MouseEvent) {

            if (e.button !== 0) {

                return;
            }

            if (e.altKey) {

                this._panStart = {
                    x: e.offsetX,
                    y: e.offsetY,
                    panX: this._panX,
                    panY: this._panY
                };

                return;
            }

            const point = this.toTilePoint(e);

            this._selectStart = point;
            this._selectCurrent = point;

            this.repaint();
        }

        private onMouseMove(e: MouseEvent) {

            if (this._panStart) {

                this._panX = this._panStart.panX + (e.offsetX - this._panStart.x);
                this._panY = this._panStart.panY + (e.offsetY - this._panStart.y);

                this.repaint();

                return;
            }

            if (this._selectStart) {

                this._selectCurrent = this.toTilePoint(e);

                this.repaint();
            }
        }

        private onMouseUp(e: MouseEvent) {

            if (this._panStart) {

                this._panStart = null;

                return;
            }

            if (this._selectStart) {

                const tileset = this.getTileset();

                if (tileset) {

                    const x2 = this._selectCurrent ?? this._selectStart;

                    const x = Math.min(this._selectStart.x, x2.x);
                    const y = Math.min(this._selectStart.y, x2.y);
                    const w = Math.abs(x2.x - this._selectStart.x) + 1;
                    const h = Math.abs(x2.y - this._selectStart.y) + 1;

                    EditableTilemapBrush.setRect(x, y, w, h);
                }

                this._selectStart = null;
                this._selectCurrent = null;

                this.repaint();
            }
        }

        private onWheel(e: WheelEvent) {

            e.preventDefault();

            this.setZoom(this._zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        }

        private async repaint() {

            if (!this._canvas) {

                return;
            }

            this._zoomLabel.textContent = Math.round(this._zoom * 100) + "%";

            const tileset = this.getTileset();

            const image = this.getImage();

            const canvas = this._canvas;

            canvas.width = Math.max(100, canvas.clientWidth);
            canvas.height = Math.max(100, canvas.clientHeight);

            const ctx = canvas.getContext("2d");

            ctx.save();

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#3a3a3a";

            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!tileset || !image) {

                ctx.restore();

                return;
            }

            await image.preload();
            await image.preloadSize();

            const imgWidth = image.getWidth();
            const imgHeight = image.getHeight();

            image.paint(ctx, this._panX, this._panY, imgWidth * this._zoom, imgHeight * this._zoom, false);

            // the tile grid

            ctx.strokeStyle = "#00000030";
            ctx.lineWidth = 1;

            const stepW = tileset.tileWidth * this._zoom;
            const stepH = tileset.tileHeight * this._zoom;

            if (stepW >= 3 && stepH >= 3) {

                const startX = this._panX + tileset.margin * this._zoom;
                const startY = this._panY + tileset.margin * this._zoom;
                const endX = startX + (imgWidth - tileset.margin * 2) * this._zoom;
                const endY = startY + (imgHeight - tileset.margin * 2) * this._zoom;

                for (let x = startX; x <= endX; x += stepW) {

                    ctx.beginPath();
                    ctx.moveTo(Math.floor(x) + 0.5, Math.max(0, this._panY));
                    ctx.lineTo(Math.floor(x) + 0.5, Math.min(canvas.height, this._panY + imgHeight * this._zoom));
                    ctx.stroke();
                }

                for (let y = startY; y <= endY; y += stepH) {

                    ctx.beginPath();
                    ctx.moveTo(Math.max(0, this._panX), Math.floor(y) + 0.5);
                    ctx.lineTo(Math.min(canvas.width, this._panX + imgWidth * this._zoom), Math.floor(y) + 0.5);
                    ctx.stroke();
                }
            }

            // the brush highlight

            const rect = EditableTilemapBrush.getRect();

            ctx.strokeStyle = "#29adff";
            ctx.fillStyle = "#29adff30";
            ctx.lineWidth = 2;

            const bx = this._panX + rect.x * stepW;
            const by = this._panY + rect.y * stepH;
            const bw = rect.w * stepW;
            const bh = rect.h * stepH;

            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh);

            // the selecting rect

            if (this._selectStart) {

                const a = this._selectStart;
                const b = this._selectCurrent ?? a;

                const x = Math.min(a.x, b.x);
                const y = Math.min(a.y, b.y);
                const w = Math.abs(b.x - a.x) + 1;
                const h = Math.abs(b.y - a.y) + 1;

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;

                ctx.strokeRect(
                    this._panX + x * stepW, this._panY + y * stepH, w * stepW, h * stepH);
            }

            ctx.restore();
        }

        canEdit(obj: any, n: number): boolean {

            if (n !== 1) {

                return false;
            }

            return obj instanceof EditableTilemap
                || obj instanceof EditableTilemapLayer
                || EditableTilemap.isTilesetInfo(obj);
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
